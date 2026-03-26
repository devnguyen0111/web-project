import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { SocketIoAdapter } from './common/adapters/socket-io.adapter';

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buildPrefixedPath = (apiPrefix: string, route: string) =>
  `/${apiPrefix.replace(/^\/+|\/+$/g, '')}/${route.replace(/^\/+/, '')}`;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const apiPrefix =
    configService
      .get<string>('app.apiPrefix')
      ?.trim()
      .replace(/^\/+|\/+$/g, '') || 'api/v1';
  const port = configService.get<number>('app.port') ?? 3000;

  app.setGlobalPrefix(apiPrefix);

  const securityHeadersEnabled =
    configService.get<boolean>('app.securityHeadersEnabled') ?? true;
  if (securityHeadersEnabled) {
    app.use((_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('X-DNS-Prefetch-Control', 'off');
      res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
      next();
    });
  }

  const corsOrigins = configService.get<string[]>('app.corsOrigins') ?? [];
  const corsCredentials =
    configService.get<boolean>('app.corsCredentials') ?? true;
  app.enableCors({
    credentials: corsCredentials,
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (corsOrigins.includes('*') || corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
  });
  app.useWebSocketAdapter(
    new SocketIoAdapter(app, corsOrigins, corsCredentials),
  );

  const authPaymentRateLimitEnabled =
    configService.get<boolean>('app.authPaymentRateLimitEnabled') ?? true;
  if (authPaymentRateLimitEnabled) {
    const windowMs =
      configService.get<number>('app.authPaymentRateLimitWindowMs') ?? 60000;
    const maxRequests =
      configService.get<number>('app.authPaymentRateLimitMax') ?? 120;
    const buckets = new Map<string, RateLimitBucket>();
    const authPrefix = buildPrefixedPath(apiPrefix, 'auth');
    const paymentPrefix = buildPrefixedPath(apiPrefix, 'payment');

    app.use((req: Request, res: Response, next: NextFunction) => {
      const path = req.path || req.url || '';
      if (!path.startsWith(authPrefix) && !path.startsWith(paymentPrefix)) {
        next();
        return;
      }

      const now = Date.now();
      const key = `${req.ip}:${path}`;
      const existing = buckets.get(key);

      if (!existing || existing.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        next();
        return;
      }

      if (existing.count >= maxRequests) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((existing.resetAt - now) / 1000),
        );
        res.setHeader('Retry-After', String(retryAfterSeconds));
        res.status(429).json({
          success: false,
          message: 'Too many requests, please try again later.',
        });
        return;
      }

      existing.count += 1;
      buckets.set(key, existing);

      if (buckets.size > 5000) {
        for (const [bucketKey, bucket] of buckets.entries()) {
          if (bucket.resetAt <= now) {
            buckets.delete(bucketKey);
          }
        }
      }

      next();
    });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerEnabled =
    configService.get<boolean>('app.swaggerEnabled') ?? true;
  if (swaggerEnabled) {
    const swaggerPath = configService.get<string>('app.swaggerPath') ?? 'docs';
    const swaggerConfig = new DocumentBuilder()
      .setTitle('DN Web Project API')
      .setDescription(
        'Auth, users, blog, wallet/payment, subscriptions, notifications, store MVP, and cart endpoints',
      )
      .setVersion('0.4.0')
      .addBearerAuth()
      .build();

    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(
      `${apiPrefix}/${swaggerPath.replace(/^\/+|\/+$/g, '')}`,
      app,
      swaggerDocument,
    );
  }

  await app.listen(port);
}
void bootstrap();
