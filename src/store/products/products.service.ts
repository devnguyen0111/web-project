import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { toSlug } from '../../common/utils/slug.util';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductsQueryDto } from './dto/products-query.dto';
import { RejectProductDto } from './dto/reject-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  Product,
  ProductCustomFieldType,
  ProductCustomField,
  ProductDocument,
  ProductEstimatedDays,
  ProductFile,
  ProductImage,
  ProductStatus,
  ProductSubscriberDiscount,
  ProductType,
} from './schemas/product.schema';

type ProductUpdatePayload = Record<string, unknown>;

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<Product>,
  ) {}

  async listPublic(
    query: ProductsQueryDto,
  ): Promise<PaginatedResponseDto<ProductDocument>> {
    const filter = this.buildPublicFilter(query);
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      this.productModel
        .find(filter)
        .sort({ isFeatured: -1, createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .exec(),
      this.productModel.countDocuments(filter),
    ]);

    return new PaginatedResponseDto(items, total, query.page, query.limit);
  }

  async findPublicBySlug(slug: string): Promise<ProductDocument> {
    const product = await this.productModel
      .findOneAndUpdate(
        { slug, status: ProductStatus.ACTIVE },
        { $inc: { viewsCount: 1 } },
        { returnDocument: 'after' },
      )
      .exec();

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async listMine(
    sellerId: string,
    query: ProductsQueryDto,
  ): Promise<PaginatedResponseDto<ProductDocument>> {
    const filter = this.buildMineFilter(sellerId, query);
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

  async createProduct(
    sellerId: string,
    payload: CreateProductDto,
  ): Promise<ProductDocument> {
    const slug = await this.ensureUniqueSlug(payload.name);

    try {
      return await this.productModel.create({
        sellerId: new Types.ObjectId(sellerId),
        name: payload.name,
        slug,
        shortDescription: payload.shortDescription,
        description: payload.description,
        images: this.normalizeImages(payload.images),
        previewUrl: payload.previewUrl,
        type: payload.type ?? ProductType.DIGITAL,
        files: this.normalizeFiles(payload.files),
        customFields: this.normalizeCustomFields(payload.customFields),
        estimatedDays: this.normalizeEstimatedDays(payload.estimatedDays),
        price: payload.price,
        originalPrice: payload.originalPrice,
        isOnSale: payload.isOnSale ?? false,
        saleEndsAt: payload.saleEndsAt
          ? new Date(payload.saleEndsAt)
          : undefined,
        categoryId: payload.categoryId
          ? new Types.ObjectId(payload.categoryId)
          : undefined,
        tags: this.normalizeTags(payload.tags),
        stock: payload.stock ?? 0,
        maxPerUser: payload.maxPerUser ?? 1,
        isFeatured: payload.isFeatured ?? false,
        subscriberDiscount: this.normalizeSubscriberDiscount(
          payload.subscriberDiscount,
        ),
        status: ProductStatus.DRAFT,
      });
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('Product slug already exists');
      }

      throw error;
    }
  }

  async updateProduct(
    productId: string,
    payload: UpdateProductDto,
  ): Promise<ProductDocument> {
    const product = await this.findProductOrFail(productId);
    if (product.status === ProductStatus.ARCHIVED) {
      throw new BadRequestException('Archived products cannot be edited');
    }

    const updatePayload: ProductUpdatePayload = {
      shortDescription: payload.shortDescription,
      description: payload.description,
      previewUrl: payload.previewUrl,
      price: payload.price,
      originalPrice: payload.originalPrice,
      isOnSale: payload.isOnSale,
      saleEndsAt: payload.saleEndsAt ? new Date(payload.saleEndsAt) : undefined,
      stock: payload.stock,
      maxPerUser: payload.maxPerUser,
      isFeatured: payload.isFeatured,
    };

    if (payload.name && payload.name !== product.name) {
      updatePayload.name = payload.name;
      updatePayload.slug = await this.ensureUniqueSlug(
        payload.name,
        product.id,
      );
    }

    if (payload.type !== undefined) {
      updatePayload.type = payload.type;
    }

    if (payload.images !== undefined) {
      updatePayload.images = this.normalizeImages(payload.images);
    }

    if (payload.files !== undefined) {
      updatePayload.files = this.normalizeFiles(payload.files);
    }

    if (payload.customFields !== undefined) {
      updatePayload.customFields = this.normalizeCustomFields(
        payload.customFields,
      );
    }

    if (payload.estimatedDays !== undefined) {
      updatePayload.estimatedDays = this.normalizeEstimatedDays(
        payload.estimatedDays,
      );
    }

    if (payload.categoryId !== undefined) {
      updatePayload.categoryId = payload.categoryId
        ? new Types.ObjectId(payload.categoryId)
        : undefined;
    }

    if (payload.tags !== undefined) {
      updatePayload.tags = this.normalizeTags(payload.tags);
    }

    if (payload.subscriberDiscount !== undefined) {
      updatePayload.subscriberDiscount = this.normalizeSubscriberDiscount(
        payload.subscriberDiscount,
      );
    }

    const updated = await this.productModel
      .findByIdAndUpdate(productId, updatePayload, {
        new: true,
        runValidators: true,
      })
      .exec();

    if (!updated) {
      throw new NotFoundException('Product not found');
    }

    return updated;
  }

  async submitForReview(productId: string): Promise<ProductDocument> {
    const product = await this.findProductOrFail(productId);
    if (product.status === ProductStatus.ARCHIVED) {
      throw new BadRequestException('Archived products cannot be submitted');
    }
    if (product.status === ProductStatus.ACTIVE) {
      throw new BadRequestException('Active products cannot be submitted');
    }

    return this.updateStatus(productId, {
      status: ProductStatus.PENDING_REVIEW,
      reviewedBy: undefined,
      rejectionReason: undefined,
    });
  }

  async publish(
    productId: string,
    reviewerId: string,
  ): Promise<ProductDocument> {
    const product = await this.findProductOrFail(productId);
    if (product.status === ProductStatus.ARCHIVED) {
      throw new BadRequestException('Archived products cannot be published');
    }

    return this.updateStatus(productId, {
      status: ProductStatus.ACTIVE,
      reviewedBy: new Types.ObjectId(reviewerId),
      rejectionReason: undefined,
    });
  }

  async reject(
    productId: string,
    reviewerId: string,
    payload: RejectProductDto,
  ): Promise<ProductDocument> {
    const product = await this.findProductOrFail(productId);
    if (product.status === ProductStatus.ARCHIVED) {
      throw new BadRequestException('Archived products cannot be rejected');
    }

    return this.updateStatus(productId, {
      status: ProductStatus.REJECTED,
      reviewedBy: new Types.ObjectId(reviewerId),
      rejectionReason: payload.reason.trim(),
    });
  }

  async archive(productId: string): Promise<ProductDocument> {
    return this.updateStatus(productId, {
      status: ProductStatus.ARCHIVED,
    });
  }

  private buildPublicFilter(query: ProductsQueryDto): Record<string, unknown> {
    const filter: Record<string, unknown> = {
      status: ProductStatus.ACTIVE,
    };

    if (query.type) {
      filter.type = query.type;
    }

    if (query.categoryId) {
      filter.categoryId = new Types.ObjectId(query.categoryId);
    }

    if (query.search) {
      filter.$or = [
        { name: new RegExp(this.escapeRegex(query.search), 'i') },
        { shortDescription: new RegExp(this.escapeRegex(query.search), 'i') },
        { description: new RegExp(this.escapeRegex(query.search), 'i') },
      ];
    }

    return filter;
  }

  private buildMineFilter(
    sellerId: string,
    query: ProductsQueryDto,
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = {
      sellerId: new Types.ObjectId(sellerId),
    };

    if (query.status) {
      filter.status = query.status;
    }

    if (query.type) {
      filter.type = query.type;
    }

    if (query.categoryId) {
      filter.categoryId = new Types.ObjectId(query.categoryId);
    }

    if (query.search) {
      filter.$or = [
        { name: new RegExp(this.escapeRegex(query.search), 'i') },
        { shortDescription: new RegExp(this.escapeRegex(query.search), 'i') },
        { description: new RegExp(this.escapeRegex(query.search), 'i') },
      ];
    }

    return filter;
  }

  private async updateStatus(
    productId: string,
    updatePayload: ProductUpdatePayload,
  ): Promise<ProductDocument> {
    const setPayload: Record<string, unknown> = {};
    const unsetPayload: Record<string, ''> = {};

    for (const [key, value] of Object.entries(updatePayload)) {
      if (value === undefined) {
        unsetPayload[key] = '';
        continue;
      }

      setPayload[key] = value;
    }

    const updated = await this.productModel
      .findByIdAndUpdate(
        productId,
        {
          ...(Object.keys(setPayload).length > 0 ? { $set: setPayload } : {}),
          ...(Object.keys(unsetPayload).length > 0
            ? { $unset: unsetPayload }
            : {}),
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Product not found');
    }

    return updated;
  }

  private async findProductOrFail(productId: string): Promise<ProductDocument> {
    const product = await this.productModel.findById(productId).exec();
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  private async ensureUniqueSlug(
    name: string,
    ignoreId?: string,
  ): Promise<string> {
    const baseSlug = toSlug(name);
    let slug = baseSlug;
    let index = 1;

    while (true) {
      const existing = await this.productModel.findOne({ slug }).exec();
      if (!existing || existing.id === ignoreId) {
        return slug;
      }

      slug = `${baseSlug}-${index}`;
      index += 1;
    }
  }

  private normalizeImages(
    images?: Array<Partial<ProductImage>>,
  ): ProductImage[] {
    return (images ?? []).map((image, index) => ({
      url: String(image.url ?? '').trim(),
      alt: image.alt?.trim(),
      order:
        typeof image.order === 'number' && Number.isFinite(image.order)
          ? image.order
          : index,
    }));
  }

  private normalizeFiles(files?: Array<Partial<ProductFile>>): ProductFile[] {
    return (files ?? []).map((file) => ({
      filename: String(file.filename ?? '').trim(),
      storagePath: String(file.storagePath ?? '').trim(),
      size: Number(file.size ?? 0),
      mimeType: String(file.mimeType ?? '').trim(),
      version:
        typeof file.version === 'number' && Number.isFinite(file.version)
          ? file.version
          : 1,
      uploadedAt: file.uploadedAt ? new Date(file.uploadedAt) : new Date(),
    }));
  }

  private normalizeCustomFields(
    customFields?: Array<Partial<ProductCustomField>>,
  ): ProductCustomField[] {
    return (customFields ?? []).map((field) => ({
      label: String(field.label ?? '').trim(),
      type: field.type ?? ProductCustomFieldType.TEXT,
      options: (field.options ?? []).map((option) => String(option).trim()),
      required: field.required ?? false,
      placeholder: field.placeholder?.trim(),
    }));
  }

  private normalizeEstimatedDays(
    estimatedDays?: Partial<ProductEstimatedDays>,
  ): ProductEstimatedDays | undefined {
    if (!estimatedDays) {
      return undefined;
    }

    return {
      min:
        estimatedDays.min !== undefined ? Number(estimatedDays.min) : undefined,
      max:
        estimatedDays.max !== undefined ? Number(estimatedDays.max) : undefined,
    };
  }

  private normalizeSubscriberDiscount(
    subscriberDiscount?: Partial<ProductSubscriberDiscount>,
  ): ProductSubscriberDiscount {
    return {
      pro:
        subscriberDiscount?.pro !== undefined
          ? Number(subscriberDiscount.pro)
          : 0,
      vip:
        subscriberDiscount?.vip !== undefined
          ? Number(subscriberDiscount.vip)
          : 0,
    };
  }

  private normalizeTags(tags?: string[]): string[] {
    return (tags ?? [])
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000
    );
  }
}
