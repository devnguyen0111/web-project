import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { ExternalPaymentProvider } from './schemas/transaction.schema';
import { WalletService } from './wallet.service';

@ApiTags('payment')
@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(private readonly walletService: WalletService) {}

  @Public()
  @Post('payos/webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'PayOS webhook callback' })
  @ApiBody({ schema: { type: 'object' } })
  async payosWebhook(
    @Body() body: Record<string, unknown>,
    @Headers('x-payos-signature') signature?: string,
  ) {
    try {
      return await this.walletService.handlePayosWebhook(body, signature);
    } catch (error) {
      this.logger.error(
        `PayOS webhook handling error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return { code: '00', message: 'Acknowledged' };
    }
  }

  @Public()
  @Post('callback/payos')
  @HttpCode(200)
  @ApiOperation({ summary: 'PayOS callback alias' })
  @ApiBody({ schema: { type: 'object' } })
  async payosCallbackAlias(
    @Body() body: Record<string, unknown>,
    @Headers('x-payment-signature') signature?: string,
  ) {
    try {
      return await this.walletService.handleProviderCallback(
        ExternalPaymentProvider.PAYOS,
        body,
        signature,
      );
    } catch (error) {
      this.logger.error(
        `PayOS callback alias handling error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return { code: '00', message: 'Acknowledged' };
    }
  }

  @Public()
  @Post('payos/return-sync')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sync PayOS return/cancel status' })
  @ApiBody({ schema: { type: 'object' } })
  async payosReturnSync(@Body() body: Record<string, unknown>) {
    try {
      return await this.walletService.syncPayosReturnStatus(body);
    } catch (error) {
      this.logger.error(
        `PayOS return sync error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return { code: '00', message: 'Acknowledged' };
    }
  }

  @Public()
  @Get('payos/return-status')
  @ApiOperation({ summary: 'Get normalized PayOS return status' })
  @ApiQuery({ name: 'orderCode', required: false })
  @ApiQuery({ name: 'id', required: false, description: 'PayOS paymentLinkId' })
  @ApiQuery({ name: 'paymentLinkId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'cancel', required: false })
  @ApiQuery({ name: 'code', required: false })
  async getPayosReturnStatus(@Query() query: Record<string, unknown>) {
    return this.walletService.getPayosReturnStatus(query);
  }
}
