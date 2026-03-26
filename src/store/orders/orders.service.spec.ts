import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { MongoTransactionService } from '../../common/services/mongo-transaction.service';
import { MinioService } from '../../minio/minio.service';
import { WalletService } from '../../wallet/wallet.service';
import { ProductsService } from '../products/products.service';
import { OrderDeliveryEmailService } from './order-delivery-email.service';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderSource, OrderStatus } from './schemas/order.schema';
import { ProductType } from '../products/schemas/product.schema';
import { TicketCategory } from '../../tickets/schemas/ticket.schema';

const buildQuery = <T>(result: T) => ({
  session: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(result),
});

describe('OrdersService', () => {
  let service: OrdersService;
  let orderModel: {
    findOne: jest.Mock;
    create: jest.Mock;
    findById: jest.Mock;
  };
  let productsService: {
    findOrderableByIdOrFail: jest.Mock;
    findPurchasableByIds: jest.Mock;
    decrementStockOrFail: jest.Mock;
    restoreStock: jest.Mock;
  };
  let walletService: {
    purchase: jest.Mock;
    recordSaleIncome: jest.Mock;
    recordPlatformFee: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };
  let orderDeliveryEmailService: {
    dispatchDeliveryEmail: jest.Mock;
  };
  let ticketsService: {
    createOrAppendOrderRequestTicket: jest.Mock;
  };
  let connection: {
    startSession: jest.Mock;
    db?: {
      admin: jest.Mock;
    };
  };

  beforeEach(() => {
    orderModel = {
      findOne: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
    };
    productsService = {
      findOrderableByIdOrFail: jest.fn(),
      findPurchasableByIds: jest.fn(),
      decrementStockOrFail: jest.fn(),
      restoreStock: jest.fn(),
    };
    walletService = {
      purchase: jest.fn(),
      recordSaleIncome: jest.fn(),
      recordPlatformFee: jest.fn(),
    };
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'store.ownerUserId') {
          return new Types.ObjectId().toString();
        }
        if (key === 'store.autoCompleteDays') {
          return 7;
        }
        if (key === 'store.downloadUrlTtlSeconds') {
          return 3600;
        }
        if (key === 'store.platformFeePercent') {
          return 10;
        }
        return undefined;
      }),
    };
    orderDeliveryEmailService = {
      dispatchDeliveryEmail: jest.fn().mockResolvedValue(undefined),
    };
    ticketsService = {
      createOrAppendOrderRequestTicket: jest.fn(),
    };
    connection = {
      startSession: jest.fn(),
      db: {
        admin: jest.fn().mockReturnValue({
          command: jest.fn().mockResolvedValue({}),
        }),
      },
    };

    const mongoTransactionService = new MongoTransactionService(
      configService as unknown as ConfigService,
    );
    service = new OrdersService(
      orderModel as never,
      undefined,
      connection as never,
      walletService as unknown as WalletService,
      productsService as unknown as ProductsService,
      {
        createPresignedGetUrl: jest.fn(),
        createPresignedDownloadUrl: jest.fn(),
        uploadFile: jest.fn(),
        getBucket: jest.fn(),
        objectExists: jest.fn().mockResolvedValue(true),
      } as unknown as MinioService,
      configService as unknown as ConfigService,
      mongoTransactionService,
      orderDeliveryEmailService as unknown as OrderDeliveryEmailService,
      ticketsService as never,
    );
  });

  it('creates custom order without immediate wallet charge', async () => {
    const session = {
      withTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(session);

    const userId = new Types.ObjectId().toString();
    const productId = new Types.ObjectId().toString();
    const payload: CreateOrderDto = {
      productId,
      quantity: 1,
      idempotencyKey: 'custom-1',
      customData: { brief: 'Need custom implementation' },
    };

    productsService.findOrderableByIdOrFail.mockResolvedValue({
      id: productId,
      name: 'Custom Service',
      slug: 'custom-service',
      type: ProductType.CUSTOM_ORDER,
      priceAmount: 150000,
      currency: 'VND',
    });
    orderModel.findOne.mockReturnValue(buildQuery(null));
    orderModel.create.mockResolvedValue([
      {
        id: new Types.ObjectId().toString(),
        status: OrderStatus.PENDING,
        source: OrderSource.BUY_NOW,
        save: jest.fn(),
      },
    ]);

    const result = await service.createDirectOrder(userId, payload);

    expect(result.status).toBe(OrderStatus.PENDING);
    expect(walletService.purchase).not.toHaveBeenCalled();
  });

  it('creates digital order and auto-delivers files', async () => {
    const session = {
      withTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(session);

    const userId = new Types.ObjectId().toString();
    const productId = new Types.ObjectId().toString();
    const transactionId = new Types.ObjectId();

    productsService.findOrderableByIdOrFail.mockResolvedValue({
      id: productId,
      name: 'Digital Product',
      slug: 'digital-product',
      type: ProductType.DIGITAL,
      priceAmount: 100000,
      currency: 'VND',
      digitalAsset: {
        bucketName: 'products',
        objectName: 'path/file.zip',
        fileName: 'file.zip',
      },
    });
    productsService.findPurchasableByIds.mockResolvedValue(
      new Map([
        [
          productId,
          {
            id: productId,
            name: 'Digital Product',
            slug: 'digital-product',
            type: ProductType.DIGITAL,
            priceAmount: 100000,
            currency: 'VND',
            stock: 5,
            digitalAsset: {
              bucketName: 'products',
              objectName: 'path/file.zip',
              fileName: 'file.zip',
            },
          },
        ],
      ]),
    );
    productsService.decrementStockOrFail.mockResolvedValue([
      { productId, quantity: 1 },
    ]);
    walletService.purchase.mockResolvedValue({ _id: transactionId });
    orderModel.findOne.mockReturnValue(buildQuery(null));

    const orderDoc = {
      id: new Types.ObjectId().toString(),
      status: OrderStatus.PAID,
      items: [
        {
          productType: ProductType.DIGITAL,
          digitalAsset: {
            bucketName: 'products',
            objectName: 'path/file.zip',
            fileName: 'file.zip',
          },
        },
      ],
      deliveryFiles: [],
      statusHistory: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    orderModel.create.mockResolvedValue([orderDoc]);

    const result = await service.createDirectOrder(userId, {
      productId,
      quantity: 1,
      idempotencyKey: 'digital-1',
    });

    expect(walletService.purchase).toHaveBeenCalled();
    expect(productsService.decrementStockOrFail).toHaveBeenCalled();
    expect(result.status).toBe(OrderStatus.DELIVERED);
    expect(orderDoc.save).toHaveBeenCalled();
    expect(orderDeliveryEmailService.dispatchDeliveryEmail).toHaveBeenCalled();
  });

  it('does not dispatch delivery email inside external transaction session', async () => {
    const userId = new Types.ObjectId().toString();
    const productId = new Types.ObjectId().toString();
    const transactionId = new Types.ObjectId();
    const externalSession = {} as never;

    productsService.findPurchasableByIds.mockResolvedValue(
      new Map([
        [
          productId,
          {
            id: productId,
            name: 'Digital Product',
            slug: 'digital-product',
            type: ProductType.DIGITAL,
            priceAmount: 100000,
            currency: 'VND',
            stock: 5,
            digitalAsset: {
              bucketName: 'products',
              objectName: 'path/file.zip',
              fileName: 'file.zip',
            },
          },
        ],
      ]),
    );
    productsService.decrementStockOrFail.mockResolvedValue([
      { productId, quantity: 1 },
    ]);
    walletService.purchase.mockResolvedValue({ _id: transactionId });
    orderModel.findOne.mockReturnValue(buildQuery(null));

    const orderDoc = {
      id: new Types.ObjectId().toString(),
      status: OrderStatus.PAID,
      items: [
        {
          productType: ProductType.DIGITAL,
          digitalAsset: {
            bucketName: 'products',
            objectName: 'path/file.zip',
            fileName: 'file.zip',
          },
        },
      ],
      deliveryFiles: [],
      statusHistory: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    orderModel.create.mockResolvedValue([orderDoc]);

    const result = await service.createOrderFromItems(
      userId,
      [{ productId, quantity: 1 }],
      {
        source: OrderSource.CART,
        idempotencyKey: 'cart-session-1',
      },
      externalSession,
    );

    expect(result.status).toBe(OrderStatus.DELIVERED);
    expect(
      orderDeliveryEmailService.dispatchDeliveryEmail,
    ).not.toHaveBeenCalled();
  });

  it('completes delivered order by buyer and keeps specialized flow', async () => {
    const session = {
      withTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(session);

    const userId = new Types.ObjectId().toString();
    const order = {
      id: new Types.ObjectId().toString(),
      orderNumber: 'ORD-1',
      status: OrderStatus.DELIVERED,
      buyerId: new Types.ObjectId(userId),
      items: [],
      statusHistory: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    orderModel.findById.mockReturnValue(buildQuery(order));

    const result = await service.completeByBuyer(order.id, userId);

    expect(result.status).toBe(OrderStatus.COMPLETED);
    expect(order.save).toHaveBeenCalled();
  });

  it('creates cancel request ticket without mutating order status', async () => {
    const userId = new Types.ObjectId().toString();
    const order = {
      id: new Types.ObjectId().toString(),
      orderNumber: 'ORD-2',
      status: OrderStatus.PROCESSING,
      buyerId: new Types.ObjectId(userId),
    };
    orderModel.findById.mockReturnValue(buildQuery(order));
    ticketsService.createOrAppendOrderRequestTicket.mockResolvedValue({
      ticket: {
        id: new Types.ObjectId().toString(),
        ticketNumber: 'TKT-1',
      },
      appended: false,
    });

    const result = await service.requestCancelByBuyer(order.id, userId, {
      reason: 'Need to cancel',
    });

    expect(result).toEqual(
      expect.objectContaining({
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: OrderStatus.PROCESSING,
        requestType: 'cancel',
      }),
    );
    expect(ticketsService.createOrAppendOrderRequestTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        category: TicketCategory.ORDER_ISSUE,
      }),
    );
  });

  it('enforces strict staff transition and rejects invalid transition', async () => {
    const session = {
      withTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(session);

    const actorUserId = new Types.ObjectId().toString();
    const order = {
      id: new Types.ObjectId().toString(),
      orderNumber: 'ORD-3',
      status: OrderStatus.PENDING,
      buyerId: new Types.ObjectId().toString(),
      statusHistory: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    orderModel.findById.mockReturnValue(buildQuery(order));

    await expect(
      service.updateOrderStatusByStaff(order.id, actorUserId, {
        status: OrderStatus.PROCESSING,
      }),
    ).rejects.toThrow('Invalid status transition pending -> processing');
    expect(order.save).not.toHaveBeenCalled();
  });

  it('allows strict staff transition paid -> processing', async () => {
    const session = {
      withTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(session);

    const actorUserId = new Types.ObjectId().toString();
    const order = {
      id: new Types.ObjectId().toString(),
      orderNumber: 'ORD-4',
      status: OrderStatus.PAID,
      buyerId: new Types.ObjectId().toString(),
      statusHistory: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    orderModel.findById.mockReturnValue(buildQuery(order));

    const result = await service.updateOrderStatusByStaff(order.id, actorUserId, {
      status: OrderStatus.PROCESSING,
      note: 'Start processing',
    });

    expect(result.status).toBe(OrderStatus.PROCESSING);
    expect(order.save).toHaveBeenCalled();
  });
});
