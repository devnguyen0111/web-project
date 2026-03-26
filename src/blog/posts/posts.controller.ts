import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpStatus,
  Param,
  Patch,
  Post as HttpPost,
  Query,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AUTHOR_PLUS_ROLES, Role } from '../../common/constants/roles.constant';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { ParseFilePipeBuilder } from '@nestjs/common';
import { CreatePostDto } from './dto/create-post.dto';
import { PostsQueryDto } from './dto/posts-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { VotePollDto } from './dto/vote-poll.dto';
import { PostsService } from './posts.service';
import type { Request } from 'express';
import type { JwtPayload } from '../../auth/strategies/jwt.strategy';

interface AuthUser {
  userId: string;
  role: Role;
}

@ApiTags('posts')
@Controller('posts')
export class PostsController {
  constructor(
    private readonly postsService: PostsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List published posts' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'tagId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listPublished(@Query() query: PostsQueryDto): Promise<unknown> {
    return this.postsService.listPublished(query);
  }

  @ApiBearerAuth()
  @Roles(...AUTHOR_PLUS_ROLES)
  @Get('me')
  @ApiOperation({ summary: 'List my posts' })
  listMine(@CurrentUser() user: AuthUser, @Query() query: PostsQueryDto) {
    return this.postsService.listMyPosts(user.userId, query);
  }

  @ApiBearerAuth()
  @Roles(...AUTHOR_PLUS_ROLES)
  @Get('me/:id')
  @ApiOperation({ summary: 'Get my post detail by id' })
  @ApiParam({ name: 'id' })
  findMineById(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.postsService.findMyPostById(id, user);
  }

  @ApiBearerAuth()
  @Roles(...AUTHOR_PLUS_ROLES)
  @HttpPost()
  @ApiOperation({ summary: 'Create post draft' })
  @ApiBody({ type: CreatePostDto })
  create(
    @CurrentUser('userId') userId: string,
    @Body() payload: CreatePostDto,
  ) {
    return this.postsService.createDraft(userId, payload);
  }

  @ApiBearerAuth()
  @Roles(...AUTHOR_PLUS_ROLES)
  @HttpPost(':id/cover-image')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload post cover image' })
  @ApiParam({ name: 'id' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  uploadCoverImage(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/i })
        .addMaxSizeValidator({ maxSize: 8 * 1024 * 1024 })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    file: {
      buffer: Buffer;
      size: number;
      mimetype?: string;
      originalname?: string;
    },
  ) {
    return this.postsService.uploadCoverImage(id, user, file);
  }

  @ApiBearerAuth()
  @Roles(...AUTHOR_PLUS_ROLES)
  @HttpPost('block-image')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload image for post block editor' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  uploadBlockImage(
    @CurrentUser('userId') userId: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/i })
        .addMaxSizeValidator({ maxSize: 8 * 1024 * 1024 })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    file: {
      buffer: Buffer;
      size: number;
      mimetype?: string;
      originalname?: string;
    },
  ) {
    return this.postsService.uploadBlockImage(userId, file);
  }

  @ApiBearerAuth()
  @Roles(...AUTHOR_PLUS_ROLES)
  @Patch(':id')
  @ApiOperation({ summary: 'Update own post draft' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: UpdatePostDto })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() payload: UpdatePostDto,
  ) {
    return this.postsService.updatePost(id, user, payload);
  }

  @ApiBearerAuth()
  @Roles(...AUTHOR_PLUS_ROLES)
  @Delete(':id')
  @ApiOperation({
    summary: 'Delete post (author own, staff published, admin any)',
  })
  @ApiParam({ name: 'id' })
  remove(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.postsService.deletePost(id, user);
  }

  @ApiBearerAuth()
  @Roles(...AUTHOR_PLUS_ROLES)
  @HttpPost(':id/submit')
  @ApiOperation({ summary: 'Submit post for moderation' })
  @ApiParam({ name: 'id' })
  submit(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.postsService.submitForReview(id, user);
  }

  @ApiBearerAuth()
  @Roles(...AUTHOR_PLUS_ROLES)
  @HttpPost(':id/like')
  @ApiOperation({ summary: 'Toggle like on post' })
  @ApiParam({ name: 'id' })
  toggleLike(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.postsService.toggleLike(id, userId);
  }

  @ApiBearerAuth()
  @Roles(...AUTHOR_PLUS_ROLES)
  @Get(':id/like-status')
  @ApiOperation({ summary: 'Get my like status on a published post' })
  @ApiParam({ name: 'id' })
  likeStatus(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.postsService.getLikeStatus(id, userId);
  }

  @ApiBearerAuth()
  @Roles(...AUTHOR_PLUS_ROLES)
  @HttpPost(':id/bookmark')
  @ApiOperation({ summary: 'Toggle bookmark on post' })
  @ApiParam({ name: 'id' })
  toggleBookmark(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.postsService.toggleBookmark(id, userId);
  }

  @ApiBearerAuth()
  @Roles(...AUTHOR_PLUS_ROLES)
  @HttpPost(':postId/poll/vote')
  @ApiOperation({ summary: 'Vote poll option in post' })
  @ApiParam({ name: 'postId' })
  @ApiBody({ type: VotePollDto })
  votePoll(
    @Param('postId', ParseObjectIdPipe) postId: string,
    @CurrentUser('userId') userId: string,
    @Body() payload: VotePollDto,
  ) {
    return this.postsService.votePoll(postId, userId, payload.optionIndex);
  }

  @Public()
  @Get(':postId/poll/results')
  @ApiOperation({ summary: 'Get poll results by post id' })
  @ApiParam({ name: 'postId' })
  pollResults(@Param('postId', ParseObjectIdPipe) postId: string) {
    return this.postsService.pollResults(postId);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get published post by slug' })
  @ApiParam({ name: 'slug' })
  @ApiQuery({
    name: 'trackView',
    required: false,
    description: 'Set false to skip view increment',
  })
  findBySlug(
    @Param('slug') slug: string,
    @Query('trackView') trackView?: string,
    @Headers('purpose') purpose?: string,
    @Headers('next-router-prefetch') nextRouterPrefetch?: string,
    @Headers('authorization') authorization?: string,
    @Req() request?: Request,
  ): Promise<unknown> {
    const isPrefetchRequest =
      purpose?.toLowerCase() === 'prefetch' || nextRouterPrefetch !== undefined;

    const shouldTrackView =
      trackView !== undefined
        ? trackView.toLowerCase() !== 'false'
        : !isPrefetchRequest;

    return this.postsService.findPublishedBySlug(slug, {
      shouldIncrementView: shouldTrackView,
      viewerFingerprint: this.buildViewerFingerprint(request),
      viewerUserId: this.extractOptionalViewerUserId(authorization),
    });
  }

  private extractOptionalViewerUserId(
    authorizationHeader?: string,
  ): string | undefined {
    if (!authorizationHeader) {
      return undefined;
    }

    const [scheme, token] = authorizationHeader.split(' ');
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
      return undefined;
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('jwt.accessTokenSecret'),
      });
      return payload.sub;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        return undefined;
      }
      return undefined;
    }
  }

  private buildViewerFingerprint(request?: Request): string | undefined {
    if (!request) {
      return undefined;
    }

    const headers = request.headers as Record<
      string,
      string | string[] | undefined
    >;
    const forwardedFor = headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(',')[0]?.trim();

    const ip =
      forwardedIp ||
      request.ip ||
      request.socket?.remoteAddress ||
      'unknown-ip';
    const userAgent = headers['user-agent'];
    const normalizedUserAgent = Array.isArray(userAgent)
      ? userAgent[0]
      : userAgent || 'unknown-user-agent';

    return `${ip}:${normalizedUserAgent}`;
  }
}
