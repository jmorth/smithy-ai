import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface AssemblyLineCompletedDetails {
  assemblyLineName: string;
  totalDuration: string;
  stepsCompleted: number;
  outputSummary: string;
}

export interface WorkerErrorDetails {
  workerName: string;
  errorMessage: string;
  lastLogLines: string[];
  jobId: string;
}

export interface WorkerStuckDetails {
  workerName: string;
  questionText: string;
  choices?: string[];
  jobId: string;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend | null = null;
  private readonly fromAddress: string;
  private readonly dashboardUrl: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('email.resendApiKey');
    this.fromAddress = this.config.get<string>('email.fromAddress')!;
    this.dashboardUrl = this.config.get<string>('email.dashboardUrl')!;

    if (apiKey) {
      this.resend = new Resend(apiKey);
    }
  }

  onModuleInit(): void {
    if (!this.resend) {
      this.logger.warn(
        'RESEND_API_KEY is not configured — email notifications will be disabled',
      );
    }
  }

  async sendAssemblyLineCompleted(
    recipient: string,
    details: AssemblyLineCompletedDetails,
  ): Promise<void> {
    const subject = `Assembly Line "${details.assemblyLineName}" completed`;
    const html = this.wrapLayout(
      subject,
      `
      <h2 style="color: #1a1a2e; margin: 0 0 16px;">Assembly Line Completed</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0; color: #666; width: 140px;">Name</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0; font-weight: 600;">${this.escapeHtml(details.assemblyLineName)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0; color: #666;">Duration</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0;">${this.escapeHtml(details.totalDuration)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0; color: #666;">Steps Completed</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0;">${details.stepsCompleted}</td>
        </tr>
      </table>
      <div style="background: #f8f9fa; border-radius: 6px; padding: 12px 16px; margin-bottom: 16px;">
        <p style="margin: 0 0 4px; color: #666; font-size: 13px;">Output Summary</p>
        <p style="margin: 0; color: #1a1a2e;">${this.escapeHtml(details.outputSummary)}</p>
      </div>
    `,
    );

    await this.send(recipient, subject, html);
  }

  async sendWorkerError(
    recipient: string,
    details: WorkerErrorDetails,
  ): Promise<void> {
    const subject = `Worker "${details.workerName}" encountered an error`;
    const jobUrl = `${this.dashboardUrl}/jobs/${encodeURIComponent(details.jobId)}`;
    const logHtml = details.lastLogLines
      .map((line) => this.escapeHtml(line))
      .join('\n');

    const html = this.wrapLayout(
      subject,
      `
      <h2 style="color: #dc3545; margin: 0 0 16px;">Worker Error Alert</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0; color: #666; width: 140px;">Worker</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0; font-weight: 600;">${this.escapeHtml(details.workerName)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0; color: #666;">Error</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0; color: #dc3545;">${this.escapeHtml(details.errorMessage)}</td>
        </tr>
      </table>
      <div style="background: #1a1a2e; border-radius: 6px; padding: 12px 16px; margin-bottom: 16px;">
        <p style="margin: 0 0 8px; color: #aaa; font-size: 13px;">Last ${details.lastLogLines.length} Log Lines</p>
        <pre style="margin: 0; color: #e0e0e0; font-size: 12px; white-space: pre-wrap; font-family: 'Courier New', monospace;">${logHtml}</pre>
      </div>
      <a href="${jobUrl}" style="display: inline-block; padding: 10px 20px; background: #6c5ce7; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">View Job in Dashboard</a>
    `,
    );

    await this.send(recipient, subject, html);
  }

  async sendWorkerStuck(
    recipient: string,
    details: WorkerStuckDetails,
  ): Promise<void> {
    const subject = `Worker "${details.workerName}" needs your input`;
    const jobUrl = `${this.dashboardUrl}/jobs/${encodeURIComponent(details.jobId)}`;

    let choicesHtml = '';
    if (details.choices && details.choices.length > 0) {
      const items = details.choices
        .map(
          (c) =>
            `<li style="padding: 4px 0; color: #1a1a2e;">${this.escapeHtml(c)}</li>`,
        )
        .join('');
      choicesHtml = `
        <div style="background: #f8f9fa; border-radius: 6px; padding: 12px 16px; margin-bottom: 16px;">
          <p style="margin: 0 0 8px; color: #666; font-size: 13px;">Available Choices</p>
          <ul style="margin: 0; padding-left: 20px;">${items}</ul>
        </div>
      `;
    }

    const html = this.wrapLayout(
      subject,
      `
      <h2 style="color: #f0a500; margin: 0 0 16px;">Worker Needs Input</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0; color: #666; width: 140px;">Worker</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0; font-weight: 600;">${this.escapeHtml(details.workerName)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0; color: #666;">Question</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0;">${this.escapeHtml(details.questionText)}</td>
        </tr>
      </table>
      ${choicesHtml}
      <a href="${jobUrl}" style="display: inline-block; padding: 10px 20px; background: #6c5ce7; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">Answer in Dashboard</a>
    `,
    );

    await this.send(recipient, subject, html);
  }

  async sendRaw(to: string, subject: string, html: string): Promise<void> {
    await this.send(to, subject, html);
  }

  private async send(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    if (!this.resend) {
      this.logger.warn(
        `Email not sent (RESEND_API_KEY not configured): to=${to} subject="${subject}"`,
      );
      return;
    }

    try {
      await this.resend.emails.send({
        from: `Smithy <${this.fromAddress}>`,
        to,
        subject,
        html,
      });
      this.logger.debug(`Email sent: to=${to} subject="${subject}"`);
    } catch (err: unknown) {
      this.logger.error(`Failed to send email: to=${to} subject="${subject}"`, err);
    }
  }

  private wrapLayout(title: string, body: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #f4f4f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f4f4f8; padding: 32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background: #1a1a2e; padding: 24px 32px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: 1px;">⚙️ SMITHY</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="background: #f8f9fa; padding: 16px 32px; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0; color: #999; font-size: 12px; text-align: center;">
                Sent by Smithy AI &middot; <a href="${this.dashboardUrl}" style="color: #6c5ce7; text-decoration: none;">Open Dashboard</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
