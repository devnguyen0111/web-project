import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { OpsAlertService } from './ops-alert.service';

@Module({
  imports: [MailModule],
  providers: [OpsAlertService],
  exports: [OpsAlertService],
})
export class AlertsModule {}
