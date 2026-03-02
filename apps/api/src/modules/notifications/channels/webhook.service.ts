import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../../database/database.constants';
import type { DrizzleClient } from '../../../database/database.provider';
import { webhookEndpoints } from '../../../database/schema';

export interface WebhookEvent {
  event: string;
  payload: Record<string, unknown>;
}

export type WebhookEndpointRecord = typeof webhookEndpoints.$inferSelect;

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const BACKOFF_FACTOR = 5;
const REQUEST_TIMEOUT_MS = 10_000;

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleClient) {}

  async deliverWebhook(
    endpointId: string,
    event: WebhookEvent,
  ): Promise<void> {
    const [endpoint] = await this.db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.id, endpointId));

    if (!endpoint) {
      this.logger.warn(`Webhook endpoint not found: ${endpointId}`);
      return;
    }

    if (!endpoint.active) {
      this.logger.debug(
        `Webhook endpoint inactive, skipping: ${endpointId}`,
      );
      return;
    }

    if (!endpoint.events.includes(event.event)) {
      this.logger.debug(
        `Event "${event.event}" not in endpoint subscriptions, skipping: ${endpointId}`,
      );
      return;
    }

    const body = {
      event: event.event,
      timestamp: new Date().toISOString(),
      payload: event.payload,
    };

    const bodyString = JSON.stringify(body);
    const signature = this.sign(bodyString, endpoint.secret);

    let lastError: Error | null = null;
    let lastStatusCode: number | null = null;
    let retryAfterSeconds: number | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = this.calculateDelay(attempt, retryAfterSeconds);
        await this.sleep(delay);
        retryAfterSeconds = null;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          REQUEST_TIMEOUT_MS,
        );

        const response = await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Smithy-Signature': `sha256=${signature}`,
            'X-Smithy-Event': event.event,
          },
          body: bodyString,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          this.logger.debug(
            `Webhook delivered: endpoint=${endpointId} event=${event.event} status=${response.status}`,
          );
          await this.updateDeliveryStatus(endpointId, `${response.status}`);
          return;
        }

        lastStatusCode = response.status;

        if (this.isRetryable(response.status)) {
          if (response.status === 429) {
            retryAfterSeconds = this.parseRetryAfter(
              response.headers.get('retry-after'),
            );
          }
          lastError = new Error(
            `HTTP ${response.status}: ${response.statusText}`,
          );
          this.logger.warn(
            `Webhook delivery failed (attempt ${attempt + 1}/${MAX_RETRIES}): endpoint=${endpointId} status=${response.status}`,
          );
          continue;
        }

        // Non-retryable failure (4xx except 429)
        this.logger.error(
          `Webhook delivery failed (non-retryable): endpoint=${endpointId} status=${response.status}`,
        );
        await this.updateDeliveryStatus(endpointId, `${response.status}`);
        return;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        lastStatusCode = null;
        this.logger.warn(
          `Webhook delivery error (attempt ${attempt + 1}/${MAX_RETRIES}): endpoint=${endpointId} error=${lastError.message}`,
        );
      }
    }

    this.logger.error(
      `Webhook delivery exhausted retries: endpoint=${endpointId} event=${event.event} lastError=${lastError?.message}`,
    );
    await this.updateDeliveryStatus(endpointId, 'FAILED');
  }

  async registerEndpoint(
    url: string,
    secret: string,
    events: string[],
    ownerId: string,
  ): Promise<WebhookEndpointRecord> {
    const [endpoint] = await this.db
      .insert(webhookEndpoints)
      .values({ url, secret, events, ownerId })
      .returning();

    this.logger.debug(
      `Webhook endpoint registered: id=${endpoint!.id} url=${url} events=[${events.join(',')}]`,
    );

    return endpoint!;
  }

  async listEndpoints(ownerId: string): Promise<WebhookEndpointRecord[]> {
    return this.db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.ownerId, ownerId));
  }

  async deleteEndpoint(endpointId: string): Promise<void> {
    await this.db
      .delete(webhookEndpoints)
      .where(eq(webhookEndpoints.id, endpointId));

    this.logger.debug(`Webhook endpoint deleted: id=${endpointId}`);
  }

  private sign(body: string, secret: string): string {
    return createHmac('sha256', secret).update(body).digest('hex');
  }

  private isRetryable(statusCode: number): boolean {
    return statusCode === 429 || statusCode >= 500;
  }

  private calculateDelay(
    attempt: number,
    retryAfterSeconds: number | null,
  ): number {
    if (retryAfterSeconds !== null && retryAfterSeconds > 0) {
      return retryAfterSeconds * 1000;
    }
    return BASE_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt);
  }

  private parseRetryAfter(header: string | null): number | null {
    if (!header) return null;
    const seconds = Number(header);
    if (!Number.isNaN(seconds) && seconds > 0) return seconds;
    // Try parsing as HTTP-date
    const date = new Date(header);
    if (!Number.isNaN(date.getTime())) {
      const delayMs = date.getTime() - Date.now();
      return delayMs > 0 ? Math.ceil(delayMs / 1000) : null;
    }
    return null;
  }

  private async updateDeliveryStatus(
    endpointId: string,
    status: string,
  ): Promise<void> {
    await this.db
      .update(webhookEndpoints)
      .set({
        lastDeliveryAt: new Date(),
        lastDeliveryStatus: status,
        updatedAt: new Date(),
      })
      .where(eq(webhookEndpoints.id, endpointId));
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
