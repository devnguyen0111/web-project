import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  AUTHENTICATED_ROLES,
  Role,
} from '../../common/constants/roles.constant';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { CreateProductReviewDto } from './dto/create-product-review.dto';
import { CreateStoreReviewDto } from './dto/create-store-review.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';
import { ReviewQueryDto } from './dto/review-query.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Public()
  @Get('products/:productId/reviews')
  @ApiOperation({ summary: 'List product reviews' })
  listProductReviews(
    @Param('productId', ParseObjectIdPipe) productId: string,
    @Query() query: ReviewQueryDto,
  ) {
    return this.reviewsService.listProductReviews(productId, query);
  }

  @ApiBearerAuth()
  @Roles(...AUTHENTICATED_ROLES)
  @Post('products/:productId/reviews')
  @ApiOperation({ summary: 'Create product review' })
  @ApiBody({ type: CreateProductReviewDto })
  createProductReview(
    @CurrentUser('userId') userId: string,
    @Param('productId', ParseObjectIdPipe) productId: string,
    @Body() payload: CreateProductReviewDto,
  ) {
    return this.reviewsService.createProductReview(userId, productId, payload);
  }

  @Public()
  @Get('store/reviews')
  @ApiOperation({ summary: 'List store reviews' })
  listStoreReviews(@Query() query: ReviewQueryDto) {
    return this.reviewsService.listStoreReviews(query);
  }

  @ApiBearerAuth()
  @Roles(...AUTHENTICATED_ROLES)
  @Post('store/reviews')
  @ApiOperation({ summary: 'Create store review' })
  @ApiBody({ type: CreateStoreReviewDto })
  createStoreReview(
    @CurrentUser('userId') userId: string,
    @Body() payload: CreateStoreReviewDto,
  ) {
    return this.reviewsService.createStoreReview(userId, payload);
  }

  @ApiBearerAuth()
  @Roles(Role.STAFF, Role.ADMIN)
  @Patch('reviews/:id/reply')
  @ApiOperation({ summary: 'Reply to a review as staff/admin' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of review' })
  @ApiBody({ type: ReplyReviewDto })
  replyReview(
    @CurrentUser('userId') actorUserId: string,
    @Param('id', ParseObjectIdPipe) reviewId: string,
    @Body() payload: ReplyReviewDto,
  ) {
    return this.reviewsService.replyReview(reviewId, actorUserId, payload);
  }
}
