import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OrdersService } from '../orders/orders.service';
import { OrderDocument } from '../orders/schemas/order.schema';
import {
  Product,
  ProductStatus,
  ProductType,
} from '../products/schemas/product.schema';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartCheckoutDto } from './dto/cart-checkout.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CartItem, CartItemDocument } from './schemas/cart-item.schema';
import {
  CartItemView,
  CartProductView,
  CartSummary,
  CartView,
  CheckoutFailedItem,
  CheckoutResponse,
  CheckoutSummary,
} from './cart.types';

type ProductDocumentLike = {
  _id: Types.ObjectId;
  slug: string;
  name: string;
  type: ProductType;
  price: number;
  originalPrice?: number;
  isOnSale: boolean;
  isFeatured: boolean;
  status: ProductStatus;
  previewUrl?: string;
  images?: Array<{ url: string; alt?: string; order?: number }>;
  rating: number;
  reviewsCount: number;
  salesCount: number;
  tags?: string[];
  categoryId?: Types.ObjectId;
  estimatedDays?: { min?: number; max?: number };
  subscriberDiscount?: { pro: number; vip: number };
};

@Injectable()
export class CartService {
  constructor(
    @InjectModel(CartItem.name)
    private readonly cartItemModel: Model<CartItem>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocumentLike>,
    private readonly ordersService: OrdersService,
  ) {}

  async getMyCart(userId: string): Promise<CartView> {
    const userObjectId = this.toObjectId(userId);
    const items = await this.cartItemModel
      .find({ userId: userObjectId })
      .sort({ createdAt: 1 })
      .exec();

    return this.buildCartView(items);
  }

  async addItem(userId: string, dto: AddCartItemDto): Promise<CartView> {
    const product = await this.findPurchasableProduct(dto.productId);
    const userObjectId = this.toObjectId(userId);
    const signature = this.getCustomDataSignature(dto.customData);

    const existingItems = await this.cartItemModel
      .find({ userId: userObjectId, productId: product._id })
      .exec();
    const matchedItem = existingItems.find(
      (item) => this.getCustomDataSignature(item.customData) === signature,
    );

    if (matchedItem) {
      matchedItem.quantity += dto.quantity;
      matchedItem.selected = true;
      if (dto.buyerNote !== undefined) {
        matchedItem.buyerNote = dto.buyerNote;
      }
      if (dto.customData !== undefined) {
        matchedItem.customData = dto.customData;
      }
      await matchedItem.save();
      return this.getMyCart(userId);
    }

    await this.cartItemModel.create({
      userId: userObjectId,
      productId: product._id,
      quantity: dto.quantity,
      customData: dto.customData,
      buyerNote: dto.buyerNote,
      selected: true,
    });

    return this.getMyCart(userId);
  }

  async updateItem(
    userId: string,
    itemId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartView> {
    const item = await this.findOwnedItem(userId, itemId);

    if (dto.quantity !== undefined) {
      item.quantity = dto.quantity;
    }
    if (dto.selected !== undefined) {
      item.selected = dto.selected;
    }
    if (dto.buyerNote !== undefined) {
      item.buyerNote = dto.buyerNote;
    }

    await item.save();
    return this.getMyCart(userId);
  }

  async removeItem(userId: string, itemId: string): Promise<CartView> {
    const item = await this.findOwnedItem(userId, itemId);
    await item.deleteOne();
    return this.getMyCart(userId);
  }

  async clearMyCart(userId: string): Promise<CartView> {
    await this.cartItemModel.deleteMany({ userId: this.toObjectId(userId) }).exec();
    return this.getMyCart(userId);
  }

  async checkout(
    userId: string,
    dto: CartCheckoutDto,
  ): Promise<CheckoutResponse> {
    const candidateItems = await this.resolveCheckoutItems(userId, dto.itemIds);
    const createdOrders: OrderDocument[] = [];
    const failedItems: CheckoutFailedItem[] = [];
    const summary: CheckoutSummary = {
      itemCount: 0,
      selectedCount: 0,
      subtotal: 0,
      successCount: 0,
      failedCount: 0,
    };

    for (const item of candidateItems.items) {
      const lineTotal = item.product ? item.product.price * item.quantity : 0;
      if (!item.available || !item.product) {
        failedItems.push({
          itemId: item.id,
          productId: item.productId,
          quantity: item.quantity,
          reason: 'Product is no longer available',
        });
        continue;
      }

      try {
        const order = await this.ordersService.createOrder(userId, {
          productId: item.productId,
          quantity: item.quantity,
          customData: item.customData,
          buyerNote: item.buyerNote,
        });
        createdOrders.push(order);
        summary.itemCount += item.quantity;
        summary.selectedCount += item.quantity;
        summary.subtotal += lineTotal;
        summary.successCount += 1;

        const deleteResult = await this.cartItemModel
          .deleteOne({
            _id: this.toObjectId(item.id),
            userId: this.toObjectId(userId),
          })
          .exec();

        if (!deleteResult.deletedCount) {
          failedItems.push({
            itemId: item.id,
            productId: item.productId,
            quantity: item.quantity,
            reason: 'Order created but cart item could not be removed',
          });
        }
      } catch (error) {
        failedItems.push({
          itemId: item.id,
          productId: item.productId,
          quantity: item.quantity,
          reason: this.getErrorMessage(error),
        });
      }
    }

    failedItems.push(...candidateItems.missingFailures);
    summary.failedCount = failedItems.length;

    if (createdOrders.length === 0 && failedItems.length === 0) {
      throw new BadRequestException('No cart items selected for checkout');
    }

    return {
      createdOrders,
      failedItems,
      summary,
    };
  }

  private async resolveCheckoutItems(userId: string, itemIds?: string[]) {
    const userObjectId = this.toObjectId(userId);
    const query = itemIds?.length
      ? {
          userId: userObjectId,
          _id: { $in: itemIds.map((itemId) => this.toObjectId(itemId)) },
        }
      : {
          userId: userObjectId,
          selected: true,
        };

    const items = await this.cartItemModel.find(query).sort({ createdAt: 1 }).exec();
    const hydrated = await this.hydrateCartItems(items);
    const foundIds = new Set(hydrated.items.map((item) => item.id));
    const missingIds = itemIds?.filter((itemId) => !foundIds.has(itemId)) ?? [];

    const missingFailures: CheckoutFailedItem[] = missingIds.map((itemId) => ({
      itemId,
      quantity: 0,
      reason: 'Cart item not found',
    }));

    return {
      items: hydrated.items,
      summary: hydrated.summary,
      missingFailures,
    };
  }

  private async buildCartView(items: CartItemDocument[]): Promise<CartView> {
    const hydrated = await this.hydrateCartItems(items);
    return {
      items: hydrated.items,
      summary: hydrated.summary,
    };
  }

  private async hydrateCartItems(items: CartItemDocument[]) {
    const productIds = items.map((item) => item.productId.toString());
    const products = productIds.length
      ? await this.productModel
          .find({ _id: { $in: productIds.map((productId) => this.toObjectId(productId)) } })
          .exec()
      : [];

    const productMap = new Map(
      products.map((product) => [product._id.toString(), this.toProductView(product)]),
    );

    const cartItems: CartItemView[] = items.map((item) => {
      const product = productMap.get(item.productId.toString()) ?? null;
      const available = Boolean(product && product.status === ProductStatus.ACTIVE);
      const lineTotal = available && product ? product.price * item.quantity : 0;

      return {
        id: item.id,
        productId: item.productId.toString(),
        quantity: item.quantity,
        selected: item.selected,
        buyerNote: item.buyerNote,
        customData:
          item.customData && typeof item.customData === 'object'
            ? (item.customData as Record<string, unknown>)
            : undefined,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        available,
        lineTotal,
        product,
      };
    });

    const summary: CartSummary = cartItems.reduce<CartSummary>(
      (accumulator, item) => {
        accumulator.itemCount += item.quantity;
        if (item.selected) {
          accumulator.selectedCount += item.quantity;
          accumulator.subtotal += item.lineTotal;
        }
        return accumulator;
      },
      {
        itemCount: 0,
        selectedCount: 0,
        subtotal: 0,
      },
    );

    return {
      items: cartItems,
      summary,
    };
  }

  private async findOwnedItem(userId: string, itemId: string): Promise<CartItemDocument> {
    const item = await this.cartItemModel
      .findOne({
        _id: this.toObjectId(itemId),
        userId: this.toObjectId(userId),
      })
      .exec();

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    return item;
  }

  private async findPurchasableProduct(productId: string): Promise<ProductDocumentLike> {
    const product = await this.productModel.findById(this.toObjectId(productId)).exec();
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (product.status !== ProductStatus.ACTIVE) {
      throw new BadRequestException('Product is not available for cart');
    }

    return product;
  }

  private toProductView(product: ProductDocumentLike): CartProductView {
    return {
      id: product._id.toString(),
      slug: product.slug,
      name: product.name,
      type: product.type,
      price: product.price,
      originalPrice: product.originalPrice,
      isOnSale: product.isOnSale,
      isFeatured: product.isFeatured,
      status: product.status,
      previewUrl: product.previewUrl,
      rating: product.rating,
      reviewsCount: product.reviewsCount,
      salesCount: product.salesCount,
      tags: product.tags ?? [],
      categoryId: product.categoryId?.toString(),
      estimatedDays: product.estimatedDays,
      subscriberDiscount: product.subscriberDiscount,
      images: (product.images ?? []).map((image) => ({
        url: image.url,
        alt: image.alt,
        order: image.order ?? 0,
      })),
    };
  }

  private getCustomDataSignature(customData?: Record<string, unknown>): string {
    if (customData === undefined) {
      return 'null';
    }

    return JSON.stringify(this.sortValue(customData));
  }

  private sortValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortValue(item));
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (value instanceof Types.ObjectId) {
      return value.toString();
    }
    if (value && typeof value === 'object') {
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((accumulator, key) => {
          const current = (value as Record<string, unknown>)[key];
          if (current !== undefined) {
            accumulator[key] = this.sortValue(current);
          }
          return accumulator;
        }, {});
    }
    return value ?? null;
  }

  private toObjectId(value: string): Types.ObjectId {
    return new Types.ObjectId(value);
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }
    return 'Checkout failed';
  }
}
