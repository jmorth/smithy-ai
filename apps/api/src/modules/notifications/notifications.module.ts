import { Module } from '@nestjs/common';
import { EmailService } from './channels/email.service';
import { InAppService } from './channels/in-app.service';

@Module({
  providers: [EmailService, InAppService],
  exports: [EmailService, InAppService],
})
export class NotificationsModule {}
