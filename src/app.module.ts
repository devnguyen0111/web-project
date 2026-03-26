import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { MongoExceptionFilter } from './common/filters/mongo-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import minioConfig from './config/minio.config';
import mailConfig from './config/mail.config';
import walletConfig from './config/wallet.config';
import storeConfig from './config/store.config';
import twoFactorConfig from './config/two-factor.config';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { BlogModule } from './blog/blog.module';
import { MinioModule } from './minio/minio.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { WalletModule } from './wallet/wallet.module';
import { NotificationsModule } from './notifications/notifications.module';
import { HealthModule } from './health/health.module';
import { ProductsModule } from './store/products/products.module';
import { OrdersModule } from './store/orders/orders.module';
import { ReviewsModule } from './store/reviews/reviews.module';
import { CartModule } from './cart/cart.module';
import { TicketsModule } from './tickets/tickets.module';
import { AdminModule } from './admin/admin.module';
import { GamificationModule } from './gamification/gamification.module';
import { SocialModule } from './social/social.module';
import { WikiModule } from './wiki/wiki.module';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        databaseConfig,
        jwtConfig,
        minioConfig,
        mailConfig,
        walletConfig,
        storeConfig,
        twoFactorConfig,
      ],
    }),
    ScheduleModule.forRoot(),
    MinioModule,
    DatabaseModule,
    SubscriptionsModule,
    WalletModule,
    NotificationsModule,
    HealthModule,
    ProductsModule,
    OrdersModule,
    ReviewsModule,
    CartModule,
    TicketsModule,
    AdminModule,
    GamificationModule,
    SocialModule,
    WikiModule,
    UploadModule,
    UsersModule,
    AuthModule,
    BlogModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_FILTER,
      useClass: MongoExceptionFilter,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
  ],
})
export class AppModule {}
