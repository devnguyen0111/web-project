import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { MongoTransactionService } from '../common/services/mongo-transaction.service';
import { OrdersService } from '../store/orders/orders.service';
import { OrderSource } from '../store/orders/schemas/order.schema';
import { ProductsService } from '../store/products/products.service';
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

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name)
    private readonly cartModel: Model<Cart>,
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
      const product = await this.productsService.findPurchasableByIdOrFail(
        payload.productId,
        session,
      );
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

      this.recalculateCartTotals(cart);
      await cart.save({ session });
      return cart;
    });
  }

  async updateItem(userId: string, itemId: string, payload: UpdateCartItemDto) {
    return this.executeInTransaction(async (session) => {
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

      this.recalculateCartTotals(cart);
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

      this.recalculateCartTotals(cart);
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
      this.recalculateCartTotals(cart);
      await cart.save({ session });
      return cart;
    });
  }

  async checkout(userId: string, payload: CheckoutCartDto) {
    return this.executeInTransaction(async (session) => {
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
      this.recalculateCartTotals(cart);
      await cart.save({ session });

      return {
        order,
        cart,
      };
    });
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

  private recalculateCartTotals(cart: CartDocument) {
    const subtotal = cart.items.reduce((sum, item) => sum + item.lineTotal, 0);
    cart.subtotal = subtotal;
    cart.discountTotal = 0;
    cart.total = subtotal;
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
