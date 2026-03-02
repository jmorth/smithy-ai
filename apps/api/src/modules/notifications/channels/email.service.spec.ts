import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Resend mock ---
const mockSend = vi.fn();
const { MockResend } = vi.hoisted(() => ({
  MockResend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

vi.mock('resend', () => ({
  Resend: MockResend,
}));

import {
  EmailService,
  AssemblyLineCompletedDetails,
  WorkerErrorDetails,
  WorkerStuckDetails,
} from './email.service';

function makeConfigService(overrides: Record<string, string | undefined> = {}) {
  const defaults: Record<string, string | undefined> = {
    'email.resendApiKey': 're_test_key',
    'email.fromAddress': 'notifications@smithy.dev',
    'email.dashboardUrl': 'http://localhost:5173',
    ...overrides,
  };
  return { get: vi.fn((key: string) => defaults[key]) };
}

function buildService(configOverrides?: Record<string, string | undefined>) {
  const config = makeConfigService(configOverrides);
  const service = new EmailService(config as any);
  return { service, config };
}

const completedDetails: AssemblyLineCompletedDetails = {
  assemblyLineName: 'My Pipeline',
  totalDuration: '2m 34s',
  stepsCompleted: 5,
  outputSummary: 'All tasks completed successfully.',
};

const errorDetails: WorkerErrorDetails = {
  workerName: 'summarizer',
  errorMessage: 'Out of memory',
  lastLogLines: ['line 1', 'line 2', 'line 3'],
  jobId: 'job-123',
};

const stuckDetails: WorkerStuckDetails = {
  workerName: 'code-reviewer',
  questionText: 'Which branch should I review?',
  choices: ['main', 'develop', 'feature/x'],
  jobId: 'job-456',
};

describe('EmailService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('creates Resend client when API key is configured', () => {
      buildService();
      expect(MockResend).toHaveBeenCalledWith('re_test_key');
    });

    it('does not create Resend client when API key is missing', () => {
      buildService({ 'email.resendApiKey': undefined });
      expect(MockResend).not.toHaveBeenCalled();
    });

    it('reads fromAddress from config', () => {
      const { config } = buildService();
      expect(config.get).toHaveBeenCalledWith('email.fromAddress');
    });

    it('reads dashboardUrl from config', () => {
      const { config } = buildService();
      expect(config.get).toHaveBeenCalledWith('email.dashboardUrl');
    });
  });

  describe('onModuleInit', () => {
    it('logs warning when Resend is not configured', () => {
      const { service } = buildService({ 'email.resendApiKey': undefined });
      const warnSpy = vi.spyOn((service as any).logger, 'warn');
      service.onModuleInit();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('RESEND_API_KEY is not configured'),
      );
    });

    it('does not log warning when Resend is configured', () => {
      const { service } = buildService();
      const warnSpy = vi.spyOn((service as any).logger, 'warn');
      service.onModuleInit();
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('sendAssemblyLineCompleted', () => {
    it('sends email with correct subject and recipient', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_1' });
      const { service } = buildService();
      await service.sendAssemblyLineCompleted('user@example.com', completedDetails);

      expect(mockSend).toHaveBeenCalledOnce();
      const call = mockSend.mock.calls[0][0];
      expect(call.to).toBe('user@example.com');
      expect(call.subject).toBe('Assembly Line "My Pipeline" completed');
      expect(call.from).toBe('Smithy <notifications@smithy.dev>');
    });

    it('includes assembly line name in HTML', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_1' });
      const { service } = buildService();
      await service.sendAssemblyLineCompleted('user@example.com', completedDetails);
      const html = mockSend.mock.calls[0][0].html;
      expect(html).toContain('My Pipeline');
    });

    it('includes duration in HTML', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_1' });
      const { service } = buildService();
      await service.sendAssemblyLineCompleted('user@example.com', completedDetails);
      const html = mockSend.mock.calls[0][0].html;
      expect(html).toContain('2m 34s');
    });

    it('includes steps completed in HTML', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_1' });
      const { service } = buildService();
      await service.sendAssemblyLineCompleted('user@example.com', completedDetails);
      const html = mockSend.mock.calls[0][0].html;
      expect(html).toContain('5');
    });

    it('includes output summary in HTML', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_1' });
      const { service } = buildService();
      await service.sendAssemblyLineCompleted('user@example.com', completedDetails);
      const html = mockSend.mock.calls[0][0].html;
      expect(html).toContain('All tasks completed successfully.');
    });

    it('includes Smithy branding header', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_1' });
      const { service } = buildService();
      await service.sendAssemblyLineCompleted('user@example.com', completedDetails);
      const html = mockSend.mock.calls[0][0].html;
      expect(html).toContain('SMITHY');
      expect(html).toContain('#1a1a2e');
    });

    it('includes footer with dashboard link', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_1' });
      const { service } = buildService();
      await service.sendAssemblyLineCompleted('user@example.com', completedDetails);
      const html = mockSend.mock.calls[0][0].html;
      expect(html).toContain('http://localhost:5173');
      expect(html).toContain('Open Dashboard');
    });
  });

  describe('sendWorkerError', () => {
    it('sends email with correct subject and recipient', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_2' });
      const { service } = buildService();
      await service.sendWorkerError('admin@example.com', errorDetails);

      const call = mockSend.mock.calls[0][0];
      expect(call.to).toBe('admin@example.com');
      expect(call.subject).toBe('Worker "summarizer" encountered an error');
    });

    it('includes worker name in HTML', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_2' });
      const { service } = buildService();
      await service.sendWorkerError('admin@example.com', errorDetails);
      const html = mockSend.mock.calls[0][0].html;
      expect(html).toContain('summarizer');
    });

    it('includes error message in HTML', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_2' });
      const { service } = buildService();
      await service.sendWorkerError('admin@example.com', errorDetails);
      const html = mockSend.mock.calls[0][0].html;
      expect(html).toContain('Out of memory');
    });

    it('includes log lines in HTML', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_2' });
      const { service } = buildService();
      await service.sendWorkerError('admin@example.com', errorDetails);
      const html = mockSend.mock.calls[0][0].html;
      expect(html).toContain('line 1');
      expect(html).toContain('line 2');
      expect(html).toContain('line 3');
    });

    it('includes link to job in dashboard', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_2' });
      const { service } = buildService();
      await service.sendWorkerError('admin@example.com', errorDetails);
      const html = mockSend.mock.calls[0][0].html;
      expect(html).toContain('http://localhost:5173/jobs/job-123');
      expect(html).toContain('View Job in Dashboard');
    });
  });

  describe('sendWorkerStuck', () => {
    it('sends email with correct subject and recipient', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_3' });
      const { service } = buildService();
      await service.sendWorkerStuck('admin@example.com', stuckDetails);

      const call = mockSend.mock.calls[0][0];
      expect(call.to).toBe('admin@example.com');
      expect(call.subject).toBe('Worker "code-reviewer" needs your input');
    });

    it('includes worker name in HTML', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_3' });
      const { service } = buildService();
      await service.sendWorkerStuck('admin@example.com', stuckDetails);
      const html = mockSend.mock.calls[0][0].html;
      expect(html).toContain('code-reviewer');
    });

    it('includes question text in HTML', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_3' });
      const { service } = buildService();
      await service.sendWorkerStuck('admin@example.com', stuckDetails);
      const html = mockSend.mock.calls[0][0].html;
      expect(html).toContain('Which branch should I review?');
    });

    it('includes choices in HTML when provided', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_3' });
      const { service } = buildService();
      await service.sendWorkerStuck('admin@example.com', stuckDetails);
      const html = mockSend.mock.calls[0][0].html;
      expect(html).toContain('main');
      expect(html).toContain('develop');
      expect(html).toContain('feature/x');
      expect(html).toContain('Available Choices');
    });

    it('omits choices section when no choices provided', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_3' });
      const { service } = buildService();
      const detailsNoChoices: WorkerStuckDetails = {
        workerName: 'writer',
        questionText: 'What topic?',
        jobId: 'job-789',
      };
      await service.sendWorkerStuck('admin@example.com', detailsNoChoices);
      const html = mockSend.mock.calls[0][0].html;
      expect(html).not.toContain('Available Choices');
    });

    it('omits choices section when choices array is empty', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_3' });
      const { service } = buildService();
      const detailsEmpty: WorkerStuckDetails = {
        workerName: 'writer',
        questionText: 'What topic?',
        choices: [],
        jobId: 'job-789',
      };
      await service.sendWorkerStuck('admin@example.com', detailsEmpty);
      const html = mockSend.mock.calls[0][0].html;
      expect(html).not.toContain('Available Choices');
    });

    it('includes link to answer in dashboard', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_3' });
      const { service } = buildService();
      await service.sendWorkerStuck('admin@example.com', stuckDetails);
      const html = mockSend.mock.calls[0][0].html;
      expect(html).toContain('http://localhost:5173/jobs/job-456');
      expect(html).toContain('Answer in Dashboard');
    });
  });

  describe('sendRaw', () => {
    it('sends email with provided subject and html', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_4' });
      const { service } = buildService();
      await service.sendRaw('user@example.com', 'Test Subject', '<p>Hello</p>');

      const call = mockSend.mock.calls[0][0];
      expect(call.to).toBe('user@example.com');
      expect(call.subject).toBe('Test Subject');
      expect(call.html).toBe('<p>Hello</p>');
    });
  });

  describe('graceful degradation — missing API key', () => {
    it('does not throw when sending without API key', async () => {
      const { service } = buildService({ 'email.resendApiKey': undefined });
      await expect(
        service.sendAssemblyLineCompleted('user@example.com', completedDetails),
      ).resolves.toBeUndefined();
    });

    it('logs warning on each send attempt without API key', async () => {
      const { service } = buildService({ 'email.resendApiKey': undefined });
      const warnSpy = vi.spyOn((service as any).logger, 'warn');
      await service.sendWorkerError('user@example.com', errorDetails);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Email not sent (RESEND_API_KEY not configured)'),
      );
    });

    it('does not call Resend SDK when API key is missing', async () => {
      const { service } = buildService({ 'email.resendApiKey': undefined });
      await service.sendWorkerStuck('user@example.com', stuckDetails);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('graceful degradation — Resend API errors', () => {
    it('does not throw on Resend API error', async () => {
      mockSend.mockRejectedValueOnce(new Error('rate limit exceeded'));
      const { service } = buildService();
      await expect(
        service.sendAssemblyLineCompleted('user@example.com', completedDetails),
      ).resolves.toBeUndefined();
    });

    it('logs the error on Resend API failure', async () => {
      const apiError = new Error('rate limit exceeded');
      mockSend.mockRejectedValueOnce(apiError);
      const { service } = buildService();
      const errorSpy = vi.spyOn((service as any).logger, 'error');
      await service.sendWorkerError('user@example.com', errorDetails);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send email'),
        apiError,
      );
    });
  });

  describe('HTML escaping', () => {
    it('escapes HTML special characters in assembly line name', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_5' });
      const { service } = buildService();
      const xssDetails: AssemblyLineCompletedDetails = {
        assemblyLineName: '<script>alert("xss")</script>',
        totalDuration: '1s',
        stepsCompleted: 1,
        outputSummary: 'Done',
      };
      await service.sendAssemblyLineCompleted('user@example.com', xssDetails);
      const html = mockSend.mock.calls[0][0].html;
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('escapes HTML in worker error messages', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_6' });
      const { service } = buildService();
      const xssError: WorkerErrorDetails = {
        workerName: 'test',
        errorMessage: '<img onerror="alert(1)" src=x>',
        lastLogLines: ['<b>bold</b>'],
        jobId: 'job-1',
      };
      await service.sendWorkerError('user@example.com', xssError);
      const html = mockSend.mock.calls[0][0].html;
      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;img');
    });

    it('escapes ampersands and quotes', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_7' });
      const { service } = buildService();
      const details: AssemblyLineCompletedDetails = {
        assemblyLineName: 'Tom & Jerry "Special"',
        totalDuration: '1s',
        stepsCompleted: 1,
        outputSummary: "It's done & 'complete'",
      };
      await service.sendAssemblyLineCompleted('user@example.com', details);
      const html = mockSend.mock.calls[0][0].html;
      expect(html).toContain('Tom &amp; Jerry &quot;Special&quot;');
      expect(html).toContain('It&#39;s done &amp; &#39;complete&#39;');
    });
  });

  describe('custom from address', () => {
    it('uses configured from address', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_8' });
      const { service } = buildService({
        'email.fromAddress': 'noreply@mycompany.com',
      });
      await service.sendAssemblyLineCompleted('user@example.com', completedDetails);
      const call = mockSend.mock.calls[0][0];
      expect(call.from).toBe('Smithy <noreply@mycompany.com>');
    });
  });

  describe('custom dashboard URL', () => {
    it('uses configured dashboard URL in job links', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_9' });
      const { service } = buildService({
        'email.dashboardUrl': 'https://app.smithy.io',
      });
      await service.sendWorkerError('user@example.com', errorDetails);
      const html = mockSend.mock.calls[0][0].html;
      expect(html).toContain('https://app.smithy.io/jobs/job-123');
    });

    it('uses configured dashboard URL in footer', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_10' });
      const { service } = buildService({
        'email.dashboardUrl': 'https://app.smithy.io',
      });
      await service.sendAssemblyLineCompleted('user@example.com', completedDetails);
      const html = mockSend.mock.calls[0][0].html;
      expect(html).toContain('https://app.smithy.io');
    });
  });

  describe('URL encoding in job links', () => {
    it('encodes special characters in job ID', async () => {
      mockSend.mockResolvedValueOnce({ id: 'msg_11' });
      const { service } = buildService();
      const details: WorkerErrorDetails = {
        workerName: 'test',
        errorMessage: 'err',
        lastLogLines: [],
        jobId: 'job/with spaces&special',
      };
      await service.sendWorkerError('user@example.com', details);
      const html = mockSend.mock.calls[0][0].html;
      expect(html).toContain('http://localhost:5173/jobs/job%2Fwith%20spaces%26special');
    });
  });
});
