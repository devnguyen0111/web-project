import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../common/constants/roles.constant';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminAdjustWalletDto } from './dto/admin-adjust-wallet.dto';
import { WalletService } from './wallet.service';

@ApiTags('wallet-admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller(['wallet/admin', 'admin/wallet'])
export class WalletAdminController {
  constructor(private readonly walletService: WalletService) {}

  @Post('adjust')
  @ApiOperation({ summary: 'Adjust a user wallet balance (admin only)' })
  @ApiBody({ type: AdminAdjustWalletDto })
  adjust(
    @CurrentUser('userId') actorUserId: string,
    @Body() payload: AdminAdjustWalletDto,
  ) {
    return this.walletService.adminAdjust(actorUserId, payload);
  }
}
