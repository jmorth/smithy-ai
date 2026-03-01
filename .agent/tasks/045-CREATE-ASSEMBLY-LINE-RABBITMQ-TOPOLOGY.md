# Task 045: Create Assembly Line RabbitMQ Topology

## Summary
Define the RabbitMQ exchange and queue topology for Assembly Line message routing. This includes the `smithy.assembly` topic exchange, per-step queues with consistent naming conventions, routing key patterns, and dead letter configuration for failed messages. The topology is declared idempotently so it can be called on every application startup without side effects.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 043 (Assembly Line Service), 067 (Event Bus Module — provides RabbitMQ connection)
- **Blocks**: 044 (Assembly Line Orchestrator — uses these queues), 046 (Assembly Line REST Controller)

## Architecture Reference
RabbitMQ is Smithy's message bus for asynchronous job distribution. Assembly Lines use a topic exchange (`smithy.assembly`) where routing keys follow the pattern `assembly.{lineSlug}.step.{stepNumber}`. Each step has a dedicated queue bound to its routing key. When the orchestrator advances a Package to the next step, it publishes a message with the appropriate routing key. Worker containers consume from step queues to pick up work. Dead letter exchanges capture failed messages for inspection and potential replay.

## Files and Folders
- `/apps/api/src/modules/workflows/assembly-lines/assembly-line.queues.ts` — Exchange, queue, and routing key constants and factory functions

## Acceptance Criteria
- [ ] Exports exchange name constant: `ASSEMBLY_EXCHANGE = 'smithy.assembly'` (topic type)
- [ ] Exports dead letter exchange name: `ASSEMBLY_DLX = 'smithy.assembly.dlx'` (direct type)
- [ ] Exports queue name factory: `getStepQueueName(lineSlug: string, stepNumber: number): string` → `assembly.{lineSlug}.step.{stepNumber}`
- [ ] Exports routing key factory: `getStepRoutingKey(lineSlug: string, stepNumber: number): string` → `assembly.{lineSlug}.step.{stepNumber}`
- [ ] Exports dead letter queue name factory: `getStepDLQName(lineSlug: string, stepNumber: number): string` → `assembly.{lineSlug}.step.{stepNumber}.dlq`
- [ ] Exports `declareAssemblyTopology(channel: Channel, lineSlug: string, stepCount: number): Promise<void>` that idempotently creates the exchange, DLX, and all step queues with bindings
- [ ] Each step queue is configured with: `x-dead-letter-exchange: ASSEMBLY_DLX`, `x-dead-letter-routing-key: {dlqName}`, `durable: true`
- [ ] Dead letter queues are bound to the DLX with their respective routing keys
- [ ] All declarations are idempotent — calling `declareAssemblyTopology` multiple times has no adverse effects
- [ ] Queue and exchange names use only lowercase alphanumeric characters, dots, and hyphens

## Implementation Notes
- Use `amqplib`'s `channel.assertExchange()` and `channel.assertQueue()` for idempotent declarations — these are no-ops if the exchange/queue already exists with the same configuration.
- The `declareAssemblyTopology` function should be called when an Assembly Line is created (task 043) to set up its queues before any packages are submitted.
- Dead letter exchanges capture messages that are rejected or expire. The DLQ naming convention mirrors the main queue with a `.dlq` suffix.
- Consider adding message TTL on step queues (e.g., 24 hours) so unprocessed messages don't accumulate indefinitely. This is configurable via `x-message-ttl` on the queue.
- The `Channel` type comes from `amqplib`. If task 067 wraps the connection, accept whatever abstraction it provides.
- For testing, the topology declarations can be verified by checking that `assertExchange` and `assertQueue` were called with the correct arguments on a mock channel.
- Consider exporting a `teardownAssemblyTopology` function for cleanup when an Assembly Line is deleted (delete queues and bindings, not the shared exchange).
