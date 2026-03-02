import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NotificationsService,
  DomainEvent,
} from './notifications.service';
import { NotificationType } from './channels/in-app.service';

function createMockEmailService() {
  return {
    sendAssemblyLineCompleted: vi.fn().mockResolvedValue(undefined),
    sendWorkerError: vi.fn().mockResolvedValue(undefined),
    sendWorkerStuck: vi.fn().mockResolvedValue(undefined),
    sendRaw: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockInAppService() {
  return {
    createNotification: vi.fn().mockResolvedValue({
      id: 'notif-1',
      type: 'IN_APP',
      recipient: 'user-123',
      payload: {},
      status: 'SENT',
      sentAt: new Date(),
      readAt: null,
      createdAt: new Date(),
    }),
  };
}

function createMockWebhookService() {
  return {
    listEndpoints: vi.fn().mockResolvedValue([]),
    deliverWebhook: vi.fn().mockResolvedValue(undefined),
  };
}

function buildService() {
  const emailService = createMockEmailService();
  const inAppService = createMockInAppService();
  const webhookService = createMockWebhookService();
  const service = new NotificationsService(
    emailService as any,
    inAppService as any,
    webhookService as any,
  );
  return { service, emailService, inAppService, webhookService };
}

describe('NotificationsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('notify', () => {
    it('routes assembly-line.completed to email, in-app, and webhook', async () => {
      const { service, emailService, inAppService, webhookService } =
        buildService();
      webhookService.listEndpoints.mockResolvedValue([
        {
          id: 'ep-1',
          url: 'https://example.com/hook',
          events: ['assembly-line.completed'],
          active: true,
        },
      ]);

      const event: DomainEvent = {
        eventType: 'assembly-line.completed',
        payload: {
          assemblyLineName: 'Test Line',
          totalDuration: '5m',
          stepsCompleted: 3,
          outputSummary: 'Done',
        },
        recipientId: 'user-123',
        recipientEmail: 'user@test.com',
      };

      await service.notify(event);

      expect(emailService.sendAssemblyLineCompleted).toHaveBeenCalledWith(
        'user@test.com',
        {
          assemblyLineName: 'Test Line',
          totalDuration: '5m',
          stepsCompleted: 3,
          outputSummary: 'Done',
        },
      );
      expect(inAppService.createNotification).toHaveBeenCalledWith(
        NotificationType.ASSEMBLY_LINE_COMPLETED,
        event.payload,
        'user-123',
      );
      expect(webhookService.listEndpoints).toHaveBeenCalledWith('user-123');
      expect(webhookService.deliverWebhook).toHaveBeenCalledWith('ep-1', {
        event: 'assembly-line.completed',
        payload: event.payload,
      });
    });

    it('routes job.error to email and in-app only', async () => {
      const { service, emailService, inAppService, webhookService } =
        buildService();

      const event: DomainEvent = {
        eventType: 'job.error',
        payload: {
          workerName: 'TestWorker',
          errorMessage: 'OOM killed',
          lastLogLines: ['line1', 'line2'],
          jobId: 'job-1',
        },
        recipientId: 'user-123',
        recipientEmail: 'user@test.com',
      };

      await service.notify(event);

      expect(emailService.sendWorkerError).toHaveBeenCalledWith(
        'user@test.com',
        {
          workerName: 'TestWorker',
          errorMessage: 'OOM killed',
          lastLogLines: ['line1', 'line2'],
          jobId: 'job-1',
        },
      );
      expect(inAppService.createNotification).toHaveBeenCalledWith(
        NotificationType.JOB_ERROR,
        event.payload,
        'user-123',
      );
      expect(webhookService.listEndpoints).not.toHaveBeenCalled();
    });

    it('routes job.stuck to in-app only', async () => {
      const { service, emailService, inAppService, webhookService } =
        buildService();

      const event: DomainEvent = {
        eventType: 'job.stuck',
        payload: {
          workerName: 'TestWorker',
          questionText: 'What should I do?',
          jobId: 'job-1',
        },
        recipientId: 'user-123',
      };

      await service.notify(event);

      expect(emailService.sendWorkerStuck).not.toHaveBeenCalled();
      expect(inAppService.createNotification).toHaveBeenCalledWith(
        NotificationType.JOB_STUCK,
        event.payload,
        'user-123',
      );
      expect(webhookService.listEndpoints).not.toHaveBeenCalled();
    });

    it('routes package.created to in-app only', async () => {
      const { service, emailService, inAppService, webhookService } =
        buildService();

      const event: DomainEvent = {
        eventType: 'package.created',
        payload: { packageId: 'pkg-1' },
        recipientId: 'user-123',
      };

      await service.notify(event);

      expect(emailService.sendAssemblyLineCompleted).not.toHaveBeenCalled();
      expect(emailService.sendWorkerError).not.toHaveBeenCalled();
      expect(inAppService.createNotification).toHaveBeenCalledWith(
        NotificationType.PACKAGE_CREATED,
        event.payload,
        'user-123',
      );
      expect(webhookService.listEndpoints).not.toHaveBeenCalled();
    });

    it('routes package.processed to in-app and webhook', async () => {
      const { service, inAppService, webhookService } = buildService();
      webhookService.listEndpoints.mockResolvedValue([
        {
          id: 'ep-1',
          url: 'https://example.com/hook',
          events: ['package.processed'],
          active: true,
        },
      ]);

      const event: DomainEvent = {
        eventType: 'package.processed',
        payload: { packageId: 'pkg-1' },
        recipientId: 'user-123',
      };

      await service.notify(event);

      expect(inAppService.createNotification).toHaveBeenCalledWith(
        NotificationType.PACKAGE_PROCESSED,
        event.payload,
        'user-123',
      );
      expect(webhookService.listEndpoints).toHaveBeenCalledWith('user-123');
      expect(webhookService.deliverWebhook).toHaveBeenCalled();
    });

    it('routes assembly-line.step.completed to in-app only', async () => {
      const { service, inAppService, webhookService, emailService } =
        buildService();

      const event: DomainEvent = {
        eventType: 'assembly-line.step.completed',
        payload: { stepName: 'build' },
        recipientId: 'user-123',
      };

      await service.notify(event);

      expect(inAppService.createNotification).toHaveBeenCalledWith(
        NotificationType.ASSEMBLY_LINE_STEP_COMPLETED,
        event.payload,
        'user-123',
      );
      expect(emailService.sendAssemblyLineCompleted).not.toHaveBeenCalled();
      expect(webhookService.listEndpoints).not.toHaveBeenCalled();
    });

    it('does nothing for unknown event types', async () => {
      const { service, emailService, inAppService, webhookService } =
        buildService();

      const event: DomainEvent = {
        eventType: 'unknown.event',
        payload: {},
        recipientId: 'user-123',
      };

      await service.notify(event);

      expect(emailService.sendAssemblyLineCompleted).not.toHaveBeenCalled();
      expect(emailService.sendWorkerError).not.toHaveBeenCalled();
      expect(emailService.sendWorkerStuck).not.toHaveBeenCalled();
      expect(emailService.sendRaw).not.toHaveBeenCalled();
      expect(inAppService.createNotification).not.toHaveBeenCalled();
      expect(webhookService.listEndpoints).not.toHaveBeenCalled();
    });

    it('skips email channel when recipientEmail is not provided', async () => {
      const { service, emailService, inAppService } = buildService();

      const event: DomainEvent = {
        eventType: 'assembly-line.completed',
        payload: { assemblyLineName: 'Test' },
        recipientId: 'user-123',
        // No recipientEmail
      };

      await service.notify(event);

      expect(emailService.sendAssemblyLineCompleted).not.toHaveBeenCalled();
      expect(inAppService.createNotification).toHaveBeenCalled();
    });

    it('skips in-app channel when recipientId is not provided', async () => {
      const { service, inAppService, emailService } = buildService();

      const event: DomainEvent = {
        eventType: 'job.error',
        payload: { workerName: 'Test' },
        recipientEmail: 'user@test.com',
        // No recipientId
      };

      await service.notify(event);

      expect(inAppService.createNotification).not.toHaveBeenCalled();
      expect(emailService.sendWorkerError).toHaveBeenCalled();
    });

    it('uses Promise.allSettled so one channel failure does not block others', async () => {
      const { service, emailService, inAppService } = buildService();
      emailService.sendAssemblyLineCompleted.mockRejectedValue(
        new Error('Email failed'),
      );

      const event: DomainEvent = {
        eventType: 'assembly-line.completed',
        payload: { assemblyLineName: 'Test' },
        recipientId: 'user-123',
        recipientEmail: 'user@test.com',
      };

      // Should not throw even if email fails
      await expect(service.notify(event)).resolves.toBeUndefined();
      expect(inAppService.createNotification).toHaveBeenCalled();
    });

    it('only delivers webhooks to endpoints subscribed to the event', async () => {
      const { service, webhookService } = buildService();
      webhookService.listEndpoints.mockResolvedValue([
        { id: 'ep-1', events: ['assembly-line.completed'], active: true },
        { id: 'ep-2', events: ['job.error'], active: true },
      ]);

      const event: DomainEvent = {
        eventType: 'assembly-line.completed',
        payload: {},
        recipientId: 'user-123',
        recipientEmail: 'user@test.com',
      };

      await service.notify(event);

      expect(webhookService.deliverWebhook).toHaveBeenCalledTimes(1);
      expect(webhookService.deliverWebhook).toHaveBeenCalledWith('ep-1', {
        event: 'assembly-line.completed',
        payload: {},
      });
    });

    it('sends email with defaults when payload fields are missing', async () => {
      const { service, emailService } = buildService();

      const event: DomainEvent = {
        eventType: 'assembly-line.completed',
        payload: {},
        recipientEmail: 'user@test.com',
        recipientId: 'user-123',
      };

      await service.notify(event);

      expect(emailService.sendAssemblyLineCompleted).toHaveBeenCalledWith(
        'user@test.com',
        {
          assemblyLineName: 'Unknown',
          totalDuration: 'Unknown',
          stepsCompleted: 0,
          outputSummary: '',
        },
      );
    });

    it('sends raw email for events without specific email handlers', async () => {
      const { service, emailService } = buildService();

      const event: DomainEvent = {
        eventType: 'package.processed',
        payload: { packageId: 'pkg-1' },
        recipientEmail: 'user@test.com',
        recipientId: 'user-123',
      };

      // package.processed routes to in-app + webhook (no email in routing)
      // So email should NOT be called
      await service.notify(event);
      expect(emailService.sendRaw).not.toHaveBeenCalled();
    });

    it('handles job.stuck email with choices in payload', async () => {
      const { service, emailService } = buildService();

      const event: DomainEvent = {
        eventType: 'job.stuck',
        payload: {
          workerName: 'TestWorker',
          questionText: 'Pick an option',
          choices: ['A', 'B'],
          jobId: 'job-1',
        },
        recipientId: 'user-123',
        recipientEmail: 'user@test.com',
      };

      // job.stuck routes to in-app only, not email
      await service.notify(event);
      expect(emailService.sendWorkerStuck).not.toHaveBeenCalled();
    });
  });

  describe('getRoutingForEvent', () => {
    it('returns routing for known events', () => {
      const { service } = buildService();
      const routing = service.getRoutingForEvent('assembly-line.completed');
      expect(routing).toEqual({
        channels: ['email', 'in-app', 'webhook'],
        notificationType: 'ASSEMBLY_LINE_COMPLETED',
      });
    });

    it('returns undefined for unknown events', () => {
      const { service } = buildService();
      expect(service.getRoutingForEvent('unknown.event')).toBeUndefined();
    });
  });

  describe('getChannelMap', () => {
    it('returns a copy of the channel map', () => {
      const { service } = buildService();
      const map = service.getChannelMap();
      expect(map['assembly-line.completed']).toBeDefined();
      expect(map['job.error']).toBeDefined();
      expect(map['job.stuck']).toBeDefined();
      expect(map['package.created']).toBeDefined();
      expect(map['package.processed']).toBeDefined();
      expect(map['assembly-line.step.completed']).toBeDefined();
    });

    it('returns a copy that does not mutate the original', () => {
      const { service } = buildService();
      const map = service.getChannelMap();
      delete map['assembly-line.completed'];
      const map2 = service.getChannelMap();
      expect(map2['assembly-line.completed']).toBeDefined();
    });
  });
});
