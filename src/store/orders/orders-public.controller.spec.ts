import { BadRequestException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { OrderDeliveryEmailService } from './order-delivery-email.service';
import { OrdersPublicController } from './orders-public.controller';

describe('OrdersPublicController', () => {
  let app: INestApplication;
  let orderDeliveryEmailService: {
    resolveSignedDownloadUrl: jest.Mock;
  };

  beforeEach(async () => {
    orderDeliveryEmailService = {
      resolveSignedDownloadUrl: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [OrdersPublicController],
      providers: [
        {
          provide: OrderDeliveryEmailService,
          useValue: orderDeliveryEmailService,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('redirects to presigned url when token is valid', async () => {
    orderDeliveryEmailService.resolveSignedDownloadUrl.mockResolvedValue(
      'https://example.com/download',
    );

    await request(app.getHttpServer())
      .get('/api/v1/orders/download/email/valid-token')
      .expect(302)
      .expect('Location', 'https://example.com/download');

    expect(
      orderDeliveryEmailService.resolveSignedDownloadUrl,
    ).toHaveBeenCalledWith('valid-token');
  });

  it('returns bad request when token is invalid', async () => {
    orderDeliveryEmailService.resolveSignedDownloadUrl.mockRejectedValue(
      new BadRequestException('Invalid token'),
    );

    await request(app.getHttpServer())
      .get('/api/v1/orders/download/email/invalid-token')
      .expect(400);
  });
});
