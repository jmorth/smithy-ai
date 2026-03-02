import { Module } from '@nestjs/common';
import { EmailService } from './channels/email.service';
import { InAppService } from './channels/in-app.service';
import { WebhookService } from './channels/webhook.service';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

@Module({
  controllers: [NotificationsController],
  providers: [EmailService, InAppService, WebhookService, NotificationsService],
  exports: [EmailService, InAppService, WebhookService, NotificationsService],
})
export class NotificationsModule {}
