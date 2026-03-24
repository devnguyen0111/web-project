import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ProductsService } from '../products/products.service';
import { CreateProductReviewDto } from './dto/create-product-review.dto';
import { CreateStoreReviewDto } from './dto/create-store-review.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';
import { ReviewQueryDto } from './dto/review-query.dto';
import { Review, ReviewDocument, ReviewTargetType } from './schemas/review.schema';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<Review>,
    private readonly productsService: ProductsService,
  ) {}

  async listProductReviews(productId: string, query: ReviewQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const filter = {
      targetType: ReviewTargetType.PRODUCT,
      productId: new Types.ObjectId(productId),
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

  async createProductReview(
    userId: string,
    productId: string,
    payload: CreateProductReviewDto,
  ) {
    await this.productsService.findPublicDetail(productId);
    try {
      return await this.reviewModel.create({
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
