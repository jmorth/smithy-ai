# Task 076: Create Email Notification Service

## Summary
Create `EmailService` using the Resend SDK for sending notification emails — assembly line completion summaries, worker error alerts, and worker stuck prompts. Emails use HTML templates with consistent Smithy branding. The service gracefully degrades when the Resend API key is not configured, logging warnings instead of crashing.

## Phase
Phase 4: Real-time & Communication

## Dependencies
- **Depends on**: 023 (Zod Configuration Module — provides `RESEND_API_KEY` config)
- **Blocks**: 079 (Notification REST Controller — facade routes to this channel)

## Architecture Reference
The email service is one of three notification channels (email, in-app, webhook). It uses the Resend SDK (`resend` npm package) for transactional email delivery. Resend is a developer-focused email API that handles deliverability, bounce tracking, and analytics. The service is consumed by the `NotificationsService` facade (task 079) which routes events to the appropriate channel(s). Emails are sent for high-importance events: assembly line completion, worker errors, and stuck worker questions requiring human input.

## Files and Folders
- `/apps/api/src/modules/notifications/channels/email.service.ts` — Email notification channel using Resend SDK

## Acceptance Criteria
- [ ] Installs `resend` npm package as a dependency
- [ ] Reads `RESEND_API_KEY` from ConfigModule; reads `EMAIL_FROM` address from config (default: `notifications@smithy.dev`)
- [ ] `sendAssemblyLineCompleted(recipient: string, details: AssemblyLineCompletedDetails)` — sends completion summary email with: assembly line name, total duration, number of steps completed, output summary
- [ ] `sendWorkerError(recipient: string, details: WorkerErrorDetails)` — sends error alert email with: worker name, error message, last 10 log lines, link to job in dashboard
- [ ] `sendWorkerStuck(recipient: string, details: WorkerStuckDetails)` — sends interactive prompt email with: worker name, question text, choices (if any), link to answer in dashboard
- [ ] All emails use HTML formatting with consistent Smithy branding (logo placeholder, color scheme, footer)
- [ ] Gracefully handles missing `RESEND_API_KEY`: logs a warning at startup and on each send attempt, returns without throwing
- [ ] Gracefully handles Resend API errors: logs the error, does not throw (email is best-effort)
- [ ] The service is injectable via NestJS DI (`@Injectable()`)

## Implementation Notes
- Resend SDK usage:
  ```typescript
  import { Resend } from 'resend';
  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: 'Smithy <notifications@smithy.dev>',
    to: recipient,
    subject: 'Assembly Line "My Pipeline" completed',
    html: htmlContent,
  });
  ```
- For HTML templates, use template literals with a shared layout wrapper function. Do not introduce a template engine (Handlebars, EJS) for MVP — template literals are sufficient for 3 email types.
- The "link to dashboard" URLs should be constructed from a `DASHBOARD_URL` config variable (default: `http://localhost:5173`).
- Consider adding a `sendRaw(to, subject, html)` method for future extensibility.
- Email sending should be async (fire-and-forget from the caller's perspective). The caller does not need to await email delivery.
- For local development, Resend provides a test mode that does not actually send emails. Document this in the implementation notes.
- Rate limit awareness: Resend has API rate limits. For MVP, individual sends are fine. For production, consider batching or queuing.
