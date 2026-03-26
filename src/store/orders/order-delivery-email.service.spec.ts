import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { MailService } from '../../mail/mail.service';
import { MinioService } from '../../minio/minio.service';
import { User } from '../../users/schemas/user.schema';
import { OrderDeliveryEmailService } from './order-delivery-email.service';
import { OrderStatus } from './schemas/order.schema';

const buildExecResult = <T>(value: T) => ({
  exec: jest.fn().mockResolvedValue(value),
});

describe('OrderDeliveryEmailService', () => {
  let service: OrderDeliveryEmailService;
  let orderModel: {
    updateOne: jest.Mock;
    findById: jest.Mock;
  };
  let userModel: {
    findById: jest.Mock;
  };
  let minioService: {
    objectExists: jest.Mock;
    createPresignedDownloadUrl: jest.Mock;
  };
  let mailService: {
    sendOrderDeliveryReceipt: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };

  beforeEach(() => {
    orderModel = {
      updateOne: jest.fn(),
      findById: jest.fn(),
    };
    userModel = {
      findById: jest.fn(),
    };
    minioService = {
      objectExists: jest.fn().mockResolvedValue(true),
      createPresignedDownloadUrl: jest
        .fn()
        .mockResolvedValue('https://download'),
    };
    mailService = {
      sendOrderDeliveryReceipt: jest.fn().mockResolvedValue(undefined),
    };
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'store.deliveryEmailEnabled') {
          return true;
        }
        if (key === 'store.emailDownloadTokenSecret') {
          return 'delivery-token-secret';
        }
        if (key === 'store.emailDownloadTokenTtlSeconds') {
          return 604800;
        }
        if (key === 'app.apiPrefix') {
          return 'api/v1';
        }
        if (key === 'app.publicBaseUrl') {
          return 'http://localhost:3000';
        }
        if (key === 'store.downloadUrlTtlSeconds') {
          return 3600;
        }
        if (key === 'mail.from') {
          return 'support@example.com';
        }
        return undefined;
      }),
    };

    service = new OrderDeliveryEmailService(
      orderModel as never,
      userModel as never,
      minioService as unknown as MinioService,
      mailService as unknown as MailService,
      configService as unknown as ConfigService,
    );
  });

  it('dispatches delivery email once for a new delivery file marker', async () => {
    const orderId = new Types.ObjectId().toString();
    const buyerId = new Types.ObjectId().toString();
    const fileId = new Types.ObjectId().toString();
    const objectName = 'orders/abc/file.zip';

    const orderDoc = {
      _id: new Types.ObjectId(orderId),
      id: orderId,
      orderNumber: 'ORD-20260324-ABC123',
      buyerId: new Types.ObjectId(buyerId),
      status: OrderStatus.DELIVERED,
      subtotal: 100000,
      discountTotal: 0,
      total: 100000,
      currency: 'VND',
      paidAt: new Date('2026-03-24T10:00:00.000Z'),
      deliveredAt: new Date('2026-03-24T10:05:00.000Z'),
      buyerTransactionId: new Types.ObjectId(),
      transactionId: undefined,
      items: [
        {
          productName: 'Digital Asset',
          quantity: 1,
          unitPrice: 100000,
          lineTotal: 100000,
        },
      ],
      deliveryFiles: [
        {
          _id: new Types.ObjectId(fileId),
          bucketName: 'products',
          objectName,
          fileName: 'asset.zip',
          mimeType: 'application/zip',
        },
      ],
    };

    orderModel.updateOne
      .mockReturnValueOnce(buildExecResult({ modifiedCount: 1 }))
      .mockReturnValueOnce(buildExecResult({ modifiedCount: 1 }));
    orderModel.findById.mockReturnValue(buildExecResult(orderDoc));
    userModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(buyerId),
        email: 'buyer@example.com',
        fullName: 'Buyer Name',
      } as Partial<User>),
    });

    await service.dispatchDeliveryEmail(orderId, objectName);

    expect(mailService.sendOrderDeliveryReceipt).toHaveBeenCalledTimes(1);
    expect(orderModel.updateOne).toHaveBeenCalledTimes(2);
  });

  it('skips dispatch when marker was already claimed/sent', async () => {
    const orderId = new Types.ObjectId().toString();
    const objectName = 'orders/abc/existing.zip';

    orderModel.updateOne.mockReturnValue(buildExecResult({ modifiedCount: 0 }));

    await service.dispatchDeliveryEmail(orderId, objectName);

    expect(orderModel.findById).not.toHaveBeenCalled();
    expect(mailService.sendOrderDeliveryReceipt).not.toHaveBeenCalled();
  });

  it('resolves signed gateway token to a presigned download url', async () => {
    const orderId = new Types.ObjectId().toString();
    const buyerId = new Types.ObjectId().toString();
    const fileId = new Types.ObjectId().toString();

    const token = (
      service as {
        signEmailDownloadToken: (payload: {
          orderId: string;
          buyerId: string;
          fileId: string;
          exp: number;
        }) => string;
      }
    ).signEmailDownloadToken({
      orderId,
      buyerId,
      fileId,
      exp: Math.floor(Date.now() / 1000) + 600,
    });

    orderModel.findById.mockReturnValue(
      buildExecResult({
        _id: new Types.ObjectId(orderId),
        id: orderId,
        buyerId: new Types.ObjectId(buyerId),
        status: OrderStatus.DELIVERED,
        deliveryFiles: [
          {
            _id: new Types.ObjectId(fileId),
            bucketName: 'products',
            objectName: 'orders/abc/file.zip',
            fileName: 'file.zip',
            mimeType: 'application/zip',
          },
        ],
      }),
    );

    const downloadUrl = await service.resolveSignedDownloadUrl(token);

    expect(downloadUrl).toBe('https://download');
    expect(minioService.createPresignedDownloadUrl).toHaveBeenCalledWith(
      'products',
      'orders/abc/file.zip',
      expect.objectContaining({
        fileName: 'file.zip',
      }),
    );
  });

  it('rejects tampered signed token', async () => {
    const orderId = new Types.ObjectId().toString();
    const buyerId = new Types.ObjectId().toString();
    const fileId = new Types.ObjectId().toString();

    const token = (
      service as {
        signEmailDownloadToken: (payload: {
          orderId: string;
          buyerId: string;
          fileId: string;
          exp: number;
        }) => string;
      }
    ).signEmailDownloadToken({
      orderId,
      buyerId,
      fileId,
      exp: Math.floor(Date.now() / 1000) + 600,
    });

    const tampered = `${token}tampered`;

    await expect(
      service.resolveSignedDownloadUrl(tampered),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
