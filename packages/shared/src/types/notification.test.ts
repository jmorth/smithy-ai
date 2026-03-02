import { describe, it, expect } from 'vitest';
import type { Notification, WebhookEndpoint } from './notification.js';

describe('Notification interface', () => {
  it('accepts a valid Notification with required fields', () => {
    const notification: Notification = {
      id: 'notif-1',
      type: 'job.completed',
      recipient: 'user@example.com',
      payload: { jobId: 'job-1', status: 'COMPLETED' },
      status: 'sent',
      createdAt: '2024-01-01T00:00:00Z',
    };
    expect(notification.id).toBe('notif-1');
    expect(notification.type).toBe('job.completed');
    expect(notification.recipient).toBe('user@example.com');
    expect(notification.payload).toEqual({ jobId: 'job-1', status: 'COMPLETED' });
    expect(notification.status).toBe('sent');
  });

  it('accepts a Notification with optional sentAt', () => {
    const notification: Notification = {
      id: 'notif-2',
      type: 'job.failed',
      recipient: 'admin@example.com',
      payload: { jobId: 'job-2', error: 'OOM' },
      status: 'sent',
      sentAt: '2024-01-01T00:01:00Z',
      createdAt: '2024-01-01T00:00:00Z',
    };
    expect(notification.sentAt).toBe('2024-01-01T00:01:00Z');
  });

  it('payload is a Record<string, unknown> accepting varied shapes', () => {
    const notification: Notification = {
      id: 'notif-3',
      type: 'webhook.test',
      recipient: 'hook@example.com',
      payload: {
        nested: { key: 'value' },
        list: [1, 2, 3],
        number: 42,
        flag: true,
      },
      status: 'pending',
      createdAt: '2024-01-01T00:00:00Z',
    };
    expect(typeof notification.payload).toBe('object');
    expect(notification.payload['list']).toEqual([1, 2, 3]);
  });

  it('sentAt is optional', () => {
    const withoutSentAt: Notification = {
      id: 'notif-4',
      type: 'email',
      recipient: 'user@example.com',
      payload: {},
      status: 'pending',
      createdAt: '2024-01-01T00:00:00Z',
    };
    expect(withoutSentAt.sentAt).toBeUndefined();
  });
});

describe('WebhookEndpoint interface', () => {
  it('accepts a valid WebhookEndpoint with required fields', () => {
    const endpoint: WebhookEndpoint = {
      id: 'wh-1',
      url: 'https://example.com/webhook',
      events: ['job.completed', 'job.failed'],
      active: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    expect(endpoint.id).toBe('wh-1');
    expect(endpoint.url).toBe('https://example.com/webhook');
    expect(endpoint.events).toEqual(['job.completed', 'job.failed']);
    expect(endpoint.active).toBe(true);
  });

  it('accepts a WebhookEndpoint with optional secret', () => {
    const endpoint: WebhookEndpoint = {
      id: 'wh-2',
      url: 'https://secure.example.com/webhook',
      secret: 'whsec_abc123',
      events: ['package.completed'],
      active: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    expect(endpoint.secret).toBe('whsec_abc123');
  });

  it('active is boolean', () => {
    const active: WebhookEndpoint = {
      id: 'wh-3',
      url: 'https://example.com/a',
      events: [],
      active: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    const inactive: WebhookEndpoint = {
      id: 'wh-4',
      url: 'https://example.com/b',
      events: [],
      active: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    expect(active.active).toBe(true);
    expect(inactive.active).toBe(false);
  });

  it('events is an array of strings', () => {
    const endpoint: WebhookEndpoint = {
      id: 'wh-5',
      url: 'https://example.com/hook',
      events: ['job.queued', 'job.running', 'job.completed', 'job.failed'],
      active: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    expect(Array.isArray(endpoint.events)).toBe(true);
    expect(endpoint.events).toHaveLength(4);
  });
});
