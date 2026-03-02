import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn() },
  })),
}));

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn(() => ({ _tag: 'DrizzleClient' })),
}));

vi.mock('../../database/schema', () => ({}));

vi.mock('ioredis', () => {
  const MockRedis = vi.fn();
  MockRedis.prototype.connect = vi.fn();
  MockRedis.prototype.disconnect = vi.fn();
  MockRedis.prototype.quit = vi.fn();
  return { default: MockRedis };
});

import { Global, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { NotificationsModule } from './notifications.module';
import { EmailService } from './channels/email.service';
import { InAppService } from './channels/in-app.service';
import { DatabaseModule } from '../../database/database.module';
import { WorkflowsGateway } from '../realtime/workflows.gateway';

@Global()
@Module({
  providers: [
    { provide: WorkflowsGateway, useValue: { emitToRoom: vi.fn() } },
  ],
  exports: [WorkflowsGateway],
})
class MockRealtimeModule {}

describe('NotificationsModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              database: { url: 'postgresql://user:pass@localhost:5432/test' },
              redis: { url: 'redis://localhost:6379' },
              email: {
                resendApiKey: undefined,
                fromAddress: 'test@smithy.dev',
                dashboardUrl: 'http://localhost:5173',
              },
            }),
          ],
        }),
        DatabaseModule,
        MockRealtimeModule,
        NotificationsModule,
      ],
    }).compile();
  });

  afterEach(async () => {
    await module.close();
  });

  it('exports EmailService', () => {
    const emailService = module.get(EmailService);
    expect(emailService).toBeInstanceOf(EmailService);
  });

  it('exports InAppService', () => {
    const inAppService = module.get(InAppService);
    expect(inAppService).toBeInstanceOf(InAppService);
  });
});
