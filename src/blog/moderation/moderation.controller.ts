import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../common/constants/roles.constant';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { RejectPostDto } from './dto/reject-post.dto';
import { ModerationService } from './moderation.service';
import { PostsQueryDto } from '../posts/dto/posts-query.dto';

@ApiTags('moderation')
@ApiBearerAuth()
@Roles(Role.STAFF, Role.ADMIN)
@Controller('moderation/posts')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Get()
  @ApiOperation({ summary: 'List pending posts for moderation' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listPending(@Query() query: PostsQueryDto) {
    return this.moderationService.listPending(query);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve pending post' })
  @ApiParam({ name: 'id' })
  approve(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('userId') reviewerId: string,
  ) {
    return this.moderationService.approve(id, reviewerId);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject pending post' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: RejectPostDto })
  reject(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('userId') reviewerId: string,
    @Body() payload: RejectPostDto,
  ) {
    return this.moderationService.reject(id, reviewerId, payload.reason);
  }
}
