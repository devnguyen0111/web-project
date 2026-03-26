import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { MailService } from '../../mail/mail.service';
import { MinioService } from '../../minio/minio.service';
import { User } from '../../users/schemas/user.schema';
import { Order, OrderDocument, OrderStatus } from './schemas/order.schema';

type DeliveryEmailLogStatus = 'pending' | 'sent';

export interface OrderDeliveryEmailTokenPayload {
  orderId: string;
  buyerId: string;
  fileId?: string;
  exp: number;
}

export interface OrderReceiptViewModel {
  orderNumber: string;
  orderStatus: string;
  paidAt?: Date;
  deliveredAt?: Date;
  subtotal: number;
  discountTotal: number;
  total: number;
  currency: string;
  transactionId?: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
}

@Injectable()
export class OrderDeliveryEmailService {
  private readonly logger = new Logger(OrderDeliveryEmailService.name);

  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<Order>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private readonly minioService: MinioService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async dispatchDeliveryEmail(orderId: string, fileObjectName: string) {
    if (!this.isDeliveryEmailEnabled()) {
      return;
    }

    if (!Types.ObjectId.isValid(orderId) || !fileObjectName?.trim()) {
      return;
    }

    const claimed = await this.claimDeliveryEmail(orderId, fileObjectName);
    if (!claimed) {
      return;
    }

    try {
      const order = await this.orderModel.findById(orderId).exec();
      if (!order) {
        throw new NotFoundException('Order not found for delivery email');
      }
      if (
        ![OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(order.status)
      ) {
        throw new BadRequestException(
          'Order is not delivered for delivery email',
        );
      }

      const file = this.resolveDeliveryFile(order, fileObjectName);
      if (!file) {
        throw new NotFoundException(
          'Delivery file not found for delivery email',
        );
      }

      const objectExists = await this.minioService.objectExists(
        file.bucketName,
        file.objectName,
      );
      if (!objectExists) {
        throw new NotFoundException(
          'Delivery file object is missing in storage',
        );
      }

      const buyer = await this.userModel
        .findById(order.buyerId)
        .select({ email: 1, fullName: 1 })
        .lean<{ _id: Types.ObjectId; email?: string; fullName?: string }>()
        .exec();
      if (!buyer?.email) {
        throw new NotFoundException('Order buyer email is not available');
      }

      const tokenTtl = this.getEmailDownloadTokenTtlSeconds();
      const nowSeconds = Math.floor(Date.now() / 1000);
      const token = this.signEmailDownloadToken({
        orderId: order.id,
        buyerId: order.buyerId.toString(),
        fileId: file._id?.toString(),
        exp: nowSeconds + tokenTtl,
      });
      const downloadUrl = this.buildEmailDownloadUrl(token);
      const receipt = this.buildReceipt(order);

      await this.mailService.sendOrderDeliveryReceipt(buyer.email, {
        buyerName: buyer.fullName,
        orderNumber: receipt.orderNumber,
        orderStatus: receipt.orderStatus,
        paidAt: receipt.paidAt,
        deliveredAt: receipt.deliveredAt,
        subtotal: receipt.subtotal,
        discountTotal: receipt.discountTotal,
        total: receipt.total,
        currency: receipt.currency,
        transactionId: receipt.transactionId,
        downloadUrl,
        downloadExpiresAt: new Date((nowSeconds + tokenTtl) * 1000),
        supportEmail:
          this.configService.get<string>('mail.from') ?? 'no-reply@example.com',
        note: 'Use the download link in this email to access your delivered file.',
        items: receipt.items,
      });

      await this.markDeliveryEmailSent(orderId, fileObjectName);
    } catch (error) {
      await this.releaseDeliveryEmailClaim(orderId, fileObjectName).catch(
        () => undefined,
      );
      this.logger.warn(
        `Delivery email dispatch failed for order=${orderId} file=${fileObjectName}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  async resolveSignedDownloadUrl(token: string): Promise<string> {
    const payload = this.verifyEmailDownloadToken(token);
    const order = await this.orderModel.findById(payload.orderId).exec();
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (
      ![OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(order.status)
    ) {
      throw new BadRequestException('Order has not been delivered yet');
    }

    if (order.buyerId.toString() !== payload.buyerId) {
      throw new BadRequestException(
        'Download token is not valid for this order',
      );
    }

    const file = this.resolveDeliveryFile(order, undefined, payload.fileId);
    if (!file) {
      throw new NotFoundException('Delivery file not found');
    }

    const objectExists = await this.minioService.objectExists(
      file.bucketName,
      file.objectName,
    );
    if (!objectExists) {
      throw new NotFoundException('Delivery file object is missing in storage');
    }

    const ttl =
      this.configService.get<number>('store.downloadUrlTtlSeconds') ?? 3600;
    return this.minioService.createPresignedDownloadUrl(
      file.bucketName,
      file.objectName,
      {
        expirySeconds: ttl,
        fileName: file.fileName,
        contentType: file.mimeType,
      },
    );
  }

  private buildReceipt(order: OrderDocument): OrderReceiptViewModel {
    return {
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      paidAt: order.paidAt,
      deliveredAt: order.deliveredAt,
      subtotal: order.subtotal,
      discountTotal: order.discountTotal,
      total: order.total,
      currency: order.currency,
      transactionId:
        order.buyerTransactionId?.toString() ?? order.transactionId?.toString(),
      items: order.items.map((item) => ({
        name: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      })),
    };
  }

  private resolveDeliveryFile(
    order: OrderDocument,
    fileObjectName?: string,
    fileId?: string,
  ) {
    const files = Array.isArray(order.deliveryFiles) ? order.deliveryFiles : [];
    if (!files.length) {
      return undefined;
    }

    if (fileObjectName) {
      return files.find((entry) => entry.objectName === fileObjectName);
    }

    if (fileId) {
      return files.find((entry) => entry._id?.toString() === fileId);
    }

    return files[files.length - 1];
  }

  private async claimDeliveryEmail(
    orderId: string,
    fileObjectName: string,
  ): Promise<boolean> {
    const result = await this.orderModel
      .updateOne(
        {
          _id: new Types.ObjectId(orderId),
          'deliveryEmailLogs.fileObjectName': { $ne: fileObjectName },
        },
        {
          $push: {
            deliveryEmailLogs: {
              fileObjectName,
              status: 'pending' as DeliveryEmailLogStatus,
              claimedAt: new Date(),
            },
          },
        },
      )
      .exec();

    return Boolean(result.modifiedCount);
  }

  private async markDeliveryEmailSent(orderId: string, fileObjectName: string) {
    await this.orderModel
      .updateOne(
        {
          _id: new Types.ObjectId(orderId),
          'deliveryEmailLogs.fileObjectName': fileObjectName,
          'deliveryEmailLogs.status': 'pending',
        },
        {
          $set: {
            'deliveryEmailLogs.$.status': 'sent',
            'deliveryEmailLogs.$.sentAt': new Date(),
          },
        },
      )
      .exec();
  }

  private async releaseDeliveryEmailClaim(
    orderId: string,
    fileObjectName: string,
  ) {
    await this.orderModel
      .updateOne(
        { _id: new Types.ObjectId(orderId) },
        {
          $pull: {
            deliveryEmailLogs: {
              fileObjectName,
              status: 'pending',
            },
          },
        },
      )
      .exec();
  }

  private signEmailDownloadToken(
    payload: OrderDeliveryEmailTokenPayload,
  ): string {
    const payloadPart = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const signature = this.sign(payloadPart);
    return `${payloadPart}.${signature}`;
  }

  private verifyEmailDownloadToken(
    token: string,
  ): OrderDeliveryEmailTokenPayload {
    const [payloadPart, signaturePart] = token.split('.');
    if (!payloadPart || !signaturePart) {
      throw new BadRequestException('Invalid download token format');
    }

    const expectedSignature = this.sign(payloadPart);
    const expectedBuffer = Buffer.from(expectedSignature);
    const receivedBuffer = Buffer.from(signaturePart);
    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new BadRequestException('Invalid download token signature');
    }

    let parsed: OrderDeliveryEmailTokenPayload;
    try {
      const decoded = Buffer.from(payloadPart, 'base64url').toString('utf8');
      parsed = JSON.parse(decoded) as OrderDeliveryEmailTokenPayload;
    } catch {
      throw new BadRequestException('Invalid download token payload');
    }

    if (
      !parsed ||
      !Types.ObjectId.isValid(parsed.orderId) ||
      !Types.ObjectId.isValid(parsed.buyerId) ||
      !Number.isFinite(parsed.exp)
    ) {
      throw new BadRequestException('Invalid download token payload');
    }

    if (parsed.fileId && !Types.ObjectId.isValid(parsed.fileId)) {
      throw new BadRequestException('Invalid download token payload');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.floor(parsed.exp) <= nowSeconds) {
      throw new BadRequestException('Download token has expired');
    }

    return {
      orderId: parsed.orderId,
      buyerId: parsed.buyerId,
      fileId: parsed.fileId,
      exp: Math.floor(parsed.exp),
    };
  }

  private sign(payloadPart: string): string {
    const secret = this.getEmailDownloadTokenSecret();
    return createHmac('sha256', secret).update(payloadPart).digest('base64url');
  }

  private getEmailDownloadTokenSecret(): string {
    const configured =
      this.configService
        .get<string>('store.emailDownloadTokenSecret')
        ?.trim() ?? '';
    if (configured) {
      return configured;
    }

    const fallback =
      this.configService.get<string>('jwt.accessTokenSecret')?.trim() ?? '';
    if (fallback) {
      return fallback;
    }

    throw new InternalServerErrorException(
      'STORE_EMAIL_DOWNLOAD_TOKEN_SECRET is missing',
    );
  }

  private getEmailDownloadTokenTtlSeconds(): number {
    return (
      this.configService.get<number>('store.emailDownloadTokenTtlSeconds') ??
      604800
    );
  }

  private buildEmailDownloadUrl(token: string): string {
    const apiPrefix =
      this.configService
        .get<string>('app.apiPrefix')
        ?.replace(/^\/+|\/+$/g, '') ?? 'api/v1';
    const configuredBase =
      this.configService.get<string>('app.publicBaseUrl')?.trim() ?? '';
    const port = this.configService.get<number>('app.port') ?? 3000;
    const base = configuredBase || `http://localhost:${port}`;
    return `${base.replace(/\/+$/, '')}/${apiPrefix}/orders/download/email/${encodeURIComponent(token)}`;
  }

  private isDeliveryEmailEnabled(): boolean {
    return (
      this.configService.get<boolean>('store.deliveryEmailEnabled') ?? true
    );
  }
}
