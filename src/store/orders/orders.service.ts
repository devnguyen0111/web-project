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
import { MinioService } from '../../minio/minio.service';
import { WalletService } from '../../wallet/wallet.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { QuoteOrderDto } from './dto/quote-order.dto';
import { StoreOrderQueryDto } from './dto/store-order-query.dto';
import { StoreRevenueQueryDto } from './dto/store-revenue-query.dto';
import { UpdateStoreOrderStatusDto } from './dto/update-store-order-status.dto';
import { PRODUCT_MODEL_NAME } from './orders.constants';
import {
  Order,
  OrderDeliveryFile,
  OrderDocument,
  OrderItem,
  OrderProductSnapshot,
  OrderStatus,
  OrderStatusHistoryEntry,
  StoreProductType,
} from './schemas/order.schema';

type StoreProductFile = {
  filename: string;
  storagePath: string;
  size: number;
  mimeType?: string;
  version?: number;
  uploadedAt?: Date | string;
};

type StoreProduct = {
  _id: Types.ObjectId;
  sellerId: Types.ObjectId | string;
  name: string;
  slug: string;
  description?: string;
  shortDescription?: string;
  type: StoreProductType;
  price: number;
  originalPrice?: number;
  status: string;
  stock?: number;
  maxPerUser?: number;
  files?: StoreProductFile[];
  previewUrl?: string;
  images?: Array<{ url: string; alt?: string; order?: number }>;
  save?: (options?: { session?: ClientSession }) => Promise<StoreProduct>;
};

const ORDER_AUTO_COMPLETE_DAYS = 7;
const CANCELABLE_STATUSES = new Set<OrderStatus>([
  OrderStatus.PENDING,
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
]);
const NON_COUNTING_STATUSES = new Set<OrderStatus>([
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
]);
const REVENUE_RECOGNIZED_STATUSES = new Set<OrderStatus>([OrderStatus.COMPLETED]);
const REVENUE_GROSS_STATUSES = new Set<OrderStatus>([
  OrderStatus.PAID,
  OrderStatus.QUOTED,
  OrderStatus.QUOTE_ACCEPTED,
  OrderStatus.PROCESSING,
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
]);

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(PRODUCT_MODEL_NAME)
    private readonly productModel: Model<StoreProduct>,
    @InjectConnection() private readonly connection: Connection,
    private readonly walletService: WalletService,
    private readonly minioService: MinioService,
    private readonly mongoTransactionService: MongoTransactionService,
  ) {}

  async createOrder(userId: string, dto: CreateOrderDto): Promise<OrderDocument> {
    return this.executeInTransaction(async (session) => {
      const quantity = this.normalizeQuantity(dto.quantity);
      const product = await this.findProductForPurchase(dto.productId, session);
      await this.assertPurchaseConstraints(userId, product, quantity, session);

      const orderNumber = await this.generateUniqueOrderNumber(session);
      const createdAt = new Date();
      const unitPrice = this.normalizeMoney(product.price);
      const discount = 0;
      const subtotal = unitPrice * quantity - discount;
      const platformFee = 0;
      const totalAmount = subtotal + platformFee;
      const sellerReceives = totalAmount - platformFee;

      const buyerTransaction = await this.walletService.purchase(
        userId,
        totalAmount,
        {
          description: `Purchase order ${orderNumber}`,
          note: dto.buyerNote,
          reference: {
            model: 'product',
            id: product._id.toString(),
          },
          idempotencyKey: `order:${orderNumber}:purchase`,
          metadata: {
            orderNumber,
            productId: product._id.toString(),
            productSlug: product.slug,
            quantity,
            customData: dto.customData ?? null,
          },
        },
        session,
      );

      const statusHistory: OrderStatusHistoryEntry[] = [
        {
          from: OrderStatus.PENDING,
          to: OrderStatus.PAID,
          note: 'Order paid with wallet purchase',
          changedBy: new Types.ObjectId(userId),
          changedAt: createdAt,
        },
      ];

      const deliveryFiles =
        product.type === StoreProductType.DIGITAL
          ? this.buildDeliveryFiles(product.files)
          : [];

      if (product.type === StoreProductType.DIGITAL && deliveryFiles.length === 0) {
        throw new BadRequestException(
          'Digital products must include at least one delivery file',
        );
      }

      const finalStatus =
        product.type === StoreProductType.DIGITAL
          ? OrderStatus.DELIVERED
          : OrderStatus.PAID;
      const deliveredAt =
        finalStatus === OrderStatus.DELIVERED ? createdAt : undefined;
      const autoCompleteAt =
        finalStatus === OrderStatus.DELIVERED
          ? new Date(
              createdAt.getTime() + ORDER_AUTO_COMPLETE_DAYS * 24 * 60 * 60 * 1000,
            )
          : undefined;

      if (finalStatus === OrderStatus.DELIVERED) {
        statusHistory.push({
          from: OrderStatus.PAID,
          to: OrderStatus.DELIVERED,
          note: 'Digital delivery available immediately after purchase',
          changedBy: new Types.ObjectId(userId),
          changedAt: createdAt,
        });
      }

      await this.reserveProductStock(product, quantity, session);

      const [order] = await this.orderModel.create(
        [
          {
            orderNumber,
            buyerId: new Types.ObjectId(userId),
            sellerId: this.toObjectId(product.sellerId),
            items: [
              {
                productId: product._id,
                productSnapshot: this.buildProductSnapshot(product),
                quantity,
                unitPrice,
                discount,
                subtotal,
                customData: dto.customData,
              } satisfies OrderItem,
            ],
            subtotal,
            platformFee,
            totalAmount,
            sellerReceives,
            buyerTransactionId: buyerTransaction._id,
            status: finalStatus,
            deliveryFiles,
            deliveredAt,
            autoCompleteAt,
            statusHistory,
            buyerNote: dto.buyerNote,
          },
        ],
        { session },
      );

      return order;
    });
  }

  async listMyOrders(
    userId: string,
    query: OrderQueryDto,
  ): Promise<PaginatedResponseDto<OrderDocument>> {
    const filter: Record<string, unknown> = {
      buyerId: new Types.ObjectId(userId),
    };

    const statuses = this.parseStatusFilter(query.status);
    if (statuses.length > 0) {
      filter.status = { $in: statuses };
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .exec(),
      this.orderModel.countDocuments(filter).exec(),
    ]);

    return new PaginatedResponseDto(data, total, query.page, query.limit);
  }

  async listStoreOrders(
    query: StoreOrderQueryDto,
  ): Promise<PaginatedResponseDto<OrderDocument>> {
    const filter: Record<string, unknown> = {};
    const statuses = this.parseStatusFilter(query.status);
    if (statuses.length > 0) {
      filter.status = { $in: statuses };
    }
    if (query.buyerId) {
      filter.buyerId = new Types.ObjectId(query.buyerId);
    }
    if (query.sellerId) {
      filter.sellerId = new Types.ObjectId(query.sellerId);
    }
    if (query.orderNumber?.trim()) {
      filter.orderNumber = new RegExp(
        this.escapeRegex(query.orderNumber.trim()),
        'i',
      );
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .exec(),
      this.orderModel.countDocuments(filter).exec(),
    ]);

    return new PaginatedResponseDto(data, total, query.page, query.limit);
  }

  async getOrderDetail(
    requesterUserId: string,
    requesterRole: Role,
    orderId: string,
  ): Promise<OrderDocument> {
    const order = await this.findOrderById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (
      order.buyerId.toString() !== requesterUserId &&
      requesterRole !== Role.STAFF &&
      requesterRole !== Role.ADMIN
    ) {
      throw new ForbiddenException('You cannot access this order');
    }

    return order;
  }

  async cancelOrder(
    userId: string,
    orderId: string,
    reason?: string,
  ): Promise<OrderDocument> {
    return this.executeInTransaction(async (session) => {
      const order = await this.findOrderById(orderId, session);
      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (order.buyerId.toString() !== userId) {
        throw new ForbiddenException('You cannot cancel this order');
      }

      if (!CANCELABLE_STATUSES.has(order.status)) {
        throw new BadRequestException(
          'Order cannot be cancelled in its current status',
        );
      }

      const previousStatus = order.status;
      const refundTransaction = await this.walletService.refund(
        userId,
        order.totalAmount,
        {
          description: `Refund order ${order.orderNumber}`,
          note: reason,
          reference: {
            model: 'order',
            id: order.id,
          },
          idempotencyKey: `order:${order.id}:refund`,
          metadata: {
            orderNumber: order.orderNumber,
            cancelReason: reason ?? null,
          },
        },
        session,
      );

      await this.releaseProductStock(order, session);

      const now = new Date();
      order.status = OrderStatus.CANCELLED;
      order.cancelReason = reason;
      order.statusHistory.push({
        from: previousStatus,
        to: OrderStatus.CANCELLED,
        note: reason ?? 'Order cancelled by buyer',
        changedBy: new Types.ObjectId(userId),
        changedAt: now,
      });
      order.buyerTransactionId = order.buyerTransactionId ?? refundTransaction._id;
      await order.save({ session });
      return order;
    });
  }

  async quoteOrder(
    managerUserId: string,
    orderId: string,
    payload: QuoteOrderDto,
  ): Promise<OrderDocument> {
    return this.executeInTransaction(async (session) => {
      const order = await this.findOrderById(orderId, session);
      if (!order) {
        throw new NotFoundException('Order not found');
      }

      this.ensureCustomOrder(order);
      if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.QUOTED) {
        throw new BadRequestException(
          'Only paid or quoted custom orders can be quoted',
        );
      }

      const now = new Date();
      const nextStatus = OrderStatus.QUOTED;
      order.quote = {
        price: this.normalizeMoney(payload.price),
        estimatedDays: payload.estimatedDays,
        note: payload.note?.trim(),
        quotedAt: now,
        acceptedAt: undefined,
      };
      order.statusHistory.push({
        from: order.status,
        to: nextStatus,
        note: payload.note?.trim() || 'Custom order quoted',
        changedBy: new Types.ObjectId(managerUserId),
        changedAt: now,
      });
      order.status = nextStatus;
      if (payload.note?.trim()) {
        order.managerNote = payload.note.trim();
      }
      await order.save({ session });
      return order;
    });
  }

  async acceptQuote(userId: string, orderId: string): Promise<OrderDocument> {
    return this.executeInTransaction(async (session) => {
      const order = await this.findOrderById(orderId, session);
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      this.ensureBuyerAccess(order, userId);
      this.ensureCustomOrder(order);

      if (order.status !== OrderStatus.QUOTED || !order.quote) {
        throw new BadRequestException('Order does not have a pending quote');
      }

      const quotePrice = this.normalizeMoney(order.quote.price);
      const currentTotal = this.normalizeMoney(order.totalAmount);
      const delta = quotePrice - currentTotal;
      const now = new Date();

      if (delta > 0) {
        await this.walletService.purchase(
          userId,
          delta,
          {
            description: `Quote adjustment charge for ${order.orderNumber}`,
            reference: {
              model: 'order',
              id: order.id,
            },
            idempotencyKey: `order:${order.id}:quote:accept:charge`,
            metadata: {
              orderNumber: order.orderNumber,
              quotePrice,
              previousTotal: currentTotal,
              adjustmentAmount: delta,
            },
          },
          session,
        );
      } else if (delta < 0) {
        await this.walletService.refund(
          userId,
          Math.abs(delta),
          {
            description: `Quote adjustment refund for ${order.orderNumber}`,
            reference: {
              model: 'order',
              id: order.id,
            },
            idempotencyKey: `order:${order.id}:quote:accept:refund`,
            metadata: {
              orderNumber: order.orderNumber,
              quotePrice,
              previousTotal: currentTotal,
              adjustmentAmount: Math.abs(delta),
            },
          },
          session,
        );
      }

      order.quote = {
        ...order.quote,
        price: quotePrice,
        acceptedAt: now,
      };
      order.subtotal = quotePrice;
      order.totalAmount = quotePrice;
      order.sellerReceives = Math.max(quotePrice - order.platformFee, 0);

      order.statusHistory.push({
        from: OrderStatus.QUOTED,
        to: OrderStatus.QUOTE_ACCEPTED,
        note: 'Buyer accepted quote',
        changedBy: new Types.ObjectId(userId),
        changedAt: now,
      });
      order.statusHistory.push({
        from: OrderStatus.QUOTE_ACCEPTED,
        to: OrderStatus.PROCESSING,
        note: 'Custom order moved to processing',
        changedBy: new Types.ObjectId(userId),
        changedAt: now,
      });
      order.status = OrderStatus.PROCESSING;
      await order.save({ session });
      return order;
    });
  }

  async rejectQuote(
    userId: string,
    orderId: string,
    reason?: string,
  ): Promise<OrderDocument> {
    return this.executeInTransaction(async (session) => {
      const order = await this.findOrderById(orderId, session);
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      this.ensureBuyerAccess(order, userId);
      this.ensureCustomOrder(order);

      if (order.status !== OrderStatus.QUOTED || !order.quote) {
        throw new BadRequestException('Order does not have a pending quote');
      }

      const refundAmount = this.normalizeMoney(order.totalAmount);
      await this.walletService.refund(
        userId,
        refundAmount,
        {
          description: `Quote rejection refund for ${order.orderNumber}`,
          note: reason,
          reference: {
            model: 'order',
            id: order.id,
          },
          idempotencyKey: `order:${order.id}:quote:reject:refund`,
          metadata: {
            orderNumber: order.orderNumber,
            quotePrice: this.normalizeMoney(order.quote.price),
            refundAmount,
            reason: reason ?? null,
          },
        },
        session,
      );

      await this.releaseProductStock(order, session);

      const now = new Date();
      order.status = OrderStatus.CANCELLED;
      order.cancelReason = reason?.trim() || 'Buyer rejected quote';
      order.refund = {
        reason: order.cancelReason,
        requestedAt: now,
        processedAt: now,
        processedBy: new Types.ObjectId(userId),
        amount: refundAmount,
      };
      order.statusHistory.push({
        from: OrderStatus.QUOTED,
        to: OrderStatus.CANCELLED,
        note: order.cancelReason,
        changedBy: new Types.ObjectId(userId),
        changedAt: now,
      });
      await order.save({ session });
      return order;
    });
  }

  async updateStoreOrderStatus(
    managerUserId: string,
    orderId: string,
    payload: UpdateStoreOrderStatusDto,
  ): Promise<OrderDocument> {
    const order = await this.findOrderById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const nextStatus = payload.status;
    const previousStatus = order.status;
    if (previousStatus === nextStatus) {
      return order;
    }

    if (!this.isAllowedStoreStatusTransition(previousStatus, nextStatus)) {
      throw new BadRequestException(
        `Cannot transition order from "${previousStatus}" to "${nextStatus}"`,
      );
    }

    const now = new Date();
    if (nextStatus === OrderStatus.DELIVERED) {
      if (order.deliveryFiles.length === 0) {
        throw new BadRequestException(
          'Order must have at least one delivery file before marking delivered',
        );
      }
      order.deliveredAt = order.deliveredAt ?? now;
      order.autoCompleteAt =
        order.autoCompleteAt ??
        new Date(now.getTime() + ORDER_AUTO_COMPLETE_DAYS * 24 * 60 * 60 * 1000);
    }

    if (nextStatus === OrderStatus.COMPLETED) {
      order.completedAt = now;
    }

    if (nextStatus === OrderStatus.CANCELLED && payload.note?.trim()) {
      order.cancelReason = payload.note.trim();
    }

    order.status = nextStatus;
    order.statusHistory.push({
      from: previousStatus,
      to: nextStatus,
      note: payload.note?.trim(),
      changedBy: new Types.ObjectId(managerUserId),
      changedAt: now,
    });

    await order.save();
    return order;
  }

  async getStoreDashboard(): Promise<{
    summary: {
      totalOrders: number;
      pendingOrders: number;
      completedOrders: number;
      cancelledOrders: number;
      disputedOrders: number;
      grossRevenue: number;
      recognizedRevenue: number;
      platformFeesCollected: number;
      averageOrderValue: number;
    };
    statusBreakdown: Array<{ status: OrderStatus; count: number }>;
    recentOrders: OrderDocument[];
  }> {
    const [totalOrders, statusBreakdownRaw, revenueRaw, recentOrders] =
      await Promise.all([
        this.orderModel.countDocuments({}).exec(),
        this.orderModel
          .aggregate<{ _id: OrderStatus; count: number }>([
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ])
          .exec(),
        this.orderModel
          .aggregate<{
            grossRevenue: number;
            recognizedRevenue: number;
            platformFeesCollected: number;
          }>([
            {
              $group: {
                _id: null,
                grossRevenue: {
                  $sum: {
                    $cond: [
                      { $in: ['$status', Array.from(REVENUE_GROSS_STATUSES)] },
                      '$totalAmount',
                      0,
                    ],
                  },
                },
                recognizedRevenue: {
                  $sum: {
                    $cond: [
                      { $in: ['$status', Array.from(REVENUE_RECOGNIZED_STATUSES)] },
                      '$sellerReceives',
                      0,
                    ],
                  },
                },
                platformFeesCollected: {
                  $sum: {
                    $cond: [
                      { $in: ['$status', Array.from(REVENUE_RECOGNIZED_STATUSES)] },
                      '$platformFee',
                      0,
                    ],
                  },
                },
              },
            },
          ])
          .exec(),
        this.orderModel.find({}).sort({ createdAt: -1 }).limit(10).exec(),
      ]);

    const statusCountMap = new Map<OrderStatus, number>();
    for (const row of statusBreakdownRaw) {
      statusCountMap.set(row._id, row.count);
    }

    const revenue = revenueRaw[0] ?? {
      grossRevenue: 0,
      recognizedRevenue: 0,
      platformFeesCollected: 0,
    };
    const averageOrderValue =
      totalOrders > 0 ? revenue.grossRevenue / totalOrders : 0;

    return {
      summary: {
        totalOrders,
        pendingOrders: [
          OrderStatus.PENDING,
          OrderStatus.PAID,
          OrderStatus.QUOTED,
          OrderStatus.QUOTE_ACCEPTED,
          OrderStatus.PROCESSING,
          OrderStatus.DELIVERED,
          OrderStatus.REFUND_REQUESTED,
        ].reduce((sum, status) => sum + (statusCountMap.get(status) ?? 0), 0),
        completedOrders: statusCountMap.get(OrderStatus.COMPLETED) ?? 0,
        cancelledOrders: statusCountMap.get(OrderStatus.CANCELLED) ?? 0,
        disputedOrders: statusCountMap.get(OrderStatus.DISPUTED) ?? 0,
        grossRevenue: this.normalizeMoney(revenue.grossRevenue),
        recognizedRevenue: this.normalizeMoney(revenue.recognizedRevenue),
        platformFeesCollected: this.normalizeMoney(
          revenue.platformFeesCollected,
        ),
        averageOrderValue: this.normalizeMoney(averageOrderValue),
      },
      statusBreakdown: statusBreakdownRaw.map((row) => ({
        status: row._id,
        count: row.count,
      })),
      recentOrders,
    };
  }

  async getStoreRevenue(query: StoreRevenueQueryDto): Promise<{
    range: { from: string; to: string };
    totals: {
      orderCount: number;
      grossRevenue: number;
      recognizedRevenue: number;
      platformFees: number;
    };
    series: Array<{
      date: string;
      orderCount: number;
      grossRevenue: number;
      recognizedRevenue: number;
      platformFees: number;
    }>;
  }> {
    const { from, to } = this.resolveRevenueRange(query);
    const dateFilter = { createdAt: { $gte: from, $lte: to } };

    const [totalsRaw, seriesRaw] = await Promise.all([
      this.orderModel
        .aggregate<{
          orderCount: number;
          grossRevenue: number;
          recognizedRevenue: number;
          platformFees: number;
        }>([
          { $match: dateFilter },
          {
            $group: {
              _id: null,
              orderCount: { $sum: 1 },
              grossRevenue: {
                $sum: {
                  $cond: [
                    { $in: ['$status', Array.from(REVENUE_GROSS_STATUSES)] },
                    '$totalAmount',
                    0,
                  ],
                },
              },
              recognizedRevenue: {
                $sum: {
                  $cond: [
                    { $in: ['$status', Array.from(REVENUE_RECOGNIZED_STATUSES)] },
                    '$sellerReceives',
                    0,
                  ],
                },
              },
              platformFees: {
                $sum: {
                  $cond: [
                    { $in: ['$status', Array.from(REVENUE_RECOGNIZED_STATUSES)] },
                    '$platformFee',
                    0,
                  ],
                },
              },
            },
          },
        ])
        .exec(),
      this.orderModel
        .aggregate<{
          _id: string;
          orderCount: number;
          grossRevenue: number;
          recognizedRevenue: number;
          platformFees: number;
        }>([
          { $match: dateFilter },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
              },
              orderCount: { $sum: 1 },
              grossRevenue: {
                $sum: {
                  $cond: [
                    { $in: ['$status', Array.from(REVENUE_GROSS_STATUSES)] },
                    '$totalAmount',
                    0,
                  ],
                },
              },
              recognizedRevenue: {
                $sum: {
                  $cond: [
                    { $in: ['$status', Array.from(REVENUE_RECOGNIZED_STATUSES)] },
                    '$sellerReceives',
                    0,
                  ],
                },
              },
              platformFees: {
                $sum: {
                  $cond: [
                    { $in: ['$status', Array.from(REVENUE_RECOGNIZED_STATUSES)] },
                    '$platformFee',
                    0,
                  ],
                },
              },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .exec(),
    ]);

    const totals = totalsRaw[0] ?? {
      orderCount: 0,
      grossRevenue: 0,
      recognizedRevenue: 0,
      platformFees: 0,
    };

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        orderCount: totals.orderCount,
        grossRevenue: this.normalizeMoney(totals.grossRevenue),
        recognizedRevenue: this.normalizeMoney(totals.recognizedRevenue),
        platformFees: this.normalizeMoney(totals.platformFees),
      },
      series: seriesRaw.map((row) => ({
        date: row._id,
        orderCount: row.orderCount,
        grossRevenue: this.normalizeMoney(row.grossRevenue),
        recognizedRevenue: this.normalizeMoney(row.recognizedRevenue),
        platformFees: this.normalizeMoney(row.platformFees),
      })),
    };
  }

  async getDownloadLink(
    userId: string,
    orderId: string,
  ): Promise<{
    url: string;
    expiresInSeconds: number;
    filename: string;
    orderId: string;
  }> {
    const order = await this.findOrderById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.buyerId.toString() !== userId) {
      throw new ForbiddenException('You cannot download this order');
    }

    if (
      order.status !== OrderStatus.DELIVERED &&
      order.status !== OrderStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'Order must be delivered before it can be downloaded',
      );
    }

    const file = order.deliveryFiles[0];
    if (!file) {
      throw new BadRequestException('This order does not have a delivery file');
    }

    const { bucketName, objectName } = this.resolveStorageLocation(
      file.storagePath,
    );
    const expiresInSeconds = 60 * 60;
    const url = await this.minioService.getPresignedGetUrl(
      bucketName,
      objectName,
      expiresInSeconds,
    );

    return {
      url,
      expiresInSeconds,
      filename: file.filename,
      orderId: order.id,
    };
  }

  private async findProductForPurchase(
    productId: string,
    session: ClientSession,
  ): Promise<StoreProduct> {
    const product = await this.productModel
      .findById(productId)
      .session(session)
      .exec();

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.status !== 'active') {
      throw new BadRequestException('Product is not available for purchase');
    }

    return product;
  }

  private async assertPurchaseConstraints(
    userId: string,
    product: StoreProduct,
    quantity: number,
    session: ClientSession,
  ): Promise<void> {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException('Quantity must be at least 1');
    }

    const price = this.normalizeMoney(product.price);
    if (price <= 0) {
      throw new BadRequestException('Product price must be greater than zero');
    }

    if (this.hasFiniteStock(product) && product.stock! < quantity) {
      throw new BadRequestException('Not enough product stock available');
    }

    if (product.type === StoreProductType.DIGITAL) {
      const files = product.files ?? [];
      if (files.length === 0) {
        throw new BadRequestException(
          'Digital products must include at least one delivery file',
        );
      }
    }

    const maxPerUser = this.normalizePositiveNumber(product.maxPerUser);
    if (maxPerUser > 0) {
      const purchasedQuantity = await this.getPurchasedQuantity(
        userId,
        product._id,
        session,
      );
      if (purchasedQuantity + quantity > maxPerUser) {
        throw new BadRequestException(
          'Purchase limit for this product has been reached',
        );
      }
    }
  }

  private async getPurchasedQuantity(
    userId: string,
    productId: Types.ObjectId,
    session: ClientSession,
  ): Promise<number> {
    const result = await this.orderModel
      .aggregate<{ total: number }>([
        {
          $match: {
            buyerId: new Types.ObjectId(userId),
            status: { $nin: Array.from(NON_COUNTING_STATUSES) },
          },
        },
        { $unwind: '$items' },
        {
          $match: {
            'items.productId': productId,
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$items.quantity' },
          },
        },
      ])
      .session(session)
      .exec();

    return result[0]?.total ?? 0;
  }

  private async reserveProductStock(
    product: StoreProduct,
    quantity: number,
    session: ClientSession,
  ): Promise<void> {
    if (!this.hasFiniteStock(product)) {
      return;
    }

    product.stock = this.normalizePositiveNumber(product.stock) - quantity;
    if (product.save) {
      await product.save({ session });
    }
  }

  private async releaseProductStock(
    order: OrderDocument,
    session: ClientSession,
  ): Promise<void> {
    const firstItem = order.items[0];
    if (!firstItem) {
      return;
    }

    const product = await this.productModel
      .findById(firstItem.productId)
      .session(session)
      .exec();
    if (!product || !this.hasFiniteStock(product)) {
      return;
    }

    product.stock = this.normalizePositiveNumber(product.stock) + firstItem.quantity;
    if (product.save) {
      await product.save({ session });
    }
  }

  private buildProductSnapshot(product: StoreProduct): OrderProductSnapshot {
    return {
      name: product.name,
      type: product.type,
      price: this.normalizeMoney(product.price),
      image: this.resolveProductImage(product),
    };
  }

  private buildDeliveryFiles(
    files: StoreProductFile[] | undefined,
  ): OrderDeliveryFile[] {
    return (files ?? [])
      .filter((file) => Boolean(file?.storagePath))
      .map((file) => ({
        filename: file.filename,
        storagePath: file.storagePath,
        size: this.normalizeMoney(file.size),
        mimeType: file.mimeType,
        uploadedAt: file.uploadedAt ? new Date(file.uploadedAt) : new Date(),
      }));
  }

  private resolveProductImage(product: StoreProduct): string | undefined {
    if (product.previewUrl) {
      return product.previewUrl;
    }

    return product.images?.[0]?.url;
  }

  private async findOrderById(
    orderId: string,
    session?: ClientSession,
  ): Promise<OrderDocument | null> {
    const query = this.orderModel.findById(orderId);
    if (session) {
      query.session(session);
    }

    return query.exec();
  }

  private async generateUniqueOrderNumber(
    session: ClientSession,
  ): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const date = new Date();
      const datePart = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('');
      const timePart = [
        String(date.getHours()).padStart(2, '0'),
        String(date.getMinutes()).padStart(2, '0'),
        String(date.getSeconds()).padStart(2, '0'),
      ].join('');
      const randomPart = String(Math.floor(Math.random() * 10_000)).padStart(4, '0');
      const orderNumber = `ORD-${datePart}${timePart}-${randomPart}`;

      const existing = await this.orderModel
        .findOne({ orderNumber })
        .session(session)
        .exec();
      if (!existing) {
        return orderNumber;
      }
    }

    throw new ConflictException('Unable to generate a unique order number');
  }

  private normalizeQuantity(value: number): number {
    if (!Number.isInteger(value) || value < 1) {
      throw new BadRequestException('Quantity must be at least 1');
    }

    return value;
  }

  private normalizeMoney(value: number | undefined | null): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 0;
    }

    return Math.max(0, Math.round(value));
  }

  private normalizePositiveNumber(value: number | undefined | null): number {
    return this.normalizeMoney(value);
  }

  private hasFiniteStock(product: StoreProduct): boolean {
    return typeof product.stock === 'number' && Number.isFinite(product.stock);
  }

  private parseStatusFilter(status?: string): OrderStatus[] {
    if (!status) {
      return [];
    }

    const requested = status
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (requested.length === 0) {
      return [];
    }

    const allowed = new Set(Object.values(OrderStatus));
    const invalid = requested.filter((entry) => !allowed.has(entry as OrderStatus));
    if (invalid.length > 0) {
      throw new BadRequestException('Invalid order status filter');
    }

    return requested as OrderStatus[];
  }

  private resolveStorageLocation(storagePath: string): {
    bucketName: string;
    objectName: string;
  } {
    const normalized = storagePath.trim();
    if (!normalized) {
      throw new BadRequestException('Delivery file storage path is missing');
    }

    try {
      const parsed = new URL(normalized);
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      if (pathParts.length >= 2) {
        return {
          bucketName: pathParts[0],
          objectName: decodeURIComponent(pathParts.slice(1).join('/')),
        };
      }
    } catch {
      // Fall through to bucket/object parsing below.
    }

    const stripped = normalized.replace(/^\/+/, '');
    const parts = stripped.split('/').filter(Boolean);
    if (parts.length < 2) {
      throw new BadRequestException(
        'Delivery file storage path must include bucket and object name',
      );
    }

    return {
      bucketName: parts[0],
      objectName: parts.slice(1).join('/'),
    };
  }

  private ensureCustomOrder(order: OrderDocument): void {
    const item = order.items[0];
    if (!item || item.productSnapshot.type !== StoreProductType.CUSTOM_ORDER) {
      throw new BadRequestException('This flow is only available for custom orders');
    }
  }

  private ensureBuyerAccess(order: OrderDocument, userId: string): void {
    if (order.buyerId.toString() !== userId) {
      throw new ForbiddenException('You cannot access this order');
    }
  }

  private isAllowedStoreStatusTransition(
    currentStatus: OrderStatus,
    nextStatus: OrderStatus,
  ): boolean {
    const transitionMap: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.PAID, OrderStatus.CANCELLED],
      [OrderStatus.PAID]: [
        OrderStatus.QUOTED,
        OrderStatus.PROCESSING,
        OrderStatus.CANCELLED,
        OrderStatus.REFUND_REQUESTED,
      ],
      [OrderStatus.QUOTED]: [
        OrderStatus.QUOTE_ACCEPTED,
        OrderStatus.PROCESSING,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.QUOTE_ACCEPTED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
      [OrderStatus.PROCESSING]: [
        OrderStatus.DELIVERED,
        OrderStatus.CANCELLED,
        OrderStatus.REFUND_REQUESTED,
        OrderStatus.DISPUTED,
      ],
      [OrderStatus.DELIVERED]: [
        OrderStatus.COMPLETED,
        OrderStatus.REFUND_REQUESTED,
        OrderStatus.DISPUTED,
      ],
      [OrderStatus.COMPLETED]: [OrderStatus.DISPUTED],
      [OrderStatus.CANCELLED]: [],
      [OrderStatus.REFUND_REQUESTED]: [
        OrderStatus.REFUNDED,
        OrderStatus.PROCESSING,
        OrderStatus.DISPUTED,
      ],
      [OrderStatus.REFUNDED]: [],
      [OrderStatus.DISPUTED]: [OrderStatus.PROCESSING, OrderStatus.REFUNDED],
    };

    return transitionMap[currentStatus]?.includes(nextStatus) ?? false;
  }

  private resolveRevenueRange(query: StoreRevenueQueryDto): {
    from: Date;
    to: Date;
  } {
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const from = query.from ? new Date(query.from) : defaultFrom;
    const to = query.to ? new Date(query.to) : now;

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid revenue date range');
    }
    if (from > to) {
      throw new BadRequestException('"from" must be earlier than or equal to "to"');
    }

    return { from, to };
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private toObjectId(value: Types.ObjectId | string): Types.ObjectId {
    return value instanceof Types.ObjectId ? value : new Types.ObjectId(value);
  }

  private async executeInTransaction<T>(
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
