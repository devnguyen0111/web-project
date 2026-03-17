/* eslint-disable @typescript-eslint/no-unused-vars */
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MINIO_CLIENT } from './minio.constants';

type UploadFileLike = {
  buffer: Buffer;
  size: number;
  mimetype?: string;
  originalname?: string;
};

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);

  constructor(
    @Inject(MINIO_CLIENT) private readonly minioClient: Client,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const buckets = this.getConfiguredBuckets();

    await Promise.all(
      buckets.map(async (bucket) => {
        const exists = await this.minioClient.bucketExists(bucket);
        if (!exists) {
          await this.minioClient.makeBucket(
            bucket,
            this.configService.get<string>('minio.region') ?? 'us-east-1',
          );
          this.logger.log(`Created bucket: ${bucket}`);
        }
      }),
    );
  }

  async uploadFile(
    bucketName: string,
    file: UploadFileLike,
    folder = '',
  ): Promise<{
    bucketName: string;
    objectName: string;
    etag: string;
    url: string;
  }> {
    const extension = extname(file.originalname ?? '').toLowerCase();
    const objectName = [folder, `${Date.now()}-${randomUUID()}${extension}`]
      .filter(Boolean)
      .join('/');

    const metadata = file.mimetype
      ? { 'Content-Type': file.mimetype }
      : undefined;

    const uploadResult = await this.minioClient.putObject(
      bucketName,
      objectName,
      file.buffer,
      file.size,
      metadata,
    );

    return {
      bucketName,
      objectName,
      etag: uploadResult.etag,
      url: this.getPublicUrl(bucketName, objectName),
    };
  }

  async removeObject(bucketName: string, objectName: string): Promise<void> {
    await this.minioClient.removeObject(bucketName, objectName);
  }

  async removeObjectByUrl(bucketName: string, fileUrl: string): Promise<void> {
    const objectName = this.extractObjectNameFromUrl(bucketName, fileUrl);
    if (!objectName) {
      return;
    }

    try {
      await this.removeObject(bucketName, objectName);
    } catch (error) {
      this.logger.warn(
        `Could not remove object "${objectName}" from bucket "${bucketName}".`,
      );
    }
  }

  getPublicUrl(bucketName: string, objectName: string): string {
    const configuredPublicUrl =
      this.configService.get<string>('minio.publicUrl')?.trim() ?? '';

    if (configuredPublicUrl) {
      return `${configuredPublicUrl.replace(/\/$/, '')}/${bucketName}/${objectName}`;
    }

    const endpoint = this.configService.getOrThrow<string>('minio.endpoint');
    const port = this.configService.getOrThrow<number>('minio.port');
    const useSSL = this.configService.getOrThrow<boolean>('minio.useSSL');
    const protocol = useSSL ? 'https' : 'http';

    return `${protocol}://${endpoint}:${port}/${bucketName}/${objectName}`;
  }

  getBucket(
    bucketKey: keyof ReturnType<MinioService['getBucketsMap']>,
  ): string {
    return this.getBucketsMap()[bucketKey];
  }

  private getConfiguredBuckets(): string[] {
    return [...new Set(Object.values(this.getBucketsMap()).filter(Boolean))];
  }

  private extractObjectNameFromUrl(
    bucketName: string,
    fileUrl: string,
  ): string | null {
    try {
      const parsedUrl = new URL(fileUrl);
      const normalizedPath = parsedUrl.pathname.replace(/^\/+/, '');
      const bucketSegment = `${bucketName}/`;
      const bucketIndex = normalizedPath.indexOf(bucketSegment);

      if (bucketIndex < 0) {
        return null;
      }

      const objectName = normalizedPath
        .slice(bucketIndex + bucketSegment.length)
        .trim();

      return objectName ? decodeURIComponent(objectName) : null;
    } catch {
      return null;
    }
  }

  private getBucketsMap() {
    return {
      blogImages:
        this.configService.get<string>('minio.buckets.blogImages') ??
        'blog-images',
      avatars:
        this.configService.get<string>('minio.buckets.avatars') ?? 'avatars',
      public:
        this.configService.get<string>('minio.buckets.public') ?? 'public',
      products:
        this.configService.get<string>('minio.buckets.products') ?? 'products',
      tickets:
        this.configService.get<string>('minio.buckets.tickets') ?? 'tickets',
    } as const;
  }
}
