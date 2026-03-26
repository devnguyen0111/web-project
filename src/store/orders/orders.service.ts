import {
  Optional,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Role } from '../../common/constants/roles.constant';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { MongoTransactionService } from '../../common/services/mongo-transaction.service';
import { GamificationService } from '../../gamification/gamification.service';
import { MinioService } from '../../minio/minio.service';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  NotificationCategory,
  NotificationType,
} from '../../notifications/schemas/notification.schema';
import {
  SubscriptionPlanCode,
  SubscriptionStatus,
  getSubscriptionPlanDefinition,
} from '../../subscriptions/subscription.constants';
import { normalizeSubscription } from '../../subscriptions/subscription.util';
import { User } from '../../users/schemas/user.schema';
import { WalletService } from '../../wallet/wallet.service';
import { AcceptOrderQuoteDto } from './dto/accept-order-quote.dto';
import { CreateOrderQuoteDto } from './dto/create-order-quote.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { RejectOrderQuoteDto } from './dto/reject-order-quote.dto';
import { RequestOrderActionDto } from './dto/request-order-action.dto';
import { UpdateStoreOrderStatusDto } from './dto/update-store-order-status.dto';
import { ProductsService } from '../products/products.service';
import {
  Order,
  OrderDocument,
  OrderSource,
  OrderStatus,
} from './schemas/order.schema';
import { ProductType } from '../products/schemas/product.schema';
import { OrderDeliveryEmailService } from './order-delivery-email.service';
import { TicketsService } from '../../tickets/tickets.service';
import { TicketCategory } from '../../tickets/schemas/ticket.schema';

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
  buyerPricingContext?: BuyerPricingContext;
};

type BuyerPricingContext = {
  isVipActive: boolean;
  storeDiscountPercent: number;
  planCode: SubscriptionPlanCode;
};

@Injectable()
export class OrdersService {
  private autoCompleteProcessing = false;
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<Order>,
    @Optional()
    @InjectModel(User.name)
    private readonly userModel: Model<User> | undefined,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly walletService: WalletService,
    private readonly productsService: ProductsService,
    private readonly minioService: MinioService,
    private readonly configService: ConfigService,
    private readonly mongoTransactionService: MongoTransactionService,
    private readonly orderDeliveryEmailService: OrderDeliveryEmailService,
    private readonly ticketsService: TicketsService,
    @Optional()
    private readonly notificationsService?: NotificationsService,
    @Optional()
    private readonly gamificationService?: GamificationService,
  ) {}

  async createDirectOrder(userId: string, payload: CreateOrderDto) {
    const orderable = await this.productsService.findOrderableByIdOrFail(
      payload.productId,
    );
    const pricingContext = await this.getBuyerPricingContext(userId);

    if (orderable.vipOnly && !pricingContext.isVipActive) {
      throw new ForbiddenException(
        'VIP subscription is required to purchase this product',
      );
    }

    if (orderable.type === ProductType.CUSTOM_ORDER) {
      const customOrder = await this.createCustomOrder(
        userId,
        payload,
        pricingContext,
      );
      await this.safeNotifyStoreOperators(
        NotificationType.STORE_ORDER_CREATED,
        `New custom order ${customOrder.orderNumber}`,
        'A buyer created a new custom order request.',
        {
          orderId: customOrder.id,
          orderNumber: customOrder.orderNumber,
          source: customOrder.source,
          status: customOrder.status,
          buyerId: customOrder.buyerId
            ? customOrder.buyerId.toString()
            : userId,
        },
        customOrder,
      );
      return customOrder;
    }

    return this.createOrderFromItems(
      userId,
      [{ productId: payload.productId, quantity: payload.quantity }],
      {
        source: OrderSource.BUY_NOW,
        idempotencyKey: payload.idempotencyKey,
        buyerPricingContext: pricingContext,
      },
    );
  }

  async createOrderFromItems(
    userId: string,
    items: OrderItemInput[],
    options: CreateOrderOptions,
    session?: ClientSession,
  ): Promise<OrderDocument> {
    const order = await this.executeInTransaction(async (activeSession) => {
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

      const existingOrder = await this.findByIdempotencyKey(
        userId,
        options.idempotencyKey,
        activeSession,
      );
      if (existingOrder) {
        return existingOrder;
      }

      const pricingContext =
        options.buyerPricingContext ??
        (await this.getBuyerPricingContext(userId, activeSession));

      const products = await this.productsService.findPurchasableByIds(
        Array.from(itemQty.keys()),
        activeSession,
      );

      const orderItems: Array<{
        productId: Types.ObjectId;
        productName: string;
        productSlug: string;
        productType: ProductType;
        unitPrice: number;
        quantity: number;
        lineTotal: number;
        currency: string;
        digitalAsset?: {
          bucketName: string;
          objectName: string;
          fileName: string;
          mimeType?: string;
          size?: number;
        };
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
        if (!product.digitalAsset) {
          throw new BadRequestException(
            `Product ${product.name} is missing downloadable file`,
          );
        }
        if (product.vipOnly && !pricingContext.isVipActive) {
          throw new ForbiddenException(
            `Product ${product.name} requires an active VIP subscription`,
          );
        }

        const lineTotal = product.priceAmount * quantity;
        orderItems.push({
          productId: new Types.ObjectId(product.id),
          productName: product.name,
          productSlug: product.slug,
          productType: product.type,
          unitPrice: product.priceAmount,
          quantity,
          lineTotal,
          currency: product.currency,
          digitalAsset: {
            bucketName: product.digitalAsset.bucketName,
            objectName: product.digitalAsset.objectName,
            fileName: product.digitalAsset.fileName,
            mimeType: product.digitalAsset.mimeType,
            size: product.digitalAsset.size,
          },
        });
      }

      const subtotal = orderItems.reduce(
        (sum, item) => sum + item.lineTotal,
        0,
      );
      const discountTotal = this.calculateDiscountTotal(
        subtotal,
        pricingContext.storeDiscountPercent,
      );
      const total = subtotal - discountTotal;
      if (total <= 0) {
        throw new BadRequestException('Order total must be greater than zero');
      }

      const orderId = new Types.ObjectId();
      const orderNumber = this.buildOrderNumber(orderId);
      const description =
        options.description ?? `Order payment (${options.source})`;

      const stockChanges = await this.productsService.decrementStockOrFail(
        orderItems.map((item) => ({
          productId: item.productId.toString(),
          quantity: item.quantity,
        })),
        activeSession,
      );

      try {
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
              storeDiscountPercent: pricingContext.storeDiscountPercent,
              subscriptionPlanCode: pricingContext.planCode,
            },
          },
          activeSession,
        );

        const created = await this.orderModel.create(
          [
            {
              _id: orderId,
              orderNumber,
              buyerId: new Types.ObjectId(userId),
              sellerId: this.getStoreOwnerObjectIdOrUndefined(),
              items: orderItems,
              subtotal,
              discountTotal,
              total,
              currency: orderItems[0]?.currency ?? 'VND',
              status: OrderStatus.PAID,
              source: options.source,
              idempotencyKey: options.idempotencyKey,
              buyerTransactionId: this.toObjectIdOrUndefined(transaction),
              transactionId: this.toObjectIdOrUndefined(transaction),
              paidAt: new Date(),
              statusHistory: [
                {
                  to: OrderStatus.PAID,
                  changedAt: new Date(),
                  note: 'Payment completed',
                },
              ],
            },
          ],
          { session: activeSession },
        );

        const order = created[0];
        await this.autoDeliverDigitalOrder(order, activeSession);
        return order;
      } catch (error) {
        if (stockChanges.length > 0) {
          await this.productsService
            .restoreStock(stockChanges, activeSession)
            .catch(() => undefined);
        }

        if (
          this.isDuplicateIdempotencyKeyError(error) &&
          options.idempotencyKey
        ) {
          const recovered = await this.findByIdempotencyKey(
            userId,
            options.idempotencyKey,
            activeSession,
          );
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

    if (!session) {
      await this.dispatchDeliveryEmailForLatestFile(order);
      await this.safeNotifyStoreOperators(
        NotificationType.STORE_ORDER_CREATED,
        `New order ${order.orderNumber}`,
        'A buyer completed payment for a store order.',
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          source: order.source,
          status: order.status,
          buyerId: order.buyerId ? order.buyerId.toString() : userId,
        },
        order,
      );
    }
    return order;
  }

  async findExistingOrderByIdempotency(
    userId: string,
    idempotencyKey: string,
    source?: OrderSource,
    session?: ClientSession,
  ) {
    if (!idempotencyKey) {
      return null;
    }

    const filter: Record<string, unknown> = {
      buyerId: new Types.ObjectId(userId),
      idempotencyKey,
    };
    if (source) {
      filter.source = source;
    }

    const query = this.orderModel.findOne(filter);
    if (session) {
      query.session(session);
    }

    return query.exec();
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
    const revenueStatuses = [
      OrderStatus.PAID,
      OrderStatus.DELIVERED,
      OrderStatus.COMPLETED,
    ];

    const [
      totalOrders,
      paidOrders,
      deliveredOrders,
      completedOrders,
      revenueAgg,
      recentAgg,
    ] = await Promise.all([
      this.orderModel.countDocuments(),
      this.orderModel.countDocuments({ status: OrderStatus.PAID }),
      this.orderModel.countDocuments({ status: OrderStatus.DELIVERED }),
      this.orderModel.countDocuments({ status: OrderStatus.COMPLETED }),
      this.orderModel
        .aggregate<{ _id: null; revenue: number }>([
          {
            $match: {
              status: { $in: revenueStatuses },
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
      deliveredOrders,
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

    const elevated = this.isElevatedRole(user.role);
    if (!elevated && order.buyerId.toString() !== user.userId) {
      throw new ForbiddenException(
        'You do not have permission to view this order',
      );
    }

    return order;
  }

  async completeByBuyer(orderId: string, userId: string) {
    const order = await this.executeInTransaction(async (session) => {
      const order = await this.findOrderByIdOrFail(orderId, session);
      this.ensureBuyer(order, userId);
      return this.completeOrder(order, userId, 'Completed by buyer', session);
    });

    if (order.sellerId) {
      await this.gamificationService
        ?.recordOrderCompleted(order.sellerId.toString(), order.id, false)
        .catch(() => undefined);
    }
    await this.safeNotifyOrderCompletion(order, false);
    return order;
  }

  async requestCancelByBuyer(
    orderId: string,
    userId: string,
    payload?: RequestOrderActionDto,
  ) {
    const order = await this.findOrderByIdOrFail(orderId);
    this.ensureBuyer(order, userId);

    if ([OrderStatus.CANCELLED, OrderStatus.COMPLETED].includes(order.status)) {
      throw new BadRequestException(
        'Cancel request is not allowed for current order status',
      );
    }

    const reason =
      payload?.reason?.trim() ||
      `Buyer requested cancellation for ${order.orderNumber}.`;
    const ticket = await this.createOrderRequestTicket({
      order,
      userId,
      category: TicketCategory.ORDER_ISSUE,
      subject: `Cancel request for ${order.orderNumber}`,
      message: reason,
      tags: ['order-cancel-request'],
    });

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      requestType: 'cancel',
      reason,
      ticket,
    };
  }

  async requestRefundByBuyer(
    orderId: string,
    userId: string,
    payload?: RequestOrderActionDto,
  ) {
    const order = await this.findOrderByIdOrFail(orderId);
    this.ensureBuyer(order, userId);

    if ([OrderStatus.CANCELLED].includes(order.status)) {
      throw new BadRequestException(
        'Refund request is not allowed for cancelled order',
      );
    }

    const reason =
      payload?.reason?.trim() ||
      `Buyer requested refund for ${order.orderNumber}.`;
    const ticket = await this.createOrderRequestTicket({
      order,
      userId,
      category: TicketCategory.REFUND,
      subject: `Refund request for ${order.orderNumber}`,
      message: reason,
      tags: ['order-refund-request'],
    });

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      requestType: 'refund',
      reason,
      ticket,
    };
  }

  async updateOrderStatusByStaff(
    orderId: string,
    actorUserId: string,
    payload: UpdateStoreOrderStatusDto,
  ) {
    const targetStatus = payload.status;
    if (targetStatus === OrderStatus.DELIVERED) {
      throw new BadRequestException(
        'Use /store/orders/:id/deliver to move order to delivered status',
      );
    }

    const order = await this.executeInTransaction(async (session) => {
      const order = await this.findOrderByIdOrFail(orderId, session);
      if (order.status === targetStatus) {
        return order;
      }

      if (targetStatus === OrderStatus.COMPLETED) {
        if (order.status !== OrderStatus.DELIVERED) {
          throw new BadRequestException(
            'Only delivered order can be completed manually',
          );
        }
        return this.completeOrder(
          order,
          actorUserId,
          payload.note?.trim() || 'Completed by staff',
          session,
        );
      }

      const allowed = this.getAllowedStaffTransitions(order.status);
      if (!allowed.includes(targetStatus)) {
        throw new BadRequestException(
          `Invalid status transition ${order.status} -> ${targetStatus}`,
        );
      }

      if (targetStatus === OrderStatus.CANCELLED) {
        order.cancelReason = payload.note?.trim();
      }
      this.markStatus(
        order,
        targetStatus,
        actorUserId,
        payload.note?.trim() || 'Status updated by staff',
      );
      await order.save({ session });
      return order;
    });

    if (order.status === OrderStatus.COMPLETED) {
      if (order.sellerId) {
        await this.gamificationService
          ?.recordOrderCompleted(order.sellerId.toString(), order.id, false)
          .catch(() => undefined);
      }
      await this.safeNotifyOrderCompletion(order, false);
    }

    return order;
  }

  async createQuote(
    orderId: string,
    actorUserId: string,
    payload: CreateOrderQuoteDto,
  ) {
    const order = await this.executeInTransaction(async (session) => {
      const order = await this.findOrderByIdOrFail(orderId, session);
      this.ensureCustomOrder(order);
      if (![OrderStatus.PENDING, OrderStatus.QUOTED].includes(order.status)) {
        throw new BadRequestException(
          'Order cannot be quoted in current status',
        );
      }

      order.quote = {
        priceAmount: payload.priceAmount,
        estimatedDays: payload.estimatedDays,
        note: payload.note?.trim(),
        quotedAt: new Date(),
        quotedBy: new Types.ObjectId(actorUserId),
      };
      order.subtotal = payload.priceAmount;
      order.total = payload.priceAmount;
      order.discountTotal = 0;
      this.markStatus(order, OrderStatus.QUOTED, actorUserId, 'Quote created');
      await order.save({ session });
      return order;
    });

    await this.safeNotifyStoreUser(
      order.buyerId.toString(),
      NotificationType.STORE_QUOTE_CREATED,
      `Quote available for ${order.orderNumber}`,
      'Your custom order has a new quote from staff.',
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        priceAmount: order.quote?.priceAmount,
        estimatedDays: order.quote?.estimatedDays,
      },
    );

    return order;
  }

  async acceptQuote(
    orderId: string,
    userId: string,
    payload: AcceptOrderQuoteDto,
  ) {
    const order = await this.executeInTransaction(async (session) => {
      const order = await this.findOrderByIdOrFail(orderId, session);
      this.ensureCustomOrder(order);
      this.ensureBuyer(order, userId);

      if (order.buyerTransactionId) {
        if (order.status !== OrderStatus.PROCESSING) {
          this.markStatus(
            order,
            OrderStatus.PROCESSING,
            userId,
            'Quote accepted (idempotent replay)',
          );
          await order.save({ session });
        }

        return order;
      }

      if (order.status !== OrderStatus.QUOTED || !order.quote) {
        throw new BadRequestException(
          'Order quote is not available for acceptance',
        );
      }

      const stockChanges = await this.productsService.decrementStockOrFail(
        order.items.map((item) => ({
          productId: item.productId.toString(),
          quantity: item.quantity,
        })),
        session,
      );

      try {
        const transaction = await this.walletService.purchase(
          userId,
          order.quote.priceAmount,
          {
            description: `Custom quote payment (${order.orderNumber})`,
            note: `Order ${order.orderNumber}`,
            reference: {
              model: 'order',
              id: order.id,
            },
            idempotencyKey: payload.idempotencyKey,
            metadata: {
              orderNumber: order.orderNumber,
              source: order.source,
              quoteAcceptance: true,
            },
          },
          session,
        );

        order.quote.acceptedAt = new Date();
        order.subtotal = order.quote.priceAmount;
        order.total = order.quote.priceAmount;
        order.discountTotal = 0;
        order.paidAt = new Date();
        order.buyerTransactionId = this.toObjectIdOrUndefined(transaction);
        order.transactionId = this.toObjectIdOrUndefined(transaction);

        this.markStatus(
          order,
          OrderStatus.QUOTE_ACCEPTED,
          userId,
          'Quote accepted',
        );
        this.markStatus(
          order,
          OrderStatus.PROCESSING,
          userId,
          'Processing started',
        );

        await order.save({ session });
        return order;
      } catch (error) {
        if (stockChanges.length > 0) {
          await this.productsService
            .restoreStock(stockChanges, session)
            .catch(() => undefined);
        }
        throw error;
      }
    });

    await this.safeNotifyStoreOperators(
      NotificationType.STORE_QUOTE_ACCEPTED,
      `Quote accepted for ${order.orderNumber}`,
      'Buyer accepted the custom-order quote.',
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        buyerId: order.buyerId.toString(),
        total: order.total,
      },
      order,
      userId,
    );

    return order;
  }

  async rejectQuote(
    orderId: string,
    userId: string,
    payload: RejectOrderQuoteDto,
  ) {
    const order = await this.executeInTransaction(async (session) => {
      const order = await this.findOrderByIdOrFail(orderId, session);
      this.ensureCustomOrder(order);
      this.ensureBuyer(order, userId);

      if (order.status !== OrderStatus.QUOTED) {
        throw new BadRequestException('Order quote is not in quoted status');
      }

      order.cancelReason = payload.reason?.trim();
      this.markStatus(order, OrderStatus.CANCELLED, userId, 'Quote rejected');
      await order.save({ session });
      return order;
    });

    await this.safeNotifyStoreOperators(
      NotificationType.STORE_QUOTE_REJECTED,
      `Quote rejected for ${order.orderNumber}`,
      'Buyer rejected the custom-order quote.',
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        buyerId: order.buyerId.toString(),
        reason: payload.reason,
      },
      order,
      userId,
    );

    return order;
  }

  async deliverOrder(
    orderId: string,
    actorUserId: string,
    file: {
      buffer: Buffer;
      size: number;
      mimetype?: string;
      originalname?: string;
    },
  ) {
    const result = await this.executeInTransaction(async (session) => {
      const order = await this.findOrderByIdOrFail(orderId, session);

      if (
        [OrderStatus.CANCELLED, OrderStatus.COMPLETED].includes(order.status)
      ) {
        throw new BadRequestException(
          'Order cannot receive delivery in current status',
        );
      }

      if (
        ![
          OrderStatus.PAID,
          OrderStatus.QUOTE_ACCEPTED,
          OrderStatus.PROCESSING,
          OrderStatus.DELIVERED,
        ].includes(order.status)
      ) {
        throw new BadRequestException('Order is not ready for delivery');
      }

      const bucketName = this.minioService.getBucket('products');
      const upload = await this.minioService.uploadFile(
        bucketName,
        file,
        `orders/${order.id}/delivery`,
      );
      const deliveryFileObjectName = upload.objectName;

      if (!Array.isArray(order.deliveryFiles)) {
        order.deliveryFiles = [] as never;
      }
      order.deliveryFiles.push({
        bucketName: upload.bucketName,
        objectName: upload.objectName,
        fileName: file.originalname?.trim() || 'delivery.bin',
        mimeType: file.mimetype,
        size: file.size,
        etag: upload.etag,
        uploadedAt: new Date(),
        uploadedBy: new Types.ObjectId(actorUserId),
        fromProductAsset: false,
      } as never);

      if (order.status !== OrderStatus.DELIVERED) {
        order.deliveredAt = new Date();
        order.autoCompleteAt = this.calculateAutoCompleteAt(order.deliveredAt);
        this.markStatus(
          order,
          OrderStatus.DELIVERED,
          actorUserId,
          'Delivery uploaded',
        );
      }

      await order.save({ session });
      return {
        order,
        deliveryFileObjectName,
      };
    });

    await this.dispatchDeliveryEmail(
      result.order.id,
      result.deliveryFileObjectName,
    );
    await this.safeNotifyStoreUser(
      result.order.buyerId.toString(),
      NotificationType.STORE_DELIVERY_UPLOADED,
      `Delivery uploaded for ${result.order.orderNumber}`,
      'Your order has a new delivery file ready for download.',
      {
        orderId: result.order.id,
        orderNumber: result.order.orderNumber,
        status: result.order.status,
      },
    );
    return result.order;
  }

  async getOrderDownloadLink(orderId: string, user: AuthUser, fileId?: string) {
    const order = await this.getOrderForUser(orderId, user);
    if (
      ![OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(order.status)
    ) {
      throw new BadRequestException('Order has not been delivered yet');
    }

    const deliveryFiles = Array.isArray(order.deliveryFiles)
      ? order.deliveryFiles
      : [];
    if (!deliveryFiles.length) {
      throw new NotFoundException('No delivery files available for this order');
    }

    let targetFile = fileId
      ? deliveryFiles.find((item) => item._id?.toString() === fileId)
      : undefined;

    if (!targetFile) {
      targetFile = deliveryFiles[deliveryFiles.length - 1];
    }

    if (!targetFile) {
      throw new NotFoundException('Delivery file not found');
    }

    const exists = await this.minioService.objectExists(
      targetFile.bucketName,
      targetFile.objectName,
    );
    if (!exists) {
      throw new NotFoundException('Delivery file object is missing');
    }

    const ttl =
      this.configService.get<number>('store.downloadUrlTtlSeconds') ?? 3600;
    const downloadUrl = await this.minioService.createPresignedDownloadUrl(
      targetFile.bucketName,
      targetFile.objectName,
      {
        expirySeconds: ttl,
        fileName: targetFile.fileName,
        contentType: targetFile.mimeType,
      },
    );

    return {
      orderId: order.id,
      fileId: targetFile._id?.toString(),
      fileName: targetFile.fileName,
      mimeType: targetFile.mimeType,
      size: targetFile.size,
      expiresInSeconds: ttl,
      downloadUrl,
    };
  }

  @Cron(CronExpression.EVERY_HOUR)
  async processAutoCompleteOrders() {
    if (this.autoCompleteProcessing) {
      return;
    }

    this.autoCompleteProcessing = true;
    try {
      const now = new Date();
      const dueOrders = await this.orderModel
        .find({
          status: OrderStatus.DELIVERED,
          autoCompleteAt: { $lte: now },
        })
        .sort({ autoCompleteAt: 1 })
        .limit(100)
        .select({ _id: 1 })
        .lean<Array<{ _id: Types.ObjectId }>>()
        .exec();

      for (const order of dueOrders) {
        const completedOrder = await this.executeInTransaction(
          async (session) => {
            const target = await this.findOrderByIdOrFail(
              order._id.toString(),
              session,
            );
            return this.completeOrder(
              target,
              undefined,
              'Auto-completed after delivery',
              session,
            );
          },
        ).catch(() => undefined);

        if (completedOrder) {
          if (completedOrder.sellerId) {
            await this.gamificationService
              ?.recordOrderCompleted(
                completedOrder.sellerId.toString(),
                completedOrder.id,
                true,
              )
              .catch(() => undefined);
          }
          await this.safeNotifyOrderCompletion(completedOrder, true);
        }
      }
    } finally {
      this.autoCompleteProcessing = false;
    }
  }

  private async createCustomOrder(
    userId: string,
    payload: CreateOrderDto,
    pricingContext?: BuyerPricingContext,
  ) {
    return this.executeInTransaction(async (session) => {
      const existingOrder = await this.findByIdempotencyKey(
        userId,
        payload.idempotencyKey,
        session,
      );
      if (existingOrder) {
        return existingOrder;
      }

      const product = await this.productsService.findOrderableByIdOrFail(
        payload.productId,
        session,
      );
      if (product.type !== ProductType.CUSTOM_ORDER) {
        throw new BadRequestException('Product is not custom-order type');
      }

      const resolvedPricingContext =
        pricingContext ?? (await this.getBuyerPricingContext(userId, session));
      if (product.vipOnly && !resolvedPricingContext.isVipActive) {
        throw new ForbiddenException(
          'VIP subscription is required to request this custom order',
        );
      }

      const quantity = Math.max(1, Math.floor(payload.quantity));
      const lineTotal = product.priceAmount * quantity;
      const orderId = new Types.ObjectId();
      const orderNumber = this.buildOrderNumber(orderId);

      const created = await this.orderModel.create(
        [
          {
            _id: orderId,
            orderNumber,
            buyerId: new Types.ObjectId(userId),
            sellerId: this.getStoreOwnerObjectIdOrUndefined(),
            items: [
              {
                productId: new Types.ObjectId(product.id),
                productName: product.name,
                productSlug: product.slug,
                productType: product.type,
                unitPrice: product.priceAmount,
                quantity,
                lineTotal,
                currency: product.currency,
                customData: payload.customData,
              },
            ],
            subtotal: lineTotal,
            discountTotal: 0,
            total: lineTotal,
            currency: product.currency,
            status: OrderStatus.PENDING,
            source: OrderSource.BUY_NOW,
            idempotencyKey: payload.idempotencyKey,
            statusHistory: [
              {
                to: OrderStatus.PENDING,
                changedAt: new Date(),
                note: 'Custom order created',
                changedBy: new Types.ObjectId(userId),
              },
            ],
          },
        ],
        { session },
      );

      return created[0];
    });
  }

  private async autoDeliverDigitalOrder(
    order: OrderDocument,
    session: ClientSession,
  ): Promise<void> {
    if (!order.items.length) {
      return;
    }

    const files = order.items
      .filter(
        (item) => item.productType === ProductType.DIGITAL && item.digitalAsset,
      )
      .map((item) => ({
        bucketName: item.digitalAsset!.bucketName,
        objectName: item.digitalAsset!.objectName,
        fileName: item.digitalAsset!.fileName,
        mimeType: item.digitalAsset!.mimeType,
        size: item.digitalAsset!.size,
        uploadedAt: new Date(),
        fromProductAsset: true,
      }));

    if (!files.length) {
      return;
    }

    order.deliveryFiles = files as never;
    order.deliveredAt = new Date();
    order.autoCompleteAt = this.calculateAutoCompleteAt(order.deliveredAt);
    this.markStatus(
      order,
      OrderStatus.DELIVERED,
      undefined,
      'Auto-delivered digital assets',
    );
    await order.save({ session });
  }

  private async completeOrder(
    order: OrderDocument,
    actorUserId: string | undefined,
    note: string,
    session: ClientSession,
  ) {
    if (order.status === OrderStatus.COMPLETED) {
      return order;
    }

    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('Order is not in delivered status');
    }

    this.markStatus(order, OrderStatus.COMPLETED, actorUserId, note);
    order.completedAt = new Date();
    await this.settleOrder(order, session);
    await order.save({ session });
    return order;
  }

  private async settleOrder(order: OrderDocument, session: ClientSession) {
    if (order.settledAt || order.sellerTransactionId) {
      return;
    }

    if (!order.buyerTransactionId && !order.transactionId) {
      return;
    }

    const sellerId = this.resolveSellerId(order);
    const feePercent =
      this.configService.get<number>('store.platformFeePercent') ?? 10;
    const rawFee = Math.round((order.total * feePercent) / 100);
    const platformFee = Math.max(0, Math.min(order.total, rawFee));
    const sellerReceives = Math.max(0, order.total - platformFee);

    const saleTx = await this.walletService.recordSaleIncome(
      sellerId,
      order.total,
      {
        description: `Order settlement income (${order.orderNumber})`,
        note: `Order ${order.orderNumber}`,
        reference: {
          model: 'order',
          id: order.id,
        },
        idempotencyKey: `order:${order.id}:sale_income`,
      },
      session,
    );

    let feeTx: { _id?: unknown } | null = null;
    if (platformFee > 0) {
      feeTx = await this.walletService.recordPlatformFee(
        sellerId,
        platformFee,
        {
          description: `Platform fee (${feePercent}%) for ${order.orderNumber}`,
          note: `Order ${order.orderNumber}`,
          reference: {
            model: 'order',
            id: order.id,
          },
          idempotencyKey: `order:${order.id}:platform_fee`,
        },
        session,
      );
    }

    order.platformFee = platformFee;
    order.sellerReceives = sellerReceives;
    order.sellerTransactionId = this.toObjectIdOrUndefined(saleTx);
    order.platformFeeTransactionId = this.toObjectIdOrUndefined(feeTx);
    order.settledAt = new Date();
  }

  private async getBuyerPricingContext(
    userId: string,
    session?: ClientSession,
  ): Promise<BuyerPricingContext> {
    const defaultContext: BuyerPricingContext = {
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

    const normalizedSubscription = normalizeSubscription(user.subscription);
    const planCode = normalizedSubscription.planCode;
    const perks = getSubscriptionPlanDefinition(planCode).perks;

    return {
      isVipActive:
        normalizedSubscription.status === SubscriptionStatus.ACTIVE &&
        planCode === SubscriptionPlanCode.VIP,
      storeDiscountPercent: Math.max(0, perks.storeDiscountPercent ?? 0),
      planCode,
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

  private resolveSellerId(order: OrderDocument): string {
    if (order.sellerId && Types.ObjectId.isValid(order.sellerId.toString())) {
      return order.sellerId.toString();
    }

    const configured =
      this.configService.get<string>('store.ownerUserId')?.trim() ?? '';
    if (!Types.ObjectId.isValid(configured)) {
      throw new InternalServerErrorException(
        'STORE_OWNER_USER_ID is missing or invalid for order settlement',
      );
    }

    return configured;
  }

  private ensureBuyer(order: OrderDocument, userId: string) {
    if (order.buyerId.toString() !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this order',
      );
    }
  }

  private ensureCustomOrder(order: OrderDocument) {
    const custom = order.items.some(
      (item) => item.productType === ProductType.CUSTOM_ORDER,
    );
    if (!custom) {
      throw new BadRequestException('Order is not a custom order');
    }
  }

  private getAllowedStaffTransitions(status: OrderStatus): OrderStatus[] {
    const transitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
      [OrderStatus.PENDING]: [OrderStatus.CANCELLED],
      [OrderStatus.QUOTED]: [OrderStatus.CANCELLED],
      [OrderStatus.PAID]: [OrderStatus.PROCESSING],
      [OrderStatus.QUOTE_ACCEPTED]: [OrderStatus.PROCESSING],
      [OrderStatus.DELIVERED]: [OrderStatus.COMPLETED],
    };

    return transitions[status] ?? [];
  }

  private async createOrderRequestTicket(input: {
    order: OrderDocument;
    userId: string;
    category: TicketCategory.ORDER_ISSUE | TicketCategory.REFUND;
    subject: string;
    message: string;
    tags?: string[];
  }) {
    const result = await this.ticketsService.createOrAppendOrderRequestTicket({
      userId: input.userId,
      userRole: Role.AUTHOR,
      orderId: input.order.id,
      orderNumber: input.order.orderNumber,
      category: input.category,
      subject: input.subject,
      message: input.message,
      tags: input.tags,
    });

    return {
      ticketId: result.ticket.id,
      ticketNumber: result.ticket.ticketNumber,
      appended: result.appended,
    };
  }

  private markStatus(
    order: OrderDocument,
    nextStatus: OrderStatus,
    actorUserId?: string,
    note?: string,
  ) {
    const from = order.status;
    if (from === nextStatus) {
      return;
    }

    order.status = nextStatus;
    if (!Array.isArray(order.statusHistory)) {
      order.statusHistory = [] as never;
    }
    order.statusHistory.push({
      from,
      to: nextStatus,
      note,
      changedBy:
        actorUserId && Types.ObjectId.isValid(actorUserId)
          ? new Types.ObjectId(actorUserId)
          : undefined,
      changedAt: new Date(),
    } as never);
  }

  private isElevatedRole(role: Role) {
    return role === Role.STAFF || role === Role.ADMIN;
  }

  private calculateAutoCompleteAt(deliveredAt: Date): Date {
    const days = this.configService.get<number>('store.autoCompleteDays') ?? 7;
    return new Date(deliveredAt.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private getStoreOwnerObjectIdOrUndefined(): Types.ObjectId | undefined {
    const configured =
      this.configService.get<string>('store.ownerUserId')?.trim() ?? '';
    if (!Types.ObjectId.isValid(configured)) {
      return undefined;
    }

    return new Types.ObjectId(configured);
  }

  private toObjectIdOrUndefined(input: { _id?: unknown } | null | undefined) {
    if (!input || !input._id) {
      return undefined;
    }

    const value = String(input._id);
    return Types.ObjectId.isValid(value)
      ? new Types.ObjectId(value)
      : undefined;
  }

  private async findOrderByIdOrFail(orderId: string, session?: ClientSession) {
    const query = this.orderModel.findById(orderId);
    if (session) {
      query.session(session);
    }

    const order = await query.exec();
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  private async findByIdempotencyKey(
    userId: string,
    idempotencyKey: string | undefined,
    session?: ClientSession,
  ) {
    if (!idempotencyKey) {
      return null;
    }

    const query = this.orderModel.findOne({
      buyerId: new Types.ObjectId(userId),
      idempotencyKey,
    });
    if (session) {
      query.session(session);
    }

    return query.exec();
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

  private async safeNotifyStoreUser(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.notificationsService || !Types.ObjectId.isValid(userId)) {
      return;
    }

    await this.notificationsService
      .createStoreNotification({
        userId,
        type,
        title,
        message,
        metadata,
      })
      .catch(() => undefined);
  }

  private async safeNotifyStoreOperators(
    type: NotificationType,
    title: string,
    message: string,
    metadata: Record<string, unknown> | undefined,
    order?: { sellerId?: Types.ObjectId },
    excludeUserId?: string,
  ): Promise<void> {
    if (!this.notificationsService) {
      return;
    }

    const recipients = await this.resolveStoreOperatorUserIds(
      order?.sellerId?.toString(),
    );
    const filteredRecipients = excludeUserId
      ? recipients.filter((userId) => userId !== excludeUserId)
      : recipients;
    if (!filteredRecipients.length) {
      return;
    }

    await this.notificationsService
      .createForUsers({
        userIds: filteredRecipients,
        category: NotificationCategory.STORE,
        type,
        title,
        message,
        metadata,
      })
      .catch(() => undefined);
  }

  private async safeNotifyOrderCompletion(
    order: OrderDocument,
    autoCompleted: boolean,
  ): Promise<void> {
    const type = autoCompleted
      ? NotificationType.STORE_ORDER_AUTO_COMPLETED
      : NotificationType.STORE_ORDER_COMPLETED;
    const title = autoCompleted
      ? `Order ${order.orderNumber} auto-completed`
      : `Order ${order.orderNumber} completed`;
    const message = autoCompleted
      ? 'Order has been auto-completed after delivery window.'
      : 'Order has been completed.';

    await Promise.all([
      this.safeNotifyStoreUser(order.buyerId.toString(), type, title, message, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        autoCompleted,
      }),
      this.safeNotifyStoreOperators(
        type,
        title,
        message,
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          buyerId: order.buyerId.toString(),
          autoCompleted,
        },
        order,
      ),
    ]);
  }

  private async resolveStoreOperatorUserIds(
    sellerId?: string,
  ): Promise<string[]> {
    const recipients = new Set<string>();

    if (sellerId && Types.ObjectId.isValid(sellerId)) {
      recipients.add(sellerId);
    }

    if (!this.userModel) {
      return [...recipients];
    }

    const operators = await this.userModel
      .find({
        role: { $in: [Role.STAFF, Role.ADMIN] },
        isActive: { $ne: false },
      })
      .select({ _id: 1 })
      .lean<Array<{ _id: Types.ObjectId }>>()
      .exec();

    for (const operator of operators) {
      recipients.add(operator._id.toString());
    }

    return [...recipients];
  }

  private async dispatchDeliveryEmailForLatestFile(order: OrderDocument) {
    const latestFile =
      Array.isArray(order.deliveryFiles) && order.deliveryFiles.length > 0
        ? order.deliveryFiles[order.deliveryFiles.length - 1]
        : undefined;

    if (!latestFile?.objectName) {
      return;
    }

    await this.dispatchDeliveryEmail(order.id, latestFile.objectName);
  }

  async dispatchDeliveryEmailForOrder(order: {
    id: string;
    deliveryFiles?: Array<{ objectName?: string }>;
  }) {
    const latestFile =
      Array.isArray(order.deliveryFiles) && order.deliveryFiles.length > 0
        ? order.deliveryFiles[order.deliveryFiles.length - 1]
        : undefined;

    if (!latestFile?.objectName) {
      return;
    }

    await this.dispatchDeliveryEmail(order.id, latestFile.objectName);
  }

  private async dispatchDeliveryEmail(orderId: string, fileObjectName: string) {
    try {
      await this.orderDeliveryEmailService.dispatchDeliveryEmail(
        orderId,
        fileObjectName,
      );
    } catch (error) {
      this.logger.warn(
        `Delivery email trigger failed for order=${orderId}, file=${fileObjectName}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }
}
