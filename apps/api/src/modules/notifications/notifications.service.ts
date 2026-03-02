import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from './channels/email.service';
import { InAppService, NotificationType } from './channels/in-app.service';
import { WebhookService } from './channels/webhook.service';

export interface DomainEvent {
  eventType: string;
  payload: Record<string, unknown>;
  recipientId?: string;
  recipientEmail?: string;
}

export type ChannelName = 'email' | 'in-app' | 'webhook';

export interface ChannelRouting {
  channels: ChannelName[];
  notificationType?: NotificationType;
}

const EVENT_CHANNEL_MAP: Record<string, ChannelRouting> = {
  'assembly-line.completed': {
    channels: ['email', 'in-app', 'webhook'],
    notificationType: NotificationType.ASSEMBLY_LINE_COMPLETED,
  },
  'assembly-line.step.completed': {
    channels: ['in-app'],
    notificationType: NotificationType.ASSEMBLY_LINE_STEP_COMPLETED,
  },
  'job.error': {
    channels: ['email', 'in-app'],
    notificationType: NotificationType.JOB_ERROR,
  },
  'job.stuck': {
    channels: ['in-app'],
    notificationType: NotificationType.JOB_STUCK,
  },
  'package.created': {
    channels: ['in-app'],
    notificationType: NotificationType.PACKAGE_CREATED,
  },
  'package.processed': {
    channels: ['in-app', 'webhook'],
    notificationType: NotificationType.PACKAGE_PROCESSED,
  },
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly inAppService: InAppService,
    private readonly webhookService: WebhookService,
  ) {}

  async notify(event: DomainEvent): Promise<void> {
    const routing = this.getRoutingForEvent(event.eventType);

    if (!routing) {
      this.logger.debug(
        `No channel routing configured for event type: ${event.eventType}`,
      );
      return;
    }

    const channelPromises: Promise<void>[] = [];

    for (const channel of routing.channels) {
      switch (channel) {
        case 'email':
          if (event.recipientEmail) {
            channelPromises.push(this.sendEmail(event));
          }
          break;
        case 'in-app':
          if (event.recipientId && routing.notificationType) {
            channelPromises.push(
              this.sendInApp(event, routing.notificationType),
            );
          }
          break;
        case 'webhook':
          if (event.recipientId) {
            channelPromises.push(this.sendWebhook(event));
          }
          break;
      }
    }

    const results = await Promise.allSettled(channelPromises);

    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.error(
          `Notification channel failed for event ${event.eventType}: ${result.reason}`,
        );
      }
    }
  }

  getRoutingForEvent(eventType: string): ChannelRouting | undefined {
    return EVENT_CHANNEL_MAP[eventType];
  }

  getChannelMap(): Record<string, ChannelRouting> {
    return { ...EVENT_CHANNEL_MAP };
  }

  private async sendEmail(event: DomainEvent): Promise<void> {
    const recipient = event.recipientEmail!;

    switch (event.eventType) {
      case 'assembly-line.completed':
        await this.emailService.sendAssemblyLineCompleted(recipient, {
          assemblyLineName:
            (event.payload['assemblyLineName'] as string) ?? 'Unknown',
          totalDuration:
            (event.payload['totalDuration'] as string) ?? 'Unknown',
          stepsCompleted:
            (event.payload['stepsCompleted'] as number) ?? 0,
          outputSummary:
            (event.payload['outputSummary'] as string) ?? '',
        });
        break;
      case 'job.error':
        await this.emailService.sendWorkerError(recipient, {
          workerName:
            (event.payload['workerName'] as string) ?? 'Unknown',
          errorMessage:
            (event.payload['errorMessage'] as string) ?? 'Unknown error',
          lastLogLines:
            (event.payload['lastLogLines'] as string[]) ?? [],
          jobId: (event.payload['jobId'] as string) ?? '',
        });
        break;
      default:
        await this.emailService.sendRaw(
          recipient,
          `Smithy notification: ${event.eventType}`,
          `<p>Event: ${event.eventType}</p><pre>${JSON.stringify(event.payload, null, 2)}</pre>`,
        );
    }
  }

  private async sendInApp(
    event: DomainEvent,
    notificationType: NotificationType,
  ): Promise<void> {
    await this.inAppService.createNotification(
      notificationType,
      event.payload,
      event.recipientId!,
    );
  }

  private async sendWebhook(event: DomainEvent): Promise<void> {
    const endpoints = await this.webhookService.listEndpoints(
      event.recipientId!,
    );

    const deliveries = endpoints
      .filter((ep) => ep.events.includes(event.eventType))
      .map((ep) =>
        this.webhookService.deliverWebhook(ep.id, {
          event: event.eventType,
          payload: event.payload,
        }),
      );

    await Promise.allSettled(deliveries);
  }
}
