import { Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AUTHENTICATED_ROLES } from '../common/constants/roles.constant';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-objectid.pipe';
import { LeaderboardQueryDto } from '../gamification/dto/leaderboard-query.dto';
import { GamificationService } from '../gamification/gamification.service';
import { FollowQueryDto } from './dto/follow-query.dto';
import { SocialService } from './social.service';

@ApiTags('social')
@ApiBearerAuth()
@Roles(...AUTHENTICATED_ROLES)
@Controller('users')
export class SocialController {
  constructor(
    private readonly socialService: SocialService,
    private readonly gamificationService: GamificationService,
  ) {}

  @Get('leaderboard')
  @ApiOperation({ summary: 'Get users leaderboard by gamification score' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  leaderboard(@Query() query: LeaderboardQueryDto) {
    return this.gamificationService.getLeaderboard(query);
  }

  @Post(':id/follow')
  @ApiOperation({ summary: 'Follow a user' })
  @ApiParam({ name: 'id' })
  follow(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseObjectIdPipe) targetUserId: string,
  ) {
    return this.socialService.follow(userId, targetUserId);
  }

  @Delete(':id/follow')
  @ApiOperation({ summary: 'Unfollow a user' })
  @ApiParam({ name: 'id' })
  unfollow(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseObjectIdPipe) targetUserId: string,
  ) {
    return this.socialService.unfollow(userId, targetUserId);
  }

  @Get(':id/followers')
  @ApiOperation({ summary: 'List followers of a user' })
  @ApiParam({ name: 'id' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  followers(
    @Param('id', ParseObjectIdPipe) userId: string,
    @Query() query: FollowQueryDto,
  ) {
    return this.socialService.listFollowers(userId, query);
  }

  @Get(':id/following')
  @ApiOperation({ summary: 'List users followed by a user' })
  @ApiParam({ name: 'id' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  following(
    @Param('id', ParseObjectIdPipe) userId: string,
    @Query() query: FollowQueryDto,
  ) {
    return this.socialService.listFollowing(userId, query);
  }
}
