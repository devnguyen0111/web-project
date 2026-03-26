import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AUTHOR_PLUS_ROLES } from '../common/constants/roles.constant';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { GamificationService } from './gamification.service';

@ApiTags('badges')
@Controller('badges')
export class BadgesController {
  constructor(private readonly gamificationService: GamificationService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all active badges' })
  listBadges() {
    return this.gamificationService.getBadges();
  }

  @ApiBearerAuth()
  @Roles(...AUTHOR_PLUS_ROLES)
  @Get('me')
  @ApiOperation({ summary: 'List badges earned by current user' })
  listMyBadges(@CurrentUser('userId') userId: string) {
    return this.gamificationService.getMyBadges(userId);
  }
}
