import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { OrderDeliveryEmailService } from './order-delivery-email.service';

@ApiTags('orders-public')
@Controller('orders/download')
export class OrdersPublicController {
  constructor(
    private readonly orderDeliveryEmailService: OrderDeliveryEmailService,
  ) {}

  @Public()
  @Get('email/:token')
  @ApiOperation({ summary: 'Public download redirect via signed email token' })
  @ApiParam({ name: 'token', description: 'Signed email download token' })
  async downloadByEmailToken(
    @Param('token') token: string,
    @Res() response: Response,
  ) {
    const redirectUrl =
      await this.orderDeliveryEmailService.resolveSignedDownloadUrl(token);
    return response.redirect(302, redirectUrl);
  }
}
