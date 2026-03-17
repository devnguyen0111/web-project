import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { MINIO_CLIENT } from './minio.constants';
import { MinioService } from './minio.service';

@Global()
@Module({
  providers: [
    {
      provide: MINIO_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return new Client({
          endPoint: configService.getOrThrow<string>('minio.endpoint'),
          port: configService.getOrThrow<number>('minio.port'),
          useSSL: configService.getOrThrow<boolean>('minio.useSSL'),
          accessKey: configService.getOrThrow<string>('minio.accessKey'),
          secretKey: configService.getOrThrow<string>('minio.secretKey'),
          region: configService.get<string>('minio.region'),
        });
      },
    },
    MinioService,
  ],
  exports: [MINIO_CLIENT, MinioService],
})
export class MinioModule {}
