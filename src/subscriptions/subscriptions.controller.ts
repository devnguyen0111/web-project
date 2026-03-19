import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AUTHOR_PLUS_ROLES } from '../common/constants/roles.constant';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { SetAutoRenewDto } from './dto/set-auto-renew.dto';
import { SetCancelAtPeriodEndDto } from './dto/set-cancel-at-period-end.dto';
import { SubscriptionHistoryQueryDto } from './dto/subscription-history-query.dto';
import { RenewSubscriptionDto } from './dto/renew-subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('subscriptions')
@ApiBearerAuth()
@Roles(...AUTHOR_PLUS_ROLES)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('plans')
  @Public()
  @Roles()
  @ApiOperation({ summary: 'List subscription plans' })
  listPlans() {
    return this.subscriptionsService.getPlans();
  }

  @Get('me')
  @ApiOperation({ summary: 'Get my subscription and monthly post quota' })
  getMine(@CurrentUser('userId') userId: string) {
    return this.subscriptionsService.getMySubscription(userId);
  }

  @Post('me/purchase')
  @ApiOperation({ summary: 'Purchase or upgrade subscription' })
  @ApiBody({ type: RenewSubscriptionDto })
  purchaseMine(
    @CurrentUser('userId') userId: string,
    @Body() payload: RenewSubscriptionDto,
  ) {
    return this.subscriptionsService.purchaseMySubscription(userId, payload);
  }

  @Post('me/renew')
  @ApiOperation({ summary: 'Legacy alias for purchase/renew by month' })
  @ApiBody({ type: RenewSubscriptionDto })
  renewMine(
    @CurrentUser('userId') userId: string,
    @Body() payload: RenewSubscriptionDto,
  ) {
    return this.subscriptionsService.purchaseMySubscription(userId, payload);
  }

  @Post('me/auto-renew')
  @ApiOperation({ summary: 'Enable or disable auto renew' })
  setAutoRenew(
    @CurrentUser('userId') userId: string,
    @Body() payload: SetAutoRenewDto,
  ) {
    return this.subscriptionsService.setAutoRenew(userId, payload.enabled);
  }

  @Post('me/cancel-at-period-end')
  @ApiOperation({
    summary: 'Set cancel at period end. Defaults to true when omitted',
  })
  setCancelAtPeriodEnd(
    @CurrentUser('userId') userId: string,
    @Body() payload: SetCancelAtPeriodEndDto,
  ) {
    return this.subscriptionsService.setCancelAtPeriodEnd(
      userId,
      payload.cancel ?? true,
    );
  }

  @Get('me/history')
  @ApiOperation({ summary: 'Get subscription payment history' })
  getHistory(
    @CurrentUser('userId') userId: string,
    @Query() query: SubscriptionHistoryQueryDto,
  ) {
    return this.subscriptionsService.getMySubscriptionHistory(userId, query);
  }
}
