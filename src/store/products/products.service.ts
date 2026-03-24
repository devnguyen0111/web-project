import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Role } from '../../common/constants/roles.constant';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { toSlug } from '../../common/utils/slug.util';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  Product,
  ProductDocument,
  ProductStatus,
  ProductType,
} from './schemas/product.schema';

type ProductLookup = {
  id: string;
  name: string;
  slug: string;
  priceAmount: number;
  currency: string;
  stock?: number;
};

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<Product>,
  ) {}

  async listPublic(query: ProductQueryDto) {
    const filter: Record<string, unknown> = {
      status: ProductStatus.ACTIVE,
      type: ProductType.DIGITAL,
    };

    if (query.type) {
      filter.type = query.type;
    }

    const keyword = query.search?.trim();
    if (keyword) {
      filter.$text = { $search: keyword };
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.productModel
        .find(filter)
        .sort(keyword ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .exec(),
      this.productModel.countDocuments(filter),
    ]);

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

  async findPublicDetail(identifier: string) {
    const product = await this.findByIdentifier(identifier);
    if (!product || product.status !== ProductStatus.ACTIVE) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async create(userId: string, payload: CreateProductDto) {
    const slug = await this.buildUniqueSlug(payload.name);
    const normalizedType = payload.type ?? ProductType.DIGITAL;
    const normalizedStatus = payload.status ?? ProductStatus.DRAFT;
    const normalizedCurrency = (payload.currency ?? 'VND').toUpperCase();

    const created = await this.productModel.create({
      name: payload.name.trim(),
      slug,
      description: payload.description?.trim(),
      type: normalizedType,
      status: normalizedStatus,
      priceAmount: payload.priceAmount,
      currency: normalizedCurrency,
      stock: payload.stock,
      createdBy: new Types.ObjectId(userId),
    });

    return created;
  }

  async update(id: string, payload: UpdateProductDto) {
    const product = await this.productModel.findById(id).exec();
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (payload.name && payload.name.trim() !== product.name) {
      product.name = payload.name.trim();
      product.slug = await this.buildUniqueSlug(product.name, product.id);
    }
    if (payload.description !== undefined) {
      product.description = payload.description?.trim();
    }
    if (payload.type) {
      product.type = payload.type;
    }
    if (payload.status) {
      product.status = payload.status;
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

    await product.save();
    return product;
  }

  async archive(id: string) {
    const product = await this.productModel.findById(id).exec();
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    product.status = ProductStatus.ARCHIVED;
    await product.save();
    return product;
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
        priceAmount: 1,
        currency: 1,
        stock: 1,
      });
    if (session) {
      query.session(session);
    }

    const docs = await query.lean<
      Array<{
        _id: Types.ObjectId;
        name: string;
        slug: string;
        priceAmount: number;
        currency?: string;
        stock?: number;
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
        priceAmount: doc.priceAmount,
        currency: (doc.currency ?? 'VND').toUpperCase(),
        stock,
      });
    }

    return mapped;
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
