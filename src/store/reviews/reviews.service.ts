import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ProductsService } from '../products/products.service';
import { Order, OrderStatus } from '../orders/schemas/order.schema';
import { CreateProductReviewDto } from './dto/create-product-review.dto';
import { CreateStoreReviewDto } from './dto/create-store-review.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';
import { ReviewQueryDto } from './dto/review-query.dto';
import {
  Review,
  ReviewDocument,
  ReviewTargetType,
} from './schemas/review.schema';

type ProductReviewListItem = {
  _id: Types.ObjectId;
  reviewerId: Types.ObjectId;
  targetType: ReviewTargetType;
  productId?: Types.ObjectId;
  rating: number;
  aspects?: {
    quality?: number;
    delivery?: number;
    communication?: number;
  };
  content?: string;
  staffReply?: {
    message: string;
    repliedBy: Types.ObjectId;
    repliedAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
};

const VERIFIED_PURCHASE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.QUOTE_ACCEPTED,
  OrderStatus.PROCESSING,
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
];

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<Review>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<Order>,
    private readonly productsService: ProductsService,
  ) {}

  async listProductReviews(productId: string, query: ReviewQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const productObjectId = new Types.ObjectId(productId);
    const filter = {
      targetType: ReviewTargetType.PRODUCT,
      productId: productObjectId,
    };
    const [items, total] = await Promise.all([
      this.reviewModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean<ProductReviewListItem[]>()
        .exec(),
      this.reviewModel.countDocuments(filter),
    ]);

    const verifiedPurchaseSet = await this.buildProductVerifiedPurchaseSet(
      productObjectId,
      items.map((item) => item.reviewerId),
    );

    const enrichedItems = items.map((item) => ({
      ...item,
      verifiedPurchase: verifiedPurchaseSet.has(item.reviewerId.toString()),
    }));

    return new PaginatedResponseDto(
      enrichedItems,
      total,
      query.page,
      query.limit,
    );
  }

  async createProductReview(
    userId: string,
    productId: string,
    payload: CreateProductReviewDto,
  ) {
    await this.productsService.findPublicDetail(productId);
    try {
      const created = await this.reviewModel.create({
        targetType: ReviewTargetType.PRODUCT,
        productId: new Types.ObjectId(productId),
        reviewerId: new Types.ObjectId(userId),
        rating: payload.rating,
        aspects: {
          quality: payload.qualityRating,
          delivery: payload.deliveryRating,
          communication: payload.communicationRating,
        },
        content: payload.content?.trim(),
      });

      const verifiedPurchaseSet = await this.buildProductVerifiedPurchaseSet(
        new Types.ObjectId(productId),
        [new Types.ObjectId(userId)],
      );

      return {
        ...created.toObject(),
        verifiedPurchase: verifiedPurchaseSet.has(userId),
      };
    } catch (error) {
      if (this.isDuplicate(error)) {
        throw new ConflictException('You have already reviewed this product');
      }
      throw error;
    }
  }

  async listStoreReviews(query: ReviewQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const filter = {
      targetType: ReviewTargetType.STORE,
    };
    const [items, total] = await Promise.all([
      this.reviewModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .exec(),
      this.reviewModel.countDocuments(filter),
    ]);

    return new PaginatedResponseDto(items, total, query.page, query.limit);
  }

  async createStoreReview(userId: string, payload: CreateStoreReviewDto) {
    try {
      return await this.reviewModel.create({
        targetType: ReviewTargetType.STORE,
        reviewerId: new Types.ObjectId(userId),
        rating: payload.rating,
        content: payload.content?.trim(),
      });
    } catch (error) {
      if (this.isDuplicate(error)) {
        throw new ConflictException('You have already reviewed the store');
      }
      throw error;
    }
  }

  async replyReview(
    reviewId: string,
    actorUserId: string,
    payload: ReplyReviewDto,
  ): Promise<ReviewDocument> {
    const review = await this.reviewModel.findById(reviewId).exec();
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    review.staffReply = {
      message: payload.message.trim(),
      repliedBy: new Types.ObjectId(actorUserId),
      repliedAt: new Date(),
    };
    await review.save();
    return review;
  }

  private async buildProductVerifiedPurchaseSet(
    productId: Types.ObjectId,
    reviewerIds: Types.ObjectId[],
  ) {
    const uniqueReviewerIds = Array.from(
      new Set(
        reviewerIds
          .filter((reviewerId) => Types.ObjectId.isValid(reviewerId))
          .map((reviewerId) => reviewerId.toString()),
      ),
    ).map((reviewerId) => new Types.ObjectId(reviewerId));

    if (!uniqueReviewerIds.length) {
      return new Set<string>();
    }

    const rows = await this.orderModel
      .aggregate<{ _id: Types.ObjectId }>([
        {
          $match: {
            buyerId: { $in: uniqueReviewerIds },
            status: { $in: VERIFIED_PURCHASE_ORDER_STATUSES },
          },
        },
        {
          $unwind: '$items',
        },
        {
          $match: {
            'items.productId': productId,
          },
        },
        {
          $group: {
            _id: '$buyerId',
          },
        },
      ])
      .exec();

    return new Set(rows.map((row) => row._id.toString()));
  }

  private isDuplicate(error: unknown): boolean {
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
