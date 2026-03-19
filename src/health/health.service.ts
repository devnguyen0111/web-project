import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { OpsAlertService } from '../alerts/ops-alert.service';

type HealthStatus = 'ok' | 'degraded';

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService,
    @Optional() private readonly opsAlertService?: OpsAlertService,
  ) {}

  getLiveness() {
    return {
      status: 'ok' as const,
      service: 'web-project-api',
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness(): Promise<{
    status: HealthStatus;
    service: string;
    timestamp: string;
    checks: {
      mongodb: HealthStatus;
      payosConfig: HealthStatus;
      appConfig: HealthStatus;
    };
  }> {
    const checks = {
      mongodb: await this.checkMongo(),
      payosConfig: this.checkPayosConfig(),
      appConfig: this.checkAppConfig(),
    };

    const status: HealthStatus = Object.values(checks).every((item) => item === 'ok')
      ? 'ok'
      : 'degraded';

    this.opsAlertService?.recordHealthReadiness(status, checks);

    return {
      status,
      service: 'web-project-api',
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private async checkMongo(): Promise<HealthStatus> {
    try {
      const db = this.connection.db;
      if (!db) {
        return 'degraded';
      }
      await db.admin().command({ ping: 1 });
      return 'ok';
    } catch {
      return 'degraded';
    }
  }

  private checkPayosConfig(): HealthStatus {
    const clientId = this.configService
      .get<string>('wallet.providers.payos.clientId')
      ?.trim();
    const apiKey = this.configService
      .get<string>('wallet.providers.payos.apiKey')
      ?.trim();
    const checksumKey = this.configService
      .get<string>('wallet.providers.payos.checksumKey')
      ?.trim();
    const returnUrl = this.configService
      .get<string>('wallet.providers.payos.returnUrl')
      ?.trim();
    const cancelUrl = this.configService
      .get<string>('wallet.providers.payos.cancelUrl')
      ?.trim();
    const webhookUrl = this.configService
      .get<string>('wallet.providers.payos.webhookUrl')
      ?.trim();

    return clientId &&
      apiKey &&
      checksumKey &&
      returnUrl &&
      cancelUrl &&
      webhookUrl
      ? 'ok'
      : 'degraded';
  }

  private checkAppConfig(): HealthStatus {
    const mongoUri = this.configService.get<string>('database.uri')?.trim();
    const jwtAccessSecret = this.configService.get<string>('jwt.accessSecret')?.trim();
    const jwtRefreshSecret = this.configService
      .get<string>('jwt.refreshSecret')
      ?.trim();
    const apiPrefix = this.configService.get<string>('app.apiPrefix')?.trim();

    return mongoUri && jwtAccessSecret && jwtRefreshSecret && apiPrefix
      ? 'ok'
      : 'degraded';
  }
}
