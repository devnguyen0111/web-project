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
import {
  AUTHENTICATED_ROLES,
  Role,
} from '../../common/constants/roles.constant';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { HideCommentDto } from './dto/hide-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

interface AuthUser {
  userId: string;
  role: Role;
}

@ApiTags('comments')
@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Public()
  @Get('posts/:postId/comments')
  @ApiOperation({ summary: 'List comments by post id' })
  @ApiParam({ name: 'postId' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listByPost(
    @Param('postId', ParseObjectIdPipe) postId: string,
    @Query() query: PaginationDto,
  ) {
    return this.commentsService.listByPost(postId, query);
  }

  @ApiBearerAuth()
  @Roles(...AUTHENTICATED_ROLES)
  @HttpPost('posts/:postId/comments')
  @ApiOperation({ summary: 'Create comment in post' })
  @ApiParam({ name: 'postId' })
  @ApiBody({ type: CreateCommentDto })
  create(
    @Param('postId', ParseObjectIdPipe) postId: string,
    @CurrentUser('userId') userId: string,
    @Body() payload: CreateCommentDto,
  ) {
    return this.commentsService.create(postId, userId, payload);
  }

  @ApiBearerAuth()
  @Roles(...AUTHENTICATED_ROLES)
  @Patch('comments/:id')
  @ApiOperation({ summary: 'Update own comment' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: UpdateCommentDto })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('userId') userId: string,
    @Body() payload: UpdateCommentDto,
  ) {
    return this.commentsService.update(id, userId, payload);
  }

  @ApiBearerAuth()
  @Roles(...AUTHENTICATED_ROLES)
  @Delete('comments/:id')
  @ApiOperation({ summary: 'Delete own comment' })
  @ApiParam({ name: 'id' })
  remove(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.commentsService.remove(id, userId);
  }

  @ApiBearerAuth()
  @Roles(...AUTHENTICATED_ROLES)
  @HttpPost('comments/:id/like')
  @ApiOperation({ summary: 'Toggle like on comment' })
  @ApiParam({ name: 'id' })
  toggleLike(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.commentsService.toggleLike(id, userId);
  }

  @ApiBearerAuth()
  @Roles(Role.STAFF, Role.ADMIN)
  @Patch('comments/:id/hide')
  @ApiOperation({ summary: 'Hide comment (staff/admin)' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: HideCommentDto })
  hide(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() payload: HideCommentDto,
  ) {
    return this.commentsService.hide(id, user, payload.reason);
  }
}
