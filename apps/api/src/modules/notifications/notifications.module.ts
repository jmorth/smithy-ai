import { Module } from '@nestjs/common';
import { EmailService } from './channels/email.service';
import { InAppService } from './channels/in-app.service';
import { WebhookService } from './channels/webhook.service';

@Module({
  providers: [EmailService, InAppService, WebhookService],
  exports: [EmailService, InAppService, WebhookService],
})
export class NotificationsModule {}
