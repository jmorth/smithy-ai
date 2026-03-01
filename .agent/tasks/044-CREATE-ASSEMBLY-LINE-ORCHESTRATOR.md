# Task 044: Create Assembly Line Orchestrator

## Summary
Create the `AssemblyLineOrchestratorService` that listens for job completion events and routes Packages through their Assembly Line steps. When a Worker completes processing a Package, the orchestrator advances it to the next step or marks it as completed on the final step. This is the core workflow engine that drives the sequential processing pipeline.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 043 (Assembly Line Service), 067 (Event Bus Module — provides RabbitMQ event infrastructure)
- **Blocks**: 046 (Assembly Line REST Controller — monitoring endpoints use orchestrator state)

## Architecture Reference
The orchestrator is an event-driven service that reacts to `job.completed`, `job.failed`, and `job.stuck` events published by Worker containers via RabbitMQ. It queries the Assembly Line definition to determine the next step, publishes a message to the appropriate Worker queue, and updates the Package's `current_step` and status. The orchestrator must be idempotent — receiving the same completion event twice should not advance the Package twice.

## Files and Folders
- `/apps/api/src/modules/workflows/assembly-lines/assembly-line-orchestrator.service.ts` — Orchestrator service with event handlers

## Acceptance Criteria
- [ ] Listens for `job.completed` events from the RabbitMQ event bus
- [ ] On `job.completed`: looks up the Package's Assembly Line and current step; if not the final step, advances `current_step` and publishes to the next step's Worker queue
- [ ] On final step `job.completed`: updates Package status to `COMPLETED`, emits `assembly-line.completed` event
- [ ] Listens for `job.failed` events: updates Package status to `FAILED`, records error details
- [ ] Listens for `job.stuck` events: updates Package status appropriately, logs a warning
- [ ] Idempotent handling: if the Package's `current_step` has already advanced past the reported step, the event is acknowledged and ignored (no duplicate advancement)
- [ ] Uses database transactions for step advancement (update current_step + publish message atomically where possible)
- [ ] Logs all state transitions at info level with Package ID, Assembly Line slug, and step number

## Implementation Notes
- This task depends on task 067 (Event Bus Module) which provides the RabbitMQ integration. If implementing before 067 is complete, define the expected event interfaces and use a local EventEmitter as a placeholder. The orchestrator should be designed against interfaces, not concrete RabbitMQ implementations.
- Idempotency approach: before advancing, check that `package.current_step === reportedStep`. If `package.current_step > reportedStep`, the event is stale — log and skip. If `package.current_step < reportedStep`, something is wrong — log an error.
- For publishing to the next step's Worker queue, use the queue naming convention from task 045: `assembly.{lineSlug}.step.{stepNumber}`.
- Consider a simple state diagram:
  ```
  submit → step 1 (IN_TRANSIT) → step 1 completes → step 2 (IN_TRANSIT) → ... → final step completes → COMPLETED
                                ↘ step fails → FAILED
  ```
- The orchestrator should NOT retry failed jobs automatically in MVP. A manual retry mechanism (re-submit) can be added later.
- Test the orchestrator with mock events — it should be possible to simulate the full lifecycle of a Package through an Assembly Line by publishing synthetic events.
