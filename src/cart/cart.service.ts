import {
  ForbiddenException,
  BadRequestException,
  Injectable,
  Optional,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { MongoTransactionService } from '../common/services/mongo-transaction.service';
import {
  SubscriptionPlanCode,
  SubscriptionStatus,
  getSubscriptionPlanDefinition,
} from '../subscriptions/subscription.constants';
import { normalizeSubscription } from '../subscriptions/subscription.util';
import { OrdersService } from '../store/orders/orders.service';
import { OrderSource } from '../store/orders/schemas/order.schema';
import { ProductsService } from '../store/products/products.service';
import { User } from '../users/schemas/user.schema';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CheckoutCartDto } from './dto/checkout-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { Cart, CartDocument } from './schemas/cart.schema';

type CartItemWithId = {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  productName: string;
  productSlug: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  currency: string;
};

type CartPricingContext = {
  isVipActive: boolean;
  storeDiscountPercent: number;
  planCode: SubscriptionPlanCode;
};

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name)
    private readonly cartModel: Model<Cart>,
    @Optional()
    @InjectModel(User.name)
    private readonly userModel: Model<User> | undefined,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly productsService: ProductsService,
    private readonly ordersService: OrdersService,
    private readonly mongoTransactionService: MongoTransactionService,
  ) {}

  async getCart(userId: string) {
    const cart = await this.cartModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .exec();
    return cart ?? this.buildEmptyCart(userId);
  }

  async addItem(userId: string, payload: AddCartItemDto) {
    return this.executeInTransaction(async (session) => {
      const pricingContext = await this.getPricingContext(userId, session);
      const product = await this.productsService.findPurchasableByIdOrFail(
        payload.productId,
        session,
      );
      if (product.vipOnly && !pricingContext.isVipActive) {
        throw new ForbiddenException(
          'VIP subscription is required to add this product to cart',
        );
      }
      const quantity = Math.floor(payload.quantity);
      if (product.stock !== undefined && quantity > product.stock) {
        throw new BadRequestException(
          `Product ${product.name} has insufficient stock`,
        );
      }

      const cart = await this.findOrCreateCart(userId, session);
      const existingItem = cart.items.find(
        (item) => item.productId.toString() === product.id,
      );
      if (existingItem) {
        const nextQuantity = existingItem.quantity + quantity;
        if (product.stock !== undefined && nextQuantity > product.stock) {
          throw new BadRequestException(
            `Product ${product.name} has insufficient stock`,
          );
        }
        existingItem.quantity = nextQuantity;
        existingItem.unitPrice = product.priceAmount;
        existingItem.currency = product.currency;
        existingItem.productName = product.name;
        existingItem.productSlug = product.slug;
        existingItem.lineTotal = nextQuantity * existingItem.unitPrice;
      } else {
        cart.items.push({
          productId: new Types.ObjectId(product.id),
          productName: product.name,
          productSlug: product.slug,
          unitPrice: product.priceAmount,
          quantity,
          lineTotal: product.priceAmount * quantity,
          currency: product.currency,
        });
      }

      this.recalculateCartTotals(cart, pricingContext.storeDiscountPercent);
      await cart.save({ session });
      return cart;
    });
  }

  async updateItem(userId: string, itemId: string, payload: UpdateCartItemDto) {
    return this.executeInTransaction(async (session) => {
      const pricingContext = await this.getPricingContext(userId, session);
      const cart = await this.findCartOrFail(userId, session);
      const item = (cart.items as unknown as CartItemWithId[]).find(
        (entry) => entry._id.toString() === itemId,
      );
      if (!item) {
        throw new NotFoundException('Cart item not found');
      }

      const product = await this.productsService.findPurchasableByIdOrFail(
        item.productId.toString(),
        session,
      );
      if (product.vipOnly && !pricingContext.isVipActive) {
        throw new ForbiddenException(
          'VIP subscription is required to keep this product in cart',
        );
      }
      const quantity = Math.floor(payload.quantity);
      if (product.stock !== undefined && quantity > product.stock) {
        throw new BadRequestException(
          `Product ${product.name} has insufficient stock`,
        );
      }

      item.quantity = quantity;
      item.unitPrice = product.priceAmount;
      item.currency = product.currency;
      item.productName = product.name;
      item.productSlug = product.slug;
      item.lineTotal = quantity * item.unitPrice;

      this.recalculateCartTotals(cart, pricingContext.storeDiscountPercent);
      await cart.save({ session });
      return cart;
    });
  }

  async removeItem(userId: string, itemId: string) {
    return this.executeInTransaction(async (session) => {
      const cart = await this.findCartOrFail(userId, session);
      const before = cart.items.length;
      cart.items = (cart.items as unknown as CartItemWithId[]).filter(
        (entry) => entry._id.toString() !== itemId,
      ) as never;

      if (cart.items.length === before) {
        throw new NotFoundException('Cart item not found');
      }

      const pricingContext = await this.getPricingContext(userId, session);
      this.recalculateCartTotals(cart, pricingContext.storeDiscountPercent);
      await cart.save({ session });
      return cart;
    });
  }

  async clearCart(userId: string) {
    return this.executeInTransaction(async (session) => {
      const cart = await this.cartModel
        .findOne({ userId: new Types.ObjectId(userId) })
        .session(session)
        .exec();
      if (!cart) {
        return this.buildEmptyCart(userId);
      }

      cart.items = [];
      this.recalculateCartTotals(cart, 0);
      await cart.save({ session });
      return cart;
    });
  }

  async checkout(userId: string, payload: CheckoutCartDto) {
    const result = await this.executeInTransaction(async (session) => {
      if (payload.idempotencyKey) {
        const existingOrder =
          await this.ordersService.findExistingOrderByIdempotency(
            userId,
            payload.idempotencyKey,
            OrderSource.CART,
            session,
          );
        if (existingOrder) {
          const existingCart = await this.cartModel
            .findOne({ userId: new Types.ObjectId(userId) })
            .session(session)
            .exec();

          return {
            order: existingOrder,
            cart: existingCart ?? this.buildEmptyCart(userId),
          };
        }
      }

      const cart = await this.findCartOrFail(userId, session);
      if (cart.items.length === 0) {
        throw new BadRequestException('Cart is empty');
      }

      const order = await this.ordersService.createOrderFromItems(
        userId,
        cart.items.map((item) => ({
          productId: item.productId.toString(),
          quantity: item.quantity,
        })),
        {
          source: OrderSource.CART,
          idempotencyKey: payload.idempotencyKey,
          description: 'Cart checkout payment',
        },
        session,
      );

      cart.items = [];
      this.recalculateCartTotals(cart, 0);
      await cart.save({ session });

      return {
        order,
        cart,
      };
    });

    await this.ordersService.dispatchDeliveryEmailForOrder(result.order);
    return result;
  }

  private async findOrCreateCart(
    userId: string,
    session: ClientSession,
  ): Promise<CartDocument> {
    const existing = await this.cartModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .session(session)
      .exec();
    if (existing) {
      return existing;
    }

    const created = await this.cartModel.create(
      [
        {
          userId: new Types.ObjectId(userId),
          items: [],
          subtotal: 0,
          discountTotal: 0,
          total: 0,
          currency: 'VND',
        },
      ],
      { session },
    );
    return created[0];
  }

  private async findCartOrFail(
    userId: string,
    session: ClientSession,
  ): Promise<CartDocument> {
    const cart = await this.cartModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .session(session)
      .exec();
    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    return cart;
  }

  private recalculateCartTotals(
    cart: CartDocument,
    storeDiscountPercent = 0,
  ) {
    const subtotal = cart.items.reduce((sum, item) => sum + item.lineTotal, 0);
    const discountTotal = this.calculateDiscountTotal(
      subtotal,
      storeDiscountPercent,
    );
    cart.subtotal = subtotal;
    cart.discountTotal = discountTotal;
    cart.total = Math.max(0, subtotal - discountTotal);
    cart.currency = cart.items[0]?.currency ?? 'VND';
  }

  private buildEmptyCart(userId: string) {
    return {
      userId,
      items: [],
      subtotal: 0,
      discountTotal: 0,
      total: 0,
      currency: 'VND',
    };
  }

  private async getPricingContext(
    userId: string,
    session?: ClientSession,
  ): Promise<CartPricingContext> {
    const defaultContext: CartPricingContext = {
      isVipActive: false,
      storeDiscountPercent: 0,
      planCode: SubscriptionPlanCode.FREE,
    };

    if (!this.userModel || !Types.ObjectId.isValid(userId)) {
      return defaultContext;
    }

    const query = this.userModel
      .findById(userId)
      .select({ subscription: 1 })
      .lean<{ subscription?: User['subscription'] }>();
    if (session) {
      query.session(session);
    }

    const user = await query.exec();
    if (!user) {
      return defaultContext;
    }

    const subscription = normalizeSubscription(user.subscription);
    const perks = getSubscriptionPlanDefinition(subscription.planCode).perks;

    return {
      isVipActive:
        subscription.status === SubscriptionStatus.ACTIVE &&
        subscription.planCode === SubscriptionPlanCode.VIP,
      storeDiscountPercent: Math.max(0, perks.storeDiscountPercent ?? 0),
      planCode: subscription.planCode,
    };
  }

  private calculateDiscountTotal(subtotal: number, discountPercent: number) {
    if (subtotal <= 0) {
      return 0;
    }

    const normalizedDiscountPercent = Math.max(
      0,
      Math.min(Math.floor(discountPercent), 100),
    );
    if (normalizedDiscountPercent <= 0) {
      return 0;
    }

    const rawDiscount = Math.round((subtotal * normalizedDiscountPercent) / 100);
    return Math.min(rawDiscount, Math.max(0, subtotal - 1));
  }

  private executeInTransaction<T>(
    callback: (session: ClientSession) => Promise<T>,
    session?: ClientSession,
  ): Promise<T> {
    return this.mongoTransactionService.executeInTransaction(
      this.connection,
      callback,
      session,
    );
  }
}
