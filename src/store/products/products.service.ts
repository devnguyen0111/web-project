import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, PipelineStage, Types } from 'mongoose';
import { Role } from '../../common/constants/roles.constant';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { toSlug } from '../../common/utils/slug.util';
import { MinioService } from '../../minio/minio.service';
import {
  Category,
  CategoryScope,
} from '../../blog/categories/schemas/category.schema';
import {
  Order,
  OrderStatus,
} from '../orders/schemas/order.schema';
import {
  Review,
  ReviewTargetType,
} from '../reviews/schemas/review.schema';
import { CreateProductDto } from './dto/create-product.dto';
import {
  ProductQueryDto,
  ProductSortBy,
} from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  Product,
  ProductDocument,
  ProductStatus,
  ProductType,
} from './schemas/product.schema';

type AuthUser = {
  userId: string;
  role: Role;
};

type ProductDigitalAssetLookup = {
  bucketName: string;
  objectName: string;
  fileName: string;
  mimeType?: string;
  size?: number;
};

type ProductLookup = {
  id: string;
  name: string;
  slug: string;
  type: ProductType;
  priceAmount: number;
  currency: string;
  stock?: number;
  vipOnly: boolean;
  digitalAsset?: ProductDigitalAssetLookup;
};

type StockChange = {
  productId: string;
  quantity: number;
};

type ProductMetrics = {
  soldCount: number;
  averageRating: number;
  reviewCount: number;
};

type ProductAggregateRow = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  type: ProductType;
  status?: ProductStatus;
  priceAmount: number;
  currency?: string;
  stock?: number;
  categoryId?: Types.ObjectId;
  vipOnly?: boolean;
  digitalAsset?: ProductDigitalAssetLookup;
  rejectionReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
  metrics?: ProductMetrics;
};

const SOLD_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.QUOTE_ACCEPTED,
  OrderStatus.PROCESSING,
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
];

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<Product>,
    @InjectModel(Category.name)
    private readonly categoryModel: Model<Category>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<Order>,
    @InjectModel(Review.name)
    private readonly reviewModel: Model<Review>,
    private readonly minioService: MinioService,
  ) {}

  async listPublic(query: ProductQueryDto) {
    this.assertValidPriceRange(query.minPrice, query.maxPrice);

    const keyword = this.normalizeKeyword(query.search);
    const filter = this.buildPublicFilter(query, keyword);
    const skip = (query.page - 1) * query.limit;
    const useMetricsSort =
      query.sortBy === ProductSortBy.POPULAR ||
      query.sortBy === ProductSortBy.RATING;

    const totalPromise = this.productModel.countDocuments(filter);

    if (useMetricsSort) {
      const [items, total] = await Promise.all([
        this.listPublicWithMetricsSort(filter, query, keyword, skip),
        totalPromise,
      ]);

      return new PaginatedResponseDto(items, total, query.page, query.limit);
    }

    const rows = await this.productModel
      .find(filter)
      .sort(this.resolveMongoSort(query.sortBy, Boolean(keyword)))
      .skip(skip)
      .limit(query.limit)
      .lean<ProductAggregateRow[]>()
      .exec();

    const metricsMap = await this.getProductMetricsMap(
      rows.map((item) => item._id.toString()),
    );

    const items = rows.map((item) => {
      const id = item._id.toString();
      return this.toPublicProduct(item, metricsMap.get(id));
    });

    const total = await totalPromise;
    return new PaginatedResponseDto(items, total, query.page, query.limit);
  }

  async listMine(userId: string, role: Role, query: PaginationDto) {
    const filter: Record<string, unknown> =
      role === Role.ADMIN ? {} : { createdBy: new Types.ObjectId(userId) };
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      this.productModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .exec(),
      this.productModel.countDocuments(filter),
    ]);

    return new PaginatedResponseDto(items, total, query.page, query.limit);
  }

  async listPendingReview(query: PaginationDto) {
    const filter = { status: ProductStatus.PENDING_REVIEW };
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      this.productModel
        .find(filter)
        .sort({ submittedAt: 1, createdAt: 1 })
        .skip(skip)
        .limit(query.limit)
        .exec(),
      this.productModel.countDocuments(filter),
    ]);

    return new PaginatedResponseDto(items, total, query.page, query.limit);
  }

  async findPublicDetail(identifier: string) {
    const product = await this.findByIdentifier(identifier);
    if (!product || product.status !== ProductStatus.ACTIVE) {
      throw new NotFoundException('Product not found');
    }

    const metricsMap = await this.getProductMetricsMap([product.id]);
    return this.toPublicProduct(product.toObject(), metricsMap.get(product.id));
  }

  async create(user: AuthUser, payload: CreateProductDto) {
    if (payload.status && payload.status !== ProductStatus.DRAFT) {
      throw new BadRequestException(
        'Product status is controlled by moderation workflow',
      );
    }

    const slug = await this.buildUniqueSlug(payload.name);
    const normalizedType = payload.type ?? ProductType.DIGITAL;
    const normalizedCurrency = (payload.currency ?? 'VND').toUpperCase();
    const categoryId = await this.resolveStoreCategoryId(payload.categoryId);

    const created = await this.productModel.create({
      name: payload.name.trim(),
      slug,
      description: payload.description?.trim(),
      type: normalizedType,
      status: ProductStatus.DRAFT,
      priceAmount: payload.priceAmount,
      currency: normalizedCurrency,
      stock: payload.stock,
      categoryId,
      vipOnly: Boolean(payload.vipOnly),
      createdBy: new Types.ObjectId(user.userId),
    });

    return created;
  }

  async update(user: AuthUser, id: string, payload: UpdateProductDto) {
    const product = await this.findByIdOrFail(id);
    this.ensureCanManageProduct(product, user);

    if (payload.name && payload.name.trim() !== product.name) {
      product.name = payload.name.trim();
      product.slug = await this.buildUniqueSlug(product.name, product.id);
    }
    if (payload.description !== undefined) {
      product.description = payload.description?.trim();
    }
    if (payload.type) {
      if (payload.type === ProductType.DIGITAL && !product.digitalAsset) {
        product.status = ProductStatus.DRAFT;
      }
      product.type = payload.type;
    }
    if (payload.priceAmount !== undefined) {
      if (payload.priceAmount <= 0) {
        throw new BadRequestException('priceAmount must be greater than zero');
      }
      product.priceAmount = payload.priceAmount;
    }
    if (payload.currency) {
      product.currency = payload.currency.toUpperCase();
    }
    if (payload.stock !== undefined) {
      if (payload.stock < 0) {
        throw new BadRequestException('stock cannot be negative');
      }
      product.stock = payload.stock;
    }
    if (payload.categoryId !== undefined) {
      product.categoryId = await this.resolveStoreCategoryId(payload.categoryId);
    }
    if (payload.vipOnly !== undefined) {
      product.vipOnly = payload.vipOnly;
    }

    if (
      product.type === ProductType.DIGITAL &&
      product.status === ProductStatus.ACTIVE &&
      !product.digitalAsset
    ) {
      throw new BadRequestException(
        'Digital product must have uploaded file before active status',
      );
    }

    await product.save();
    return product;
  }

  async archive(user: AuthUser, id: string) {
    const product = await this.findByIdOrFail(id);
    this.ensureCanManageProduct(product, user);

    product.status = ProductStatus.ARCHIVED;
    await product.save();
    return product;
  }

  async uploadDigitalAsset(
    user: AuthUser,
    productId: string,
    file: {
      buffer: Buffer;
      size: number;
      mimetype?: string;
      originalname?: string;
    },
  ) {
    const product = await this.findByIdOrFail(productId);
    this.ensureCanManageProduct(product, user);

    if (product.type !== ProductType.DIGITAL) {
      throw new BadRequestException(
        'Only digital products can store downloadable asset files',
      );
    }

    const bucketName = this.minioService.getBucket('products');
    const oldAsset = product.digitalAsset;
    const uploaded = await this.minioService.uploadFile(
      bucketName,
      file,
      `products/${product.id}/assets`,
    );

    product.digitalAsset = {
      bucketName: uploaded.bucketName,
      objectName: uploaded.objectName,
      fileName: file.originalname?.trim() || 'download.bin',
      mimeType: file.mimetype,
      size: file.size,
      etag: uploaded.etag,
      uploadedAt: new Date(),
    };

    if (product.status === ProductStatus.REJECTED) {
      product.status = ProductStatus.DRAFT;
      product.rejectionReason = undefined;
      product.reviewedBy = undefined;
      product.reviewedAt = undefined;
    }

    await product.save();

    if (oldAsset?.bucketName && oldAsset.objectName) {
      await this.minioService
        .removeObject(oldAsset.bucketName, oldAsset.objectName)
        .catch(() => undefined);
    }

    return product;
  }

  async submitForReview(productId: string, user: AuthUser) {
    const product = await this.findByIdOrFail(productId);
    this.ensureCanManageProduct(product, user);

    if (
      product.status !== ProductStatus.DRAFT &&
      product.status !== ProductStatus.REJECTED
    ) {
      throw new BadRequestException(
        'Product cannot be submitted in current status',
      );
    }

    if (product.type === ProductType.DIGITAL && !product.digitalAsset) {
      throw new BadRequestException(
        'Digital product requires uploaded file before review submission',
      );
    }

    if (!product.categoryId) {
      throw new BadRequestException(
        'Product category is required before review submission',
      );
    }
    await this.resolveStoreCategoryId(product.categoryId.toString());

    product.status = ProductStatus.PENDING_REVIEW;
    product.submittedAt = new Date();
    product.reviewedBy = undefined;
    product.reviewedAt = undefined;
    product.rejectionReason = undefined;

    await product.save();
    return product;
  }

  async approvePendingReview(productId: string, reviewerUserId: string) {
    const product = await this.findByIdOrFail(productId);
    if (product.status !== ProductStatus.PENDING_REVIEW) {
      throw new BadRequestException('Product is not pending review');
    }

    if (product.type === ProductType.DIGITAL && !product.digitalAsset) {
      throw new BadRequestException(
        'Digital product requires uploaded file before approval',
      );
    }

    if (!product.categoryId) {
      throw new BadRequestException('Product category is required before approval');
    }
    await this.resolveStoreCategoryId(product.categoryId.toString());

    product.status = ProductStatus.ACTIVE;
    product.reviewedBy = new Types.ObjectId(reviewerUserId);
    product.reviewedAt = new Date();
    product.rejectionReason = undefined;

    await product.save();
    return product;
  }

  async rejectPendingReview(
    productId: string,
    reviewerUserId: string,
    reason?: string,
  ) {
    const product = await this.findByIdOrFail(productId);
    if (product.status !== ProductStatus.PENDING_REVIEW) {
      throw new BadRequestException('Product is not pending review');
    }

    product.status = ProductStatus.REJECTED;
    product.reviewedBy = new Types.ObjectId(reviewerUserId);
    product.reviewedAt = new Date();
    product.rejectionReason = reason?.trim();

    await product.save();
    return product;
  }

  async findOrderableByIdOrFail(
    productId: string,
    session?: ClientSession,
  ): Promise<ProductLookup> {
    if (!Types.ObjectId.isValid(productId)) {
      throw new NotFoundException('Product not found or unavailable');
    }

    const query = this.productModel
      .findOne({
        _id: new Types.ObjectId(productId),
        status: ProductStatus.ACTIVE,
        type: { $in: [ProductType.DIGITAL, ProductType.CUSTOM_ORDER] },
      })
      .select({
        _id: 1,
        name: 1,
        slug: 1,
        type: 1,
        priceAmount: 1,
        currency: 1,
        stock: 1,
        vipOnly: 1,
        digitalAsset: 1,
      });
    if (session) {
      query.session(session);
    }

    const doc = await query
      .lean<{
        _id: Types.ObjectId;
        name: string;
        slug: string;
        type: ProductType;
        priceAmount: number;
        currency?: string;
        stock?: number;
        vipOnly?: boolean;
        digitalAsset?: ProductDigitalAssetLookup;
      }>()
      .exec();

    if (!doc) {
      throw new NotFoundException('Product not found or unavailable');
    }

    if (doc.stock !== undefined && doc.stock <= 0) {
      throw new BadRequestException('Product is out of stock');
    }

    return {
      id: doc._id.toString(),
      name: doc.name,
      slug: doc.slug,
      type: doc.type,
      priceAmount: doc.priceAmount,
      currency: (doc.currency ?? 'VND').toUpperCase(),
      stock: doc.stock,
      vipOnly: Boolean(doc.vipOnly),
      digitalAsset: doc.digitalAsset,
    };
  }

  async findPurchasableByIdOrFail(
    productId: string,
    session?: ClientSession,
  ): Promise<ProductLookup> {
    const products = await this.findPurchasableByIds([productId], session);
    const resolved = products.get(productId);
    if (!resolved) {
      throw new NotFoundException('Product not found or not purchasable');
    }

    return resolved;
  }

  async findPurchasableByIds(
    productIds: string[],
    session?: ClientSession,
  ): Promise<Map<string, ProductLookup>> {
    const uniqueIds = Array.from(
      new Set(productIds.filter((item) => Types.ObjectId.isValid(item))),
    ).map((item) => new Types.ObjectId(item));

    if (uniqueIds.length === 0) {
      return new Map();
    }

    const query = this.productModel
      .find({
        _id: { $in: uniqueIds },
        status: ProductStatus.ACTIVE,
        type: ProductType.DIGITAL,
      })
      .select({
        _id: 1,
        name: 1,
        slug: 1,
        type: 1,
        priceAmount: 1,
        currency: 1,
        stock: 1,
        vipOnly: 1,
        digitalAsset: 1,
      });
    if (session) {
      query.session(session);
    }

    const docs = await query.lean<
      Array<{
        _id: Types.ObjectId;
        name: string;
        slug: string;
        type: ProductType;
        priceAmount: number;
        currency?: string;
        stock?: number;
        vipOnly?: boolean;
        digitalAsset?: ProductDigitalAssetLookup;
      }>
    >();

    const mapped = new Map<string, ProductLookup>();
    for (const doc of docs) {
      const stock = doc.stock;
      if (stock !== undefined && stock <= 0) {
        continue;
      }

      mapped.set(doc._id.toString(), {
        id: doc._id.toString(),
        name: doc.name,
        slug: doc.slug,
        type: doc.type,
        priceAmount: doc.priceAmount,
        currency: (doc.currency ?? 'VND').toUpperCase(),
        stock,
        vipOnly: Boolean(doc.vipOnly),
        digitalAsset: doc.digitalAsset,
      });
    }

    return mapped;
  }

  async decrementStockOrFail(
    items: Array<{ productId: string; quantity: number }>,
    session?: ClientSession,
  ): Promise<StockChange[]> {
    const applied: StockChange[] = [];

    for (const item of items) {
      if (!Types.ObjectId.isValid(item.productId)) {
        throw new BadRequestException('Invalid product id in stock update');
      }

      const quantity = Math.floor(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new BadRequestException('Invalid stock quantity');
      }

      const productId = new Types.ObjectId(item.productId);
      const product = await this.productModel
        .findById(productId)
        .select({ _id: 1, name: 1, stock: 1 })
        .session(session ?? null)
        .lean<{ _id: Types.ObjectId; name: string; stock?: number }>()
        .exec();

      if (!product) {
        throw new NotFoundException('Product not found in stock update');
      }

      if (product.stock === undefined) {
        continue;
      }

      const updated = await this.productModel
        .updateOne(
          {
            _id: productId,
            stock: { $gte: quantity },
          },
          {
            $inc: {
              stock: -quantity,
            },
          },
          {
            session,
          },
        )
        .exec();

      if (!updated.modifiedCount) {
        throw new BadRequestException(
          `Product ${product.name} has insufficient stock`,
        );
      }

      applied.push({ productId: item.productId, quantity });
    }

    return applied;
  }

  async restoreStock(
    items: Array<{ productId: string; quantity: number }>,
    session?: ClientSession,
  ): Promise<void> {
    const operations = items
      .filter(
        (item) =>
          Types.ObjectId.isValid(item.productId) &&
          Number.isFinite(item.quantity) &&
          item.quantity > 0,
      )
      .map((item) => ({
        updateOne: {
          filter: {
            _id: new Types.ObjectId(item.productId),
          },
          update: {
            $inc: {
              stock: Math.floor(item.quantity),
            },
          },
        },
      }));

    if (operations.length === 0) {
      return;
    }

    await this.productModel.bulkWrite(operations, { session });
  }

  private buildPublicFilter(query: ProductQueryDto, keyword?: string) {
    const filter: Record<string, unknown> = {
      status: ProductStatus.ACTIVE,
      type: { $in: [ProductType.DIGITAL, ProductType.CUSTOM_ORDER] },
    };

    if (query.type) {
      filter.type = query.type;
    }

    if (query.categoryId && Types.ObjectId.isValid(query.categoryId)) {
      filter.categoryId = new Types.ObjectId(query.categoryId);
    }

    if (query.vipOnly !== undefined) {
      filter.vipOnly = query.vipOnly;
    }

    if (typeof query.minPrice === 'number' || typeof query.maxPrice === 'number') {
      const min = typeof query.minPrice === 'number' ? query.minPrice : undefined;
      const max = typeof query.maxPrice === 'number' ? query.maxPrice : undefined;
      filter.priceAmount = {
        ...(min !== undefined ? { $gte: min } : {}),
        ...(max !== undefined ? { $lte: max } : {}),
      };
    }

    if (keyword) {
      filter.$text = { $search: keyword };
    }

    return filter;
  }

  private async listPublicWithMetricsSort(
    filter: Record<string, unknown>,
    query: ProductQueryDto,
    keyword: string | undefined,
    skip: number,
  ) {
    const pipeline: Record<string, unknown>[] = [{ $match: filter }];

    if (keyword) {
      pipeline.push({ $addFields: { score: { $meta: 'textScore' } } });
    }

    pipeline.push(
      {
        $lookup: {
          from: this.orderModel.collection.name,
          let: { productId: '$_id' },
          pipeline: [
            { $unwind: '$items' },
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$items.productId', '$$productId'] },
                    { $in: ['$status', SOLD_ORDER_STATUSES] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                soldCount: { $sum: '$items.quantity' },
              },
            },
          ],
          as: 'orderMetrics',
        },
      },
      {
        $lookup: {
          from: this.reviewModel.collection.name,
          let: { productId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$productId', '$$productId'] },
                    { $eq: ['$targetType', ReviewTargetType.PRODUCT] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                averageRating: { $avg: '$rating' },
                reviewCount: { $sum: 1 },
              },
            },
          ],
          as: 'reviewMetrics',
        },
      },
      {
        $addFields: {
          metrics: {
            soldCount: {
              $ifNull: [{ $first: '$orderMetrics.soldCount' }, 0],
            },
            averageRating: {
              $ifNull: [{ $first: '$reviewMetrics.averageRating' }, 0],
            },
            reviewCount: {
              $ifNull: [{ $first: '$reviewMetrics.reviewCount' }, 0],
            },
          },
        },
      },
      {
        $project: {
          orderMetrics: 0,
          reviewMetrics: 0,
        },
      },
      {
        $sort: this.resolveAggregateSort(query.sortBy, Boolean(keyword)),
      },
      {
        $skip: skip,
      },
      {
        $limit: query.limit,
      },
    );

    const rows = await this.productModel
      .aggregate<ProductAggregateRow>(pipeline as unknown as PipelineStage[])
      .exec();

    return rows.map((item) => this.toPublicProduct(item, item.metrics));
  }

  private resolveMongoSort(
    sortBy?: ProductSortBy,
    hasKeyword = false,
  ): Record<string, 1 | -1 | { $meta: 'textScore' }> {
    if (sortBy === ProductSortBy.PRICE_ASC) {
      return { priceAmount: 1, createdAt: -1 };
    }

    if (sortBy === ProductSortBy.PRICE_DESC) {
      return { priceAmount: -1, createdAt: -1 };
    }

    if (hasKeyword) {
      return {
        score: { $meta: 'textScore' as const },
        createdAt: -1,
      };
    }

    return { createdAt: -1 };
  }

  private resolveAggregateSort(
    sortBy?: ProductSortBy,
    hasKeyword = false,
  ): Record<string, 1 | -1> {
    if (sortBy === ProductSortBy.POPULAR) {
      return {
        'metrics.soldCount': -1,
        createdAt: -1,
      };
    }

    if (sortBy === ProductSortBy.RATING) {
      return {
        'metrics.averageRating': -1,
        'metrics.reviewCount': -1,
        createdAt: -1,
      };
    }

    if (sortBy === ProductSortBy.PRICE_ASC) {
      return {
        priceAmount: 1,
        createdAt: -1,
      };
    }

    if (sortBy === ProductSortBy.PRICE_DESC) {
      return {
        priceAmount: -1,
        createdAt: -1,
      };
    }

    if (hasKeyword) {
      return {
        score: -1,
        createdAt: -1,
      };
    }

    return { createdAt: -1 };
  }

  private async getProductMetricsMap(productIds: string[]) {
    const uniqueIds = Array.from(
      new Set(productIds.filter((item) => Types.ObjectId.isValid(item))),
    );

    if (!uniqueIds.length) {
      return new Map<string, ProductMetrics>();
    }

    const objectIds = uniqueIds.map((item) => new Types.ObjectId(item));

    const [orderRows, reviewRows] = await Promise.all([
      this.orderModel
        .aggregate<{ _id: Types.ObjectId; soldCount: number }>([
          {
            $match: {
              status: { $in: SOLD_ORDER_STATUSES },
            },
          },
          {
            $unwind: '$items',
          },
          {
            $match: {
              'items.productId': { $in: objectIds },
            },
          },
          {
            $group: {
              _id: '$items.productId',
              soldCount: { $sum: '$items.quantity' },
            },
          },
        ])
        .exec(),
      this.reviewModel
        .aggregate<{
          _id: Types.ObjectId;
          averageRating: number;
          reviewCount: number;
        }>([
          {
            $match: {
              targetType: ReviewTargetType.PRODUCT,
              productId: { $in: objectIds },
            },
          },
          {
            $group: {
              _id: '$productId',
              averageRating: { $avg: '$rating' },
              reviewCount: { $sum: 1 },
            },
          },
        ])
        .exec(),
    ]);

    const metricsMap = new Map<string, ProductMetrics>();

    for (const id of uniqueIds) {
      metricsMap.set(id, {
        soldCount: 0,
        averageRating: 0,
        reviewCount: 0,
      });
    }

    for (const row of orderRows) {
      const key = row._id.toString();
      const current = metricsMap.get(key);
      if (!current) {
        continue;
      }

      current.soldCount = row.soldCount;
    }

    for (const row of reviewRows) {
      const key = row._id.toString();
      const current = metricsMap.get(key);
      if (!current) {
        continue;
      }

      current.averageRating = this.roundRating(row.averageRating);
      current.reviewCount = row.reviewCount;
    }

    return metricsMap;
  }

  private toPublicProduct(
    source: ProductAggregateRow,
    metrics?: ProductMetrics,
  ) {
    const productId = source._id.toString();

    return {
      _id: productId,
      id: productId,
      name: source.name,
      slug: source.slug,
      description: source.description,
      type: source.type,
      status: source.status,
      priceAmount: source.priceAmount,
      currency: (source.currency ?? 'VND').toUpperCase(),
      stock: source.stock,
      categoryId: source.categoryId ? source.categoryId.toString() : undefined,
      vipOnly: Boolean(source.vipOnly),
      digitalAsset: source.digitalAsset,
      rejectionReason: source.rejectionReason,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
      metrics: {
        soldCount: metrics?.soldCount ?? 0,
        averageRating: this.roundRating(metrics?.averageRating ?? 0),
        reviewCount: metrics?.reviewCount ?? 0,
      },
    };
  }

  private roundRating(value: number) {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.round(value * 10) / 10;
  }

  private normalizeKeyword(search?: string) {
    const keyword = search?.trim();
    return keyword ? keyword : undefined;
  }

  private assertValidPriceRange(minPrice?: number, maxPrice?: number) {
    if (
      typeof minPrice === 'number' &&
      typeof maxPrice === 'number' &&
      minPrice > maxPrice
    ) {
      throw new BadRequestException('minPrice cannot be greater than maxPrice');
    }
  }

  private async resolveStoreCategoryId(categoryId?: string) {
    if (!categoryId) {
      return undefined;
    }

    if (!Types.ObjectId.isValid(categoryId)) {
      throw new BadRequestException('Invalid category id');
    }

    const category = await this.categoryModel
      .findById(categoryId)
      .select({ _id: 1, scope: 1 })
      .lean<{ _id: Types.ObjectId; scope: CategoryScope }>()
      .exec();

    if (!category) {
      throw new BadRequestException('Category not found');
    }

    if (category.scope !== CategoryScope.STORE) {
      throw new BadRequestException('Category scope must be store');
    }

    return category._id;
  }

  private async findByIdOrFail(id: string): Promise<ProductDocument> {
    const product = await this.productModel.findById(id).exec();
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  private ensureCanManageProduct(product: ProductDocument, user: AuthUser) {
    if (user.role === Role.ADMIN) {
      return;
    }

    if (product.createdBy.toString() !== user.userId) {
      throw new ForbiddenException(
        'You do not have permission to manage this product',
      );
    }
  }

  private async findByIdentifier(
    identifier: string,
  ): Promise<ProductDocument | null> {
    if (Types.ObjectId.isValid(identifier)) {
      return this.productModel.findById(identifier).exec();
    }

    return this.productModel.findOne({ slug: identifier.toLowerCase() }).exec();
  }

  private async buildUniqueSlug(
    value: string,
    excludeId?: string,
  ): Promise<string> {
    const base = toSlug(value) || `product-${Date.now()}`;
    let candidate = base;
    let counter = 0;

    while (true) {
      const existing = await this.productModel
        .findOne({ slug: candidate })
        .select({ _id: 1 })
        .lean<{ _id: Types.ObjectId }>()
        .exec();

      if (!existing) {
        return candidate;
      }

      if (excludeId && existing._id.toString() === excludeId) {
        return candidate;
      }

      counter += 1;
      if (counter > 100) {
        throw new ConflictException('Unable to allocate unique product slug');
      }

      candidate = `${base}-${counter}`;
    }
  }
}
