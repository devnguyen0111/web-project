import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post as HttpPost,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AUTHOR_PLUS_ROLES, Role } from '../../common/constants/roles.constant';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { CreatePostDto } from './dto/create-post.dto';
import { PostsQueryDto } from './dto/posts-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { VotePollDto } from './dto/vote-poll.dto';
import { PostsService } from './posts.service';

interface AuthUser {
  userId: string;
  role: Role;
}

@ApiTags('posts')
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List published posts' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'tagId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listPublished(@Query() query: PostsQueryDto) {
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
  @ApiOperation({ summary: 'Delete own post' })
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
  findBySlug(@Param('slug') slug: string) {
    return this.postsService.findPublishedBySlug(slug);
  }
}
