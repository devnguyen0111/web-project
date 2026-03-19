import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { MongoTransactionService } from '../../common/services/mongo-transaction.service';
import { MinioService } from '../../minio/minio.service';
import { WalletService } from '../../wallet/wallet.service';
import { Order, OrderStatus, StoreProductType } from './schemas/order.schema';
import { OrdersService } from './orders.service';

const buildQuery = <T>(result: T) => ({
  session: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(result),
});

describe('OrdersService', () => {
  let service: OrdersService;
  let orderModel: {
    findById: jest.Mock;
    findOne: jest.Mock;
    countDocuments: jest.Mock;
    aggregate: jest.Mock;
    create: jest.Mock;
  };
  let productModel: {
    findById: jest.Mock;
  };
  let connection: {
    startSession: jest.Mock;
  };
  let walletService: {
    purchase: jest.Mock;
    refund: jest.Mock;
  };
  let minioService: {
    getPresignedGetUrl: jest.Mock;
  };
  let mongoTransactionService: MongoTransactionService;

  beforeEach(() => {
    orderModel = {
      findById: jest.fn(),
      findOne: jest.fn(),
      countDocuments: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
    };
    productModel = {
      findById: jest.fn(),
    };
    connection = {
      startSession: jest.fn(),
    };
    walletService = {
      purchase: jest.fn(),
      refund: jest.fn(),
    };
    minioService = {
      getPresignedGetUrl: jest.fn(),
    };
    mongoTransactionService = new MongoTransactionService(
      {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService,
    );

    service = new OrdersService(
      orderModel as unknown as Model<Order>,
      productModel as unknown as Model<any>,
      connection as never,
      walletService as unknown as WalletService,
      minioService as unknown as MinioService,
      mongoTransactionService,
    );
  });

  it('creates a delivered digital order and charges the wallet once', async () => {
    const session = {
      withTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(session);
    session.withTransaction.mockImplementation(
      async (callback: () => Promise<void>) => {
        await callback();
      },
    );

    const product = {
      _id: new Types.ObjectId(),
      sellerId: new Types.ObjectId(),
      name: 'Digital Handbook',
      slug: 'digital-handbook',
      type: StoreProductType.DIGITAL,
      price: 120,
      status: 'active',
      stock: 5,
      files: [
        {
          filename: 'handbook.pdf',
          storagePath: 'products/handbook.pdf',
          size: 1024,
          mimeType: 'application/pdf',
        },
      ],
      save: jest.fn().mockResolvedValue(undefined),
    };
    const purchaseTransaction = { _id: new Types.ObjectId() };
    const createdOrder = {
      id: 'order-1',
      status: OrderStatus.DELIVERED,
      deliveryFiles: [
        {
          filename: 'handbook.pdf',
          storagePath: 'products/handbook.pdf',
          size: 1024,
          mimeType: 'application/pdf',
        },
      ],
    };

    productModel.findById.mockReturnValue(buildQuery(product));
    orderModel.findOne.mockReturnValue(buildQuery(null));
    orderModel.aggregate.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    });
    orderModel.create.mockResolvedValue([createdOrder]);
    walletService.purchase.mockResolvedValue(purchaseTransaction);

    const result = await service.createOrder('507f1f77bcf86cd799439011', {
      productId: product._id.toString(),
      quantity: 1,
      buyerNote: 'Please process fast',
    });

    expect(walletService.purchase).toHaveBeenCalledTimes(1);
    expect(product.stock).toBe(4);
    expect(product.save).toHaveBeenCalled();
    expect(result).toBe(createdOrder);
    expect(result.status).toBe(OrderStatus.DELIVERED);
    expect(result.deliveryFiles[0].storagePath).toBe('products/handbook.pdf');
  });

  it('cancels a paid order and refunds the wallet', async () => {
    const session = {
      withTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(session);
    session.withTransaction.mockImplementation(
      async (callback: () => Promise<void>) => {
        await callback();
      },
    );

    const order = {
      id: 'order-2',
      orderNumber: 'ORD-20260319120000-0001',
      buyerId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      totalAmount: 150,
      status: OrderStatus.PAID,
      items: [
        {
          productId: new Types.ObjectId('507f1f77bcf86cd799439022'),
          quantity: 1,
        },
      ],
      statusHistory: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    const product = {
      _id: new Types.ObjectId('507f1f77bcf86cd799439022'),
      stock: 2,
      save: jest.fn().mockResolvedValue(undefined),
    };

    orderModel.findById.mockReturnValue(buildQuery(order));
    productModel.findById.mockReturnValue(buildQuery(product));
    walletService.refund.mockResolvedValue({ _id: new Types.ObjectId() });

    const result = await service.cancelOrder(
      '507f1f77bcf86cd799439011',
      '507f1f77bcf86cd799439033',
      'Changed my mind',
    );

    expect(walletService.refund).toHaveBeenCalledTimes(1);
    expect(order.status).toBe(OrderStatus.CANCELLED);
    expect(order.save).toHaveBeenCalled();
    expect(result.status).toBe(OrderStatus.CANCELLED);
    expect(product.stock).toBe(3);
    expect(product.save).toHaveBeenCalled();
  });

  it('accepts a custom quote and charges delta when quote price is higher', async () => {
    const session = {
      withTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(session);
    session.withTransaction.mockImplementation(
      async (callback: () => Promise<void>) => {
        await callback();
      },
    );

    const order = {
      id: 'order-3',
      orderNumber: 'ORD-20260319120000-0003',
      buyerId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      totalAmount: 120,
      platformFee: 0,
      subtotal: 120,
      sellerReceives: 120,
      status: OrderStatus.QUOTED,
      quote: {
        price: 200,
        note: 'Final quoted price',
      },
      items: [
        {
          productId: new Types.ObjectId('507f1f77bcf86cd799439022'),
          productSnapshot: {
            name: 'Custom branding kit',
            type: StoreProductType.CUSTOM_ORDER,
            price: 120,
          },
          quantity: 1,
        },
      ],
      statusHistory: [],
      save: jest.fn().mockResolvedValue(undefined),
    };

    orderModel.findById.mockReturnValue(buildQuery(order));
    walletService.purchase.mockResolvedValue({ _id: new Types.ObjectId() });

    const result = await service.acceptQuote(
      '507f1f77bcf86cd799439011',
      '507f1f77bcf86cd799439033',
    );

    expect(walletService.purchase).toHaveBeenCalledTimes(1);
    expect(walletService.purchase).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      80,
      expect.any(Object),
      expect.any(Object),
    );
    expect(order.status).toBe(OrderStatus.PROCESSING);
    expect(order.quote.acceptedAt).toBeInstanceOf(Date);
    expect(order.save).toHaveBeenCalled();
    expect(result.status).toBe(OrderStatus.PROCESSING);
  });

  it('rejects a custom quote and refunds full order amount', async () => {
    const session = {
      withTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(session);
    session.withTransaction.mockImplementation(
      async (callback: () => Promise<void>) => {
        await callback();
      },
    );

    const product = {
      _id: new Types.ObjectId('507f1f77bcf86cd799439022'),
      stock: 5,
      save: jest.fn().mockResolvedValue(undefined),
    };

    const order = {
      id: 'order-4',
      orderNumber: 'ORD-20260319120000-0004',
      buyerId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      totalAmount: 150,
      platformFee: 0,
      subtotal: 150,
      sellerReceives: 150,
      status: OrderStatus.QUOTED,
      quote: {
        price: 180,
      },
      items: [
        {
          productId: new Types.ObjectId('507f1f77bcf86cd799439022'),
          productSnapshot: {
            name: 'Custom landing page',
            type: StoreProductType.CUSTOM_ORDER,
            price: 150,
          },
          quantity: 1,
        },
      ],
      statusHistory: [],
      save: jest.fn().mockResolvedValue(undefined),
    };

    orderModel.findById
      .mockReturnValueOnce(buildQuery(order))
      .mockReturnValueOnce(buildQuery(order));
    productModel.findById.mockReturnValue(buildQuery(product));
    walletService.refund.mockResolvedValue({ _id: new Types.ObjectId() });

    const result = await service.rejectQuote(
      '507f1f77bcf86cd799439011',
      '507f1f77bcf86cd799439033',
      'Not suitable',
    );

    expect(walletService.refund).toHaveBeenCalledTimes(1);
    expect(walletService.refund).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      150,
      expect.any(Object),
      expect.any(Object),
    );
    expect(order.status).toBe(OrderStatus.CANCELLED);
    expect(order.refund.amount).toBe(150);
    expect(product.stock).toBe(6);
    expect(product.save).toHaveBeenCalled();
    expect(result.status).toBe(OrderStatus.CANCELLED);
  });
});
