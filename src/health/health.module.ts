import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [AlertsModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
