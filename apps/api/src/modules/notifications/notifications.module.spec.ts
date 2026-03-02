import { describe, it, expect, vi } from 'vitest';

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn() },
  })),
}));

import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { NotificationsModule } from './notifications.module';
import { EmailService } from './channels/email.service';

describe('NotificationsModule', () => {
  it('exports EmailService', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              email: {
                resendApiKey: undefined,
                fromAddress: 'test@smithy.dev',
                dashboardUrl: 'http://localhost:5173',
              },
            }),
          ],
        }),
        NotificationsModule,
      ],
    }).compile();

    const emailService = module.get(EmailService);
    expect(emailService).toBeInstanceOf(EmailService);
  });
});
