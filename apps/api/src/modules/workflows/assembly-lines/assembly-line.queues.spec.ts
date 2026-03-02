import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Channel } from 'amqplib';
import {
  ASSEMBLY_EXCHANGE,
  ASSEMBLY_DLX,
  getStepQueueName,
  getStepRoutingKey,
  getStepDLQName,
  declareAssemblyTopology,
  teardownAssemblyTopology,
} from './assembly-line.queues';

// ─── Mock Channel factory ─────────────────────────────────────────────────────

function makeMockChannel(): Channel {
  return {
    assertExchange: vi.fn().mockResolvedValue(undefined),
    assertQueue: vi.fn().mockResolvedValue(undefined),
    bindQueue: vi.fn().mockResolvedValue(undefined),
    unbindQueue: vi.fn().mockResolvedValue(undefined),
    deleteQueue: vi.fn().mockResolvedValue(undefined),
  } as unknown as Channel;
}

// ─── Constants ────────────────────────────────────────────────────────────────

describe('ASSEMBLY_EXCHANGE', () => {
  it('equals smithy.assembly', () => {
    expect(ASSEMBLY_EXCHANGE).toBe('smithy.assembly');
  });
});

describe('ASSEMBLY_DLX', () => {
  it('equals smithy.assembly.dlx', () => {
    expect(ASSEMBLY_DLX).toBe('smithy.assembly.dlx');
  });
});

// ─── Factory functions ────────────────────────────────────────────────────────

describe('getStepQueueName', () => {
  it('returns the correct queue name pattern', () => {
    expect(getStepQueueName('video-encode', 1)).toBe('assembly.video-encode.step.1');
  });

  it('includes the step number correctly for multi-digit steps', () => {
    expect(getStepQueueName('my-pipeline', 12)).toBe('assembly.my-pipeline.step.12');
  });
});

describe('getStepRoutingKey', () => {
  it('returns the same pattern as the queue name', () => {
    expect(getStepRoutingKey('video-encode', 1)).toBe('assembly.video-encode.step.1');
  });

  it('handles multi-digit step numbers', () => {
    expect(getStepRoutingKey('my-pipeline', 12)).toBe('assembly.my-pipeline.step.12');
  });
});

describe('getStepDLQName', () => {
  it('returns the DLQ name with .dlq suffix', () => {
    expect(getStepDLQName('video-encode', 1)).toBe('assembly.video-encode.step.1.dlq');
  });

  it('handles multi-digit step numbers', () => {
    expect(getStepDLQName('my-pipeline', 12)).toBe('assembly.my-pipeline.step.12.dlq');
  });
});

// ─── Name character validity ──────────────────────────────────────────────────

describe('name character constraints', () => {
  const slug = 'my-pipeline';

  it('queue names use only lowercase alphanumeric, dots, and hyphens', () => {
    const valid = /^[a-z0-9.\-]+$/;
    expect(getStepQueueName(slug, 1)).toMatch(valid);
    expect(getStepDLQName(slug, 1)).toMatch(valid);
    expect(ASSEMBLY_EXCHANGE).toMatch(valid);
    expect(ASSEMBLY_DLX).toMatch(valid);
  });

  it('routing keys use only lowercase alphanumeric, dots, and hyphens', () => {
    expect(getStepRoutingKey(slug, 1)).toMatch(/^[a-z0-9.\-]+$/);
  });
});

// ─── declareAssemblyTopology ──────────────────────────────────────────────────

describe('declareAssemblyTopology', () => {
  let channel: Channel;

  beforeEach(() => {
    channel = makeMockChannel();
  });

  it('asserts the topic exchange', async () => {
    await declareAssemblyTopology(channel, 'line-a', 0);

    expect(channel.assertExchange).toHaveBeenCalledWith(ASSEMBLY_EXCHANGE, 'topic', {
      durable: true,
    });
  });

  it('asserts the dead letter exchange as direct type', async () => {
    await declareAssemblyTopology(channel, 'line-a', 0);

    expect(channel.assertExchange).toHaveBeenCalledWith(ASSEMBLY_DLX, 'direct', {
      durable: true,
    });
  });

  it('creates no queues when stepCount is 0', async () => {
    await declareAssemblyTopology(channel, 'line-a', 0);

    expect(channel.assertQueue).not.toHaveBeenCalled();
    expect(channel.bindQueue).not.toHaveBeenCalled();
  });

  it('declares one step queue and one DLQ for stepCount=1', async () => {
    await declareAssemblyTopology(channel, 'my-line', 1);

    expect(channel.assertQueue).toHaveBeenCalledTimes(2);
  });

  it('declares step queues with durable: true and DLX arguments', async () => {
    await declareAssemblyTopology(channel, 'my-line', 1);

    const queueName = getStepQueueName('my-line', 1);
    const dlqName = getStepDLQName('my-line', 1);

    expect(channel.assertQueue).toHaveBeenCalledWith(queueName, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': ASSEMBLY_DLX,
        'x-dead-letter-routing-key': dlqName,
        'x-message-ttl': 86400000,
      },
    });
  });

  it('declares DLQs as durable with no extra arguments', async () => {
    await declareAssemblyTopology(channel, 'my-line', 1);

    const dlqName = getStepDLQName('my-line', 1);

    expect(channel.assertQueue).toHaveBeenCalledWith(dlqName, { durable: true });
  });

  it('binds the step queue to the topic exchange with the routing key', async () => {
    await declareAssemblyTopology(channel, 'my-line', 1);

    const queueName = getStepQueueName('my-line', 1);
    const routingKey = getStepRoutingKey('my-line', 1);

    expect(channel.bindQueue).toHaveBeenCalledWith(queueName, ASSEMBLY_EXCHANGE, routingKey);
  });

  it('binds the DLQ to the DLX with the DLQ name as routing key', async () => {
    await declareAssemblyTopology(channel, 'my-line', 1);

    const dlqName = getStepDLQName('my-line', 1);

    expect(channel.bindQueue).toHaveBeenCalledWith(dlqName, ASSEMBLY_DLX, dlqName);
  });

  it('creates the correct number of queues and bindings for multiple steps', async () => {
    await declareAssemblyTopology(channel, 'multi-step', 3);

    // 2 queues per step (step queue + DLQ) = 6
    expect(channel.assertQueue).toHaveBeenCalledTimes(6);
    // 2 bindings per step (step queue + DLQ) = 6
    expect(channel.bindQueue).toHaveBeenCalledTimes(6);
  });

  it('creates queues for steps 1 through N (inclusive)', async () => {
    await declareAssemblyTopology(channel, 'seq', 2);

    for (let step = 1; step <= 2; step++) {
      expect(channel.assertQueue).toHaveBeenCalledWith(
        getStepQueueName('seq', step),
        expect.objectContaining({ durable: true }),
      );
    }
  });

  it('is idempotent — calling twice does not throw', async () => {
    await expect(declareAssemblyTopology(channel, 'my-line', 2)).resolves.toBeUndefined();
    await expect(declareAssemblyTopology(channel, 'my-line', 2)).resolves.toBeUndefined();
  });
});

// ─── teardownAssemblyTopology ─────────────────────────────────────────────────

describe('teardownAssemblyTopology', () => {
  let channel: Channel;

  beforeEach(() => {
    channel = makeMockChannel();
  });

  it('does nothing when stepCount is 0', async () => {
    await teardownAssemblyTopology(channel, 'line-a', 0);

    expect(channel.unbindQueue).not.toHaveBeenCalled();
    expect(channel.deleteQueue).not.toHaveBeenCalled();
  });

  it('unbinds and deletes the step queue for a single step', async () => {
    await teardownAssemblyTopology(channel, 'my-line', 1);

    const queueName = getStepQueueName('my-line', 1);
    const routingKey = getStepRoutingKey('my-line', 1);

    expect(channel.unbindQueue).toHaveBeenCalledWith(queueName, ASSEMBLY_EXCHANGE, routingKey);
    expect(channel.deleteQueue).toHaveBeenCalledWith(queueName);
  });

  it('unbinds and deletes the DLQ for a single step', async () => {
    await teardownAssemblyTopology(channel, 'my-line', 1);

    const dlqName = getStepDLQName('my-line', 1);

    expect(channel.unbindQueue).toHaveBeenCalledWith(dlqName, ASSEMBLY_DLX, dlqName);
    expect(channel.deleteQueue).toHaveBeenCalledWith(dlqName);
  });

  it('tears down all steps for multiple steps', async () => {
    await teardownAssemblyTopology(channel, 'multi', 3);

    // 2 unbinds per step = 6
    expect(channel.unbindQueue).toHaveBeenCalledTimes(6);
    // 2 deletes per step = 6
    expect(channel.deleteQueue).toHaveBeenCalledTimes(6);
  });

  it('does not delete the shared exchanges', async () => {
    await teardownAssemblyTopology(channel, 'my-line', 2);

    expect(channel.assertExchange).not.toHaveBeenCalled();
  });
});
