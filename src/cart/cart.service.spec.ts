import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { MongoTransactionService } from '../common/services/mongo-transaction.service';
import { OrdersService } from '../store/orders/orders.service';
import { ProductsService } from '../store/products/products.service';
import { CartService } from './cart.service';

const buildQuery = <T>(result: T) => ({
  session: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(result),
});

describe('CartService', () => {
  let service: CartService;
  let cartModel: {
    findOne: jest.Mock;
    create: jest.Mock;
  };
  let connection: {
    startSession: jest.Mock;
    db?: {
      admin: jest.Mock;
    };
  };
  let productsService: {
    findPurchasableByIdOrFail: jest.Mock;
  };
  let ordersService: {
    createOrderFromItems: jest.Mock;
    findExistingOrderByIdempotency: jest.Mock;
    dispatchDeliveryEmailForOrder: jest.Mock;
  };

  beforeEach(() => {
    cartModel = {
      findOne: jest.fn(),
      create: jest.fn(),
    };
    connection = {
      startSession: jest.fn(),
      db: {
        admin: jest.fn().mockReturnValue({
          command: jest.fn().mockResolvedValue({}),
        }),
      },
    };
    productsService = {
      findPurchasableByIdOrFail: jest.fn(),
    };
    ordersService = {
      createOrderFromItems: jest.fn(),
      findExistingOrderByIdempotency: jest.fn(),
      dispatchDeliveryEmailForOrder: jest.fn().mockResolvedValue(undefined),
    };

    const mongoTransactionService = new MongoTransactionService({
      get: jest.fn(),
    } as unknown as ConfigService);

    service = new CartService(
      cartModel as never,
      undefined,
      connection as never,
      productsService as unknown as ProductsService,
      ordersService as unknown as OrdersService,
      mongoTransactionService,
    );
  });

  it('adds item and recalculates totals', async () => {
    const session = {
      withTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(session);

    const userId = new Types.ObjectId().toString();
    const productId = new Types.ObjectId().toString();
    productsService.findPurchasableByIdOrFail.mockResolvedValue({
      id: productId,
      name: 'Product A',
      slug: 'product-a',
      priceAmount: 100000,
      currency: 'VND',
    });

    const cartDoc = {
      userId: new Types.ObjectId(userId),
      items: [] as Array<Record<string, unknown>>,
      subtotal: 0,
      discountTotal: 0,
      total: 0,
      currency: 'VND',
      save: jest.fn().mockResolvedValue(undefined),
    };

    cartModel.findOne.mockReturnValue(buildQuery(null));
    cartModel.create.mockResolvedValue([cartDoc]);

    const result = await service.addItem(userId, {
      productId,
      quantity: 2,
    });

    expect(result.items).toHaveLength(1);
    expect(result.subtotal).toBe(200000);
    expect(result.total).toBe(200000);
    expect(cartDoc.save).toHaveBeenCalled();
  });

  it('checkout creates order then clears cart', async () => {
    const session = {
      withTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(session);

    const userId = new Types.ObjectId().toString();
    const productId = new Types.ObjectId().toString();
    const cartItemId = new Types.ObjectId();
    const cartDoc = {
      userId: new Types.ObjectId(userId),
      items: [
        {
          _id: cartItemId,
          productId: new Types.ObjectId(productId),
          quantity: 1,
          unitPrice: 120000,
          lineTotal: 120000,
          currency: 'VND',
        },
      ],
      subtotal: 120000,
      discountTotal: 0,
      total: 120000,
      currency: 'VND',
      save: jest.fn().mockResolvedValue(undefined),
    };
    cartModel.findOne.mockReturnValue(buildQuery(cartDoc));
    ordersService.createOrderFromItems.mockResolvedValue({ id: 'order-1' });
    ordersService.findExistingOrderByIdempotency.mockResolvedValue(null);

    const result = await service.checkout(userId, { idempotencyKey: 'cart-1' });

    expect(ordersService.createOrderFromItems).toHaveBeenCalledWith(
      userId,
      [
        {
          productId,
          quantity: 1,
        },
      ],
      expect.objectContaining({
        idempotencyKey: 'cart-1',
      }),
      session,
    );
    expect(result.cart.items).toHaveLength(0);
    expect(result.cart.total).toBe(0);
    expect(cartDoc.save).toHaveBeenCalled();
    expect(ordersService.dispatchDeliveryEmailForOrder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order-1' }),
    );
  });

  it('throws when checkout is requested on empty cart', async () => {
    const session = {
      withTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(session);

    const userId = new Types.ObjectId().toString();
    const cartDoc = {
      userId: new Types.ObjectId(userId),
      items: [],
      subtotal: 0,
      discountTotal: 0,
      total: 0,
      currency: 'VND',
      save: jest.fn().mockResolvedValue(undefined),
    };
    cartModel.findOne.mockReturnValue(buildQuery(cartDoc));

    await expect(service.checkout(userId, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(ordersService.findExistingOrderByIdempotency).not.toHaveBeenCalled();
    expect(ordersService.createOrderFromItems).not.toHaveBeenCalled();
  });

  it('returns existing order on checkout idempotent replay', async () => {
    const session = {
      withTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(session);

    const userId = new Types.ObjectId().toString();
    const order = { id: 'order-replayed' };
    ordersService.findExistingOrderByIdempotency.mockResolvedValue(order);
    cartModel.findOne.mockReturnValue(buildQuery(null));

    const result = await service.checkout(userId, {
      idempotencyKey: 'cart-replay-1',
    });

    expect(ordersService.findExistingOrderByIdempotency).toHaveBeenCalledWith(
      userId,
      'cart-replay-1',
      expect.any(String),
      session,
    );
    expect(ordersService.createOrderFromItems).not.toHaveBeenCalled();
    expect(result.order).toBe(order);
    expect(result.cart.items).toEqual([]);
    expect(ordersService.dispatchDeliveryEmailForOrder).toHaveBeenCalledWith(
      order,
    );
  });
});
