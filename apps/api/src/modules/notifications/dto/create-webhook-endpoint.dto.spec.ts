import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateWebhookEndpointDto } from './create-webhook-endpoint.dto';

describe('CreateWebhookEndpointDto', () => {
  it('passes with all valid fields', async () => {
    const dto = plainToInstance(CreateWebhookEndpointDto, {
      url: 'https://example.com/hook',
      secret: 'my-secret-key',
      events: ['assembly-line.completed', 'job.error'],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when url is missing', async () => {
    const dto = plainToInstance(CreateWebhookEndpointDto, {
      secret: 'my-secret',
      events: ['job.error'],
    });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'url');
    expect(error).toBeDefined();
  });

  it('fails when url is not a valid URL', async () => {
    const dto = plainToInstance(CreateWebhookEndpointDto, {
      url: 'not-a-url',
      secret: 'my-secret',
      events: ['job.error'],
    });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'url');
    expect(error).toBeDefined();
  });

  it('fails when secret is missing', async () => {
    const dto = plainToInstance(CreateWebhookEndpointDto, {
      url: 'https://example.com/hook',
      events: ['job.error'],
    });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'secret');
    expect(error).toBeDefined();
  });

  it('fails when secret is empty', async () => {
    const dto = plainToInstance(CreateWebhookEndpointDto, {
      url: 'https://example.com/hook',
      secret: '',
      events: ['job.error'],
    });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'secret');
    expect(error).toBeDefined();
  });

  it('fails when events is missing', async () => {
    const dto = plainToInstance(CreateWebhookEndpointDto, {
      url: 'https://example.com/hook',
      secret: 'my-secret',
    });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'events');
    expect(error).toBeDefined();
  });

  it('fails when events is empty array', async () => {
    const dto = plainToInstance(CreateWebhookEndpointDto, {
      url: 'https://example.com/hook',
      secret: 'my-secret',
      events: [],
    });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'events');
    expect(error).toBeDefined();
  });

  it('fails when events contains non-string values', async () => {
    const dto = plainToInstance(CreateWebhookEndpointDto, {
      url: 'https://example.com/hook',
      secret: 'my-secret',
      events: [123],
    });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'events');
    expect(error).toBeDefined();
  });

  it('passes with single event', async () => {
    const dto = plainToInstance(CreateWebhookEndpointDto, {
      url: 'https://example.com/hook',
      secret: 'my-secret',
      events: ['job.completed'],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when events is not an array', async () => {
    const dto = plainToInstance(CreateWebhookEndpointDto, {
      url: 'https://example.com/hook',
      secret: 'my-secret',
      events: 'not-an-array',
    });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'events');
    expect(error).toBeDefined();
  });
});
