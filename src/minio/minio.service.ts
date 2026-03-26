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
    const shouldInitBuckets =
      this.configService.get<boolean>('minio.initBuckets') ?? true;

    if (!shouldInitBuckets) {
      this.logger.log(
        'Skipping bucket initialization because S3_INIT_BUCKETS=false.',
      );
      return;
    }

    if (!this.hasStorageCredentials()) {
      this.logger.warn(
        'Skipping bucket initialization because S3_ACCESS_KEY or S3_SECRET_KEY is missing.',
      );
      return;
    }

    const buckets = this.getConfiguredBuckets();

    await Promise.all(buckets.map((bucket) => this.ensureBucketExists(bucket)));
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

  async createPresignedGetUrl(
    bucketName: string,
    objectName: string,
    expirySeconds = 3600,
  ): Promise<string> {
    return this.minioClient.presignedGetObject(
      bucketName,
      objectName,
      Math.max(1, Math.floor(expirySeconds)),
    );
  }

  async createPresignedDownloadUrl(
    bucketName: string,
    objectName: string,
    options?: {
      expirySeconds?: number;
      fileName?: string;
      contentType?: string;
    },
  ): Promise<string> {
    const expirySeconds = Math.max(
      1,
      Math.floor(options?.expirySeconds ?? 3600),
    );
    const responseHeaders: Record<string, string> = {};
    const fileName = options?.fileName?.trim();
    if (fileName) {
      const sanitized = this.sanitizeFileName(fileName);
      responseHeaders['response-content-disposition'] =
        `attachment; filename="${sanitized}"; filename*=UTF-8''${encodeURIComponent(sanitized)}`;
    }

    const contentType = options?.contentType?.trim();
    if (contentType) {
      responseHeaders['response-content-type'] = contentType;
    }

    return this.minioClient.presignedGetObject(
      bucketName,
      objectName,
      expirySeconds,
      Object.keys(responseHeaders).length ? responseHeaders : undefined,
    );
  }

  async objectExists(bucketName: string, objectName: string): Promise<boolean> {
    try {
      await this.minioClient.statObject(bucketName, objectName);
      return true;
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : '';
      if (
        ['NotFound', 'NoSuchKey', 'NoSuchObject', 'NoSuchBucket'].includes(code)
      ) {
        return false;
      }
      throw error;
    }
  }

  async removeObjectByUrl(bucketName: string, fileUrl: string): Promise<void> {
    const objectName = this.extractObjectNameFromUrl(bucketName, fileUrl);
    if (!objectName) {
      return;
    }

    try {
      await this.removeObject(bucketName, objectName);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(
        `Could not remove object "${objectName}" from bucket "${bucketName}". Error: ${errorMessage}`,
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

  private hasStorageCredentials(): boolean {
    const accessKey =
      this.configService.get<string>('minio.accessKey')?.trim() ?? '';
    const secretKey =
      this.configService.get<string>('minio.secretKey')?.trim() ?? '';
    const looksLikePlaceholder = (value: string) => /^<.+>$/.test(value);

    return (
      accessKey.length > 0 &&
      secretKey.length > 0 &&
      !looksLikePlaceholder(accessKey) &&
      !looksLikePlaceholder(secretKey)
    );
  }

  private async ensureBucketExists(bucket: string): Promise<void> {
    try {
      const exists = await this.minioClient.bucketExists(bucket);
      if (exists) {
        return;
      }

      await this.minioClient.makeBucket(
        bucket,
        this.configService.get<string>('minio.region') ?? 'us-east-1',
      );
      this.logger.log(`Created bucket: ${bucket}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(
        `Could not ensure bucket "${bucket}". Continuing startup. Error: ${errorMessage}`,
      );
    }
  }

  private getConfiguredBuckets(): string[] {
    return [...new Set(Object.values(this.getBucketsMap()).filter(Boolean))];
  }

  private sanitizeFileName(input: string): string {
    const sanitized = input.replace(/[\r\n"]/g, '').trim();
    return sanitized || 'download.bin';
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
