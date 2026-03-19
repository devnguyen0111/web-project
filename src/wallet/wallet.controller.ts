import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AUTHOR_PLUS_ROLES, Role } from '../common/constants/roles.constant';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-objectid.pipe';
import { CancelDepositDto } from './dto/cancel-deposit.dto';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { WalletTransactionQueryDto } from './dto/wallet-transaction-query.dto';
import { buildDepositContext } from './request-context.util';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@ApiBearerAuth()
@Roles(...AUTHOR_PLUS_ROLES)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get(['balance', 'me'])
  @ApiOperation({ summary: 'Get my wallet balance' })
  getBalance(@CurrentUser('userId') userId: string) {
    return this.walletService.getMyWallet(userId);
  }

  @Get(['transactions', 'me/transactions'])
  @ApiOperation({ summary: 'List my wallet transactions' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'status', required: false })
  listTransactions(
    @CurrentUser('userId') userId: string,
    @Query() query: WalletTransactionQueryDto,
  ) {
    return this.walletService.listMyTransactions(userId, query);
  }

  @Post(['deposit', 'deposit-requests'])
  @ApiOperation({ summary: 'Create a deposit request' })
  @ApiBody({ type: CreateDepositDto })
  createDeposit(
    @CurrentUser('userId') userId: string,
    @Body() payload: CreateDepositDto,
    @Req() request: Request,
  ) {
    return this.walletService.createDepositRequest(
      userId,
      payload,
      buildDepositContext(request),
    );
  }

  @Get(['deposit/:id', 'deposit-requests/:id'])
  @ApiOperation({ summary: 'Get a deposit request by transaction id' })
  @ApiParam({ name: 'id' })
  getDeposit(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.walletService.getDepositRequest(userId, id);
  }

  @Post(['deposit/:id/cancel', 'deposit-requests/:id/cancel'])
  @ApiOperation({ summary: 'Cancel a pending deposit request' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: CancelDepositDto, required: false })
  cancelDeposit(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() payload: CancelDepositDto,
  ) {
    return this.walletService.cancelDepositRequest(userId, id, payload?.reason);
  }
}
