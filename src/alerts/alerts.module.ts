import { Module } from '@nestjs/common';
import { OpsAlertService } from './ops-alert.service';

@Module({
  providers: [OpsAlertService],
  exports: [OpsAlertService],
})
export class AlertsModule {}
