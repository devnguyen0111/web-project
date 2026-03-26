import { Injectable } from '@nestjs/common';
import { MinioService } from '../minio/minio.service';

type UploadableFile = {
  buffer: Buffer;
  size: number;
  mimetype?: string;
  originalname?: string;
};

@Injectable()
export class UploadService {
  constructor(private readonly minioService: MinioService) {}

  uploadImage(file: UploadableFile) {
    const bucketName = this.minioService.getBucket('blogImages');
    return this.upload(bucketName, file, 'uploads/images');
  }

  uploadFile(file: UploadableFile) {
    const bucketName = this.minioService.getBucket('products');
    return this.upload(bucketName, file, 'uploads/files');
  }

  uploadAttachment(file: UploadableFile) {
    const bucketName = this.minioService.getBucket('tickets');
    return this.upload(bucketName, file, 'uploads/attachments');
  }

  private async upload(bucketName: string, file: UploadableFile, folder: string) {
    const upload = await this.minioService.uploadFile(bucketName, file, folder);
    return {
      bucketName: upload.bucketName,
      objectName: upload.objectName,
      url: upload.url,
      fileName: file.originalname?.trim() || 'upload.bin',
      mimeType: file.mimetype,
      size: file.size,
      etag: upload.etag,
      uploadedAt: new Date(),
    };
  }
}

