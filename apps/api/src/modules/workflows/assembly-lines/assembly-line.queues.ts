import type { Channel } from 'amqplib';

/** Topic exchange for all Assembly Line message routing. */
export const ASSEMBLY_EXCHANGE = 'smithy.assembly';

/** Direct exchange that receives dead-lettered messages from step queues. */
export const ASSEMBLY_DLX = 'smithy.assembly.dlx';

/** Message TTL on step queues — 24 hours (ms). */
const STEP_QUEUE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Returns the step queue name for a given Assembly Line slug and step number.
 * Pattern: `assembly.{lineSlug}.step.{stepNumber}`
 */
export function getStepQueueName(lineSlug: string, stepNumber: number): string {
  return `assembly.${lineSlug}.step.${stepNumber}`;
}

/**
 * Returns the routing key used to publish messages destined for a specific step.
 * Pattern: `assembly.{lineSlug}.step.{stepNumber}`
 */
export function getStepRoutingKey(lineSlug: string, stepNumber: number): string {
  return `assembly.${lineSlug}.step.${stepNumber}`;
}

/**
 * Returns the dead letter queue name for a given Assembly Line slug and step number.
 * Pattern: `assembly.{lineSlug}.step.{stepNumber}.dlq`
 */
export function getStepDLQName(lineSlug: string, stepNumber: number): string {
  return `assembly.${lineSlug}.step.${stepNumber}.dlq`;
}

/**
 * Idempotently declares the full RabbitMQ topology for an Assembly Line.
 *
 * Creates:
 *  - `smithy.assembly` topic exchange
 *  - `smithy.assembly.dlx` direct exchange (dead letter sink)
 *  - One durable step queue per step, bound to the topic exchange
 *  - One DLQ per step, bound to the DLX
 *
 * Safe to call multiple times — `assertExchange` / `assertQueue` are no-ops
 * when the entity already exists with identical parameters.
 */
export async function declareAssemblyTopology(
  channel: Channel,
  lineSlug: string,
  stepCount: number,
): Promise<void> {
  // Declare the primary topic exchange
  await channel.assertExchange(ASSEMBLY_EXCHANGE, 'topic', { durable: true });

  // Declare the dead letter exchange (direct so DLQ routing keys are exact-match)
  await channel.assertExchange(ASSEMBLY_DLX, 'direct', { durable: true });

  for (let step = 1; step <= stepCount; step++) {
    const queueName = getStepQueueName(lineSlug, step);
    const routingKey = getStepRoutingKey(lineSlug, step);
    const dlqName = getStepDLQName(lineSlug, step);

    // Declare the dead letter queue first so it exists before the step queue references it
    await channel.assertQueue(dlqName, { durable: true });
    await channel.bindQueue(dlqName, ASSEMBLY_DLX, dlqName);

    // Declare the step queue with dead letter configuration and TTL
    await channel.assertQueue(queueName, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': ASSEMBLY_DLX,
        'x-dead-letter-routing-key': dlqName,
        'x-message-ttl': STEP_QUEUE_TTL_MS,
      },
    });

    // Bind step queue to the topic exchange using the routing key
    await channel.bindQueue(queueName, ASSEMBLY_EXCHANGE, routingKey);
  }
}

/**
 * Tears down step queues and bindings for an Assembly Line.
 * Does NOT delete the shared exchanges to avoid disrupting other lines.
 */
export async function teardownAssemblyTopology(
  channel: Channel,
  lineSlug: string,
  stepCount: number,
): Promise<void> {
  for (let step = 1; step <= stepCount; step++) {
    const queueName = getStepQueueName(lineSlug, step);
    const routingKey = getStepRoutingKey(lineSlug, step);
    const dlqName = getStepDLQName(lineSlug, step);

    await channel.unbindQueue(queueName, ASSEMBLY_EXCHANGE, routingKey);
    await channel.deleteQueue(queueName);

    await channel.unbindQueue(dlqName, ASSEMBLY_DLX, dlqName);
    await channel.deleteQueue(dlqName);
  }
}
