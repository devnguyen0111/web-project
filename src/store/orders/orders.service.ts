import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Role } from '../../common/constants/roles.constant';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { MongoTransactionService } from '../../common/services/mongo-transaction.service';
import { WalletService } from '../../wallet/wallet.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { ProductsService } from '../products/products.service';
import { Order, OrderDocument, OrderSource, OrderStatus } from './schemas/order.schema';

type AuthUser = {
  userId: string;
  role: Role;
};

type OrderItemInput = {
  productId: string;
  quantity: number;
};

type CreateOrderOptions = {
  source: OrderSource;
  idempotencyKey?: string;
  description?: string;
};

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<Order>,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly walletService: WalletService,
    private readonly productsService: ProductsService,
    private readonly mongoTransactionService: MongoTransactionService,
  ) {}

  async createDirectOrder(userId: string, payload: CreateOrderDto) {
    return this.createOrderFromItems(
      userId,
      [{ productId: payload.productId, quantity: payload.quantity }],
      {
        source: OrderSource.BUY_NOW,
        idempotencyKey: payload.idempotencyKey,
      },
    );
  }

  async createOrderFromItems(
    userId: string,
    items: OrderItemInput[],
    options: CreateOrderOptions,
    session?: ClientSession,
  ): Promise<OrderDocument> {
    return this.executeInTransaction(async (activeSession) => {
      if (!items.length) {
        throw new BadRequestException('Order items are required');
      }

      const itemQty = new Map<string, number>();
      for (const item of items) {
        if (!Types.ObjectId.isValid(item.productId)) {
          throw new BadRequestException('Invalid product id in order items');
        }
        if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
          throw new BadRequestException('quantity must be greater than zero');
        }
        const normalizedQuantity = Math.floor(item.quantity);
        itemQty.set(
          item.productId,
          (itemQty.get(item.productId) ?? 0) + normalizedQuantity,
        );
      }

      if (options.idempotencyKey) {
        const existingOrder = await this.orderModel
          .findOne({
            buyerId: new Types.ObjectId(userId),
            idempotencyKey: options.idempotencyKey,
          })
          .session(activeSession)
          .exec();
        if (existingOrder) {
          return existingOrder;
        }
      }

      const products = await this.productsService.findPurchasableByIds(
        Array.from(itemQty.keys()),
        activeSession,
      );

      const orderItems: Array<{
        productId: Types.ObjectId;
        productName: string;
        productSlug: string;
        unitPrice: number;
        quantity: number;
        lineTotal: number;
        currency: string;
      }> = [];

      for (const [productId, quantity] of itemQty.entries()) {
        const product = products.get(productId);
        if (!product) {
          throw new NotFoundException(
            'One or more products are unavailable for checkout',
          );
        }
        if (product.stock !== undefined && quantity > product.stock) {
          throw new BadRequestException(
            `Product ${product.name} has insufficient stock`,
          );
        }

        const lineTotal = product.priceAmount * quantity;
        orderItems.push({
          productId: new Types.ObjectId(product.id),
          productName: product.name,
          productSlug: product.slug,
          unitPrice: product.priceAmount,
          quantity,
          lineTotal,
          currency: product.currency,
        });
      }

      const subtotal = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
      const discountTotal = 0;
      const total = subtotal - discountTotal;
      if (total <= 0) {
        throw new BadRequestException('Order total must be greater than zero');
      }

      const orderId = new Types.ObjectId();
      const orderNumber = this.buildOrderNumber(orderId);
      const description =
        options.description ?? `Order payment (${options.source})`;

      const transaction = await this.walletService.purchase(
        userId,
        total,
        {
          description,
          note: `Order ${orderNumber}`,
          reference: {
            model: 'order',
            id: orderId.toString(),
          },
          idempotencyKey: options.idempotencyKey,
          metadata: {
            source: options.source,
            orderNumber,
            itemCount: orderItems.length,
          },
        },
        activeSession,
      );

      try {
        const created = await this.orderModel.create(
          [
            {
              _id: orderId,
              orderNumber,
              buyerId: new Types.ObjectId(userId),
              items: orderItems,
              subtotal,
              discountTotal,
              total,
              currency: orderItems[0]?.currency ?? 'VND',
              status: OrderStatus.PAID,
              source: options.source,
              idempotencyKey: options.idempotencyKey,
              transactionId:
                '_id' in transaction &&
                transaction._id &&
                Types.ObjectId.isValid(String(transaction._id))
                  ? new Types.ObjectId(String(transaction._id))
                  : undefined,
              paidAt: new Date(),
            },
          ],
          { session: activeSession },
        );
        return created[0];
      } catch (error) {
        if (this.isDuplicateIdempotencyKeyError(error) && options.idempotencyKey) {
          const recovered = await this.orderModel
            .findOne({
              buyerId: new Types.ObjectId(userId),
              idempotencyKey: options.idempotencyKey,
            })
            .session(activeSession)
            .exec();
          if (recovered) {
            return recovered;
          }
          throw new ConflictException(
            'An order with the same idempotency key already exists',
          );
        }
        throw error;
      }
    }, session);
  }

  async listMyOrders(userId: string, query: OrderQueryDto) {
    const filter: Record<string, unknown> = {
      buyerId: new Types.ObjectId(userId),
    };
    if (query.status) {
      filter.status = query.status;
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .exec(),
      this.orderModel.countDocuments(filter),
    ]);

    return new PaginatedResponseDto(items, total, query.page, query.limit);
  }

  async listStoreOrders(query: OrderQueryDto) {
    const filter: Record<string, unknown> = {};
    if (query.status) {
      filter.status = query.status;
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .exec(),
      this.orderModel.countDocuments(filter),
    ]);

    return new PaginatedResponseDto(items, total, query.page, query.limit);
  }

  async getStoreDashboard() {
    const [totalOrders, paidOrders, completedOrders, revenueAgg, recentAgg] =
      await Promise.all([
        this.orderModel.countDocuments(),
        this.orderModel.countDocuments({ status: OrderStatus.PAID }),
        this.orderModel.countDocuments({ status: OrderStatus.COMPLETED }),
        this.orderModel
          .aggregate<{ _id: null; revenue: number }>([
            {
              $match: {
                status: { $in: [OrderStatus.PAID, OrderStatus.COMPLETED] },
              },
            },
            {
              $group: {
                _id: null,
                revenue: { $sum: '$total' },
              },
            },
          ])
          .exec(),
        this.orderModel
          .aggregate<{ _id: null; count: number }>([
            {
              $match: {
                createdAt: {
                  $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                },
              },
            },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
              },
            },
          ])
          .exec(),
      ]);

    return {
      totalOrders,
      paidOrders,
      completedOrders,
      grossRevenue: revenueAgg[0]?.revenue ?? 0,
      ordersLast7Days: recentAgg[0]?.count ?? 0,
    };
  }

  async getOrderForUser(orderId: string, user: AuthUser) {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const elevated = user.role === Role.STAFF || user.role === Role.ADMIN;
    if (!elevated && order.buyerId.toString() !== user.userId) {
      throw new ForbiddenException('You do not have permission to view this order');
    }

    return order;
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

  private buildOrderNumber(orderId: Types.ObjectId): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const suffix = orderId.toString().slice(-6).toUpperCase();
    return `ORD-${year}${month}${day}-${suffix}`;
  }

  private isDuplicateIdempotencyKeyError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const code =
      'code' in error ? (error as { code?: unknown }).code : undefined;
    if (code === 11000 || code === 11001 || code === 12582) {
      return true;
    }

    const message =
      'message' in error &&
      typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : '';

    return message.includes('E11000 duplicate key error');
  }
}
