import { Types } from 'mongoose';
import { OrdersService } from '../orders/orders.service';
import { ProductStatus, ProductType } from '../products/schemas/product.schema';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartService } from './cart.service';

const buildQuery = <T>(result: T) => ({
  sort: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(result),
});

describe('CartService', () => {
  let service: CartService;
  let cartItemModel: {
    find: jest.Mock;
    findOne: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    deleteOne: jest.Mock;
    deleteMany: jest.Mock;
  };
  let productModel: {
    findById: jest.Mock;
    find: jest.Mock;
  };
  let ordersService: {
    createOrder: jest.Mock;
  };

  beforeEach(() => {
    cartItemModel = {
      find: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      deleteOne: jest.fn(),
      deleteMany: jest.fn(),
    };
    productModel = {
      findById: jest.fn(),
      find: jest.fn(),
    };
    ordersService = {
      createOrder: jest.fn(),
    };

    service = new CartService(
      cartItemModel as never,
      productModel as never,
      ordersService as unknown as OrdersService,
    );
  });

  it('merges cart items with the same product and customData signature', async () => {
    const userId = '507f1f77bcf86cd799439011';
    const productId = new Types.ObjectId();
    const product = {
      _id: productId,
      slug: 'design-kit',
      name: 'Design Kit',
      type: ProductType.DIGITAL,
      price: 120,
      originalPrice: 150,
      isOnSale: true,
      isFeatured: false,
      status: ProductStatus.ACTIVE,
      previewUrl: 'https://example.com/preview.png',
      images: [],
      rating: 4.8,
      reviewsCount: 12,
      salesCount: 50,
      tags: ['design'],
      categoryId: undefined,
      estimatedDays: undefined,
      subscriberDiscount: { pro: 5, vip: 10 },
    };
    const existingItem = {
      id: 'cart-1',
      productId,
      quantity: 1,
      customData: { color: 'blue' },
      selected: false,
      buyerNote: undefined,
      save: jest.fn().mockResolvedValue(undefined),
    };

    productModel.findById.mockReturnValue(buildQuery(product));
    productModel.find.mockReturnValue(buildQuery([product]));
    cartItemModel.find
      .mockReturnValueOnce(buildQuery([existingItem]))
      .mockReturnValueOnce(
        buildQuery([
          {
            ...existingItem,
            quantity: 3,
            selected: true,
          },
        ]),
      );

    const result = await service.addItem(userId, {
      productId: productId.toString(),
      quantity: 2,
      customData: { color: 'blue' },
      buyerNote: 'Please prioritize',
    } as AddCartItemDto);

    expect(existingItem.quantity).toBe(3);
    expect(existingItem.selected).toBe(true);
    expect(existingItem.save).toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.summary.itemCount).toBe(3);
    expect(result.summary.selectedCount).toBe(3);
  });

  it('checkout creates orders for valid items and reports failures', async () => {
    const userId = '507f1f77bcf86cd799439011';
    const activeProductId = new Types.ObjectId();
    const inactiveProductId = new Types.ObjectId();
    const successItemId = new Types.ObjectId().toString();
    const failedItemId = new Types.ObjectId().toString();
    const cartItems = [
      {
        id: successItemId,
        productId: activeProductId,
        quantity: 2,
        selected: true,
        customData: { size: 'l' },
        buyerNote: 'Fast',
      },
      {
        id: failedItemId,
        productId: inactiveProductId,
        quantity: 1,
        selected: true,
      },
    ];

    cartItemModel.find.mockReturnValue(buildQuery(cartItems));
    productModel.find.mockReturnValue(
      buildQuery([
        {
          _id: activeProductId,
          slug: 'product-1',
          name: 'Product 1',
          type: ProductType.DIGITAL,
          price: 100,
          isOnSale: false,
          isFeatured: false,
          status: ProductStatus.ACTIVE,
          images: [],
          rating: 4.5,
          reviewsCount: 10,
          salesCount: 20,
          tags: [],
        },
      ]),
    );
    ordersService.createOrder.mockResolvedValue({ id: 'order-1' });
    cartItemModel.deleteOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    });

    const result = await service.checkout(userId, {});

    expect(ordersService.createOrder).toHaveBeenCalledTimes(1);
    expect(cartItemModel.deleteOne).toHaveBeenCalledTimes(1);
    expect(result.createdOrders).toHaveLength(1);
    expect(result.failedItems).toHaveLength(1);
    expect(result.summary.successCount).toBe(1);
    expect(result.summary.failedCount).toBe(1);
    expect(result.summary.subtotal).toBe(200);
  });
});
