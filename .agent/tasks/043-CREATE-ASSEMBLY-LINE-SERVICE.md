# Task 043: Create Assembly Line Service

## Summary
Create the `AssemblyLinesService` with CRUD operations for Assembly Lines and step management. An Assembly Line is an ordered sequence of Worker version steps that a Package flows through sequentially. This service handles creating lines with validated step ordering, CRUD operations, and the submit flow that creates a Package and feeds it into the first step.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 024 (Database Provider Module), 016 (Assembly Line Schema), 015 (Worker Schema)
- **Blocks**: 044 (Assembly Line Orchestrator), 046 (Assembly Line REST Controller)

## Architecture Reference
Assembly Lines are the primary workflow primitive in Smithy. They define a pipeline: Package enters at step 1, is processed by Worker version A, the output flows to step 2 (Worker version B), and so on until the final step completes. The `assembly_lines` table stores the line metadata and the `assembly_line_steps` table stores the ordered steps with foreign keys to `worker_versions`. The service validates step integrity (sequential ordering, valid worker version references) on creation and modification.

## Files and Folders
- `/apps/api/src/modules/workflows/assembly-lines/assembly-lines.service.ts` — Service with CRUD and step management
- `/apps/api/src/modules/workflows/assembly-lines/dto/create-assembly-line.dto.ts` — DTO for creating an assembly line with steps
- `/apps/api/src/modules/workflows/assembly-lines/dto/update-assembly-line.dto.ts` — DTO for updating assembly line metadata

## Acceptance Criteria
- [ ] `CreateAssemblyLineDto`: `name` (required string), `description` (optional string), `steps` (required array of `{ workerVersionId: UUID, configOverrides?: Record<string, unknown> }`, min 1 step)
- [ ] `create(dto)` generates slug from name, validates all `workerVersionId` references exist, assigns step numbers sequentially (1, 2, 3...), inserts assembly line and steps in a transaction
- [ ] `create(dto)` throws ConflictException if slug already exists
- [ ] `create(dto)` throws BadRequestException if any workerVersionId does not exist or is DEPRECATED
- [ ] `findAll()` returns all assembly lines with step count and status
- [ ] `findBySlug(slug)` returns assembly line with full step details (including worker name, version number per step)
- [ ] `update(slug, dto)` updates name, description, status (pause/resume); regenerates slug on name change
- [ ] `archive(slug)` soft-deletes the assembly line
- [ ] `submit(slug, packageData)` creates a new Package with status `IN_TRANSIT`, sets `current_step = 1`, associates it with the assembly line; returns the created Package
- [ ] Step ordering is validated: no gaps, starts at 1, sequential
- [ ] All operations use database transactions where multiple tables are modified

## Implementation Notes
- The `submit` method is the entry point for the Assembly Line workflow. It creates a Package record and should emit an event or publish a message to trigger the orchestrator (task 044). For now, it can create the package and return — the orchestrator integration comes in task 044.
- Steps are stored with explicit `step_number` values (1-indexed). When creating, iterate the input array and assign `step_number = index + 1`.
- For `findBySlug`, use Drizzle's relational queries or explicit joins to include step details with worker name and version number. This requires joining `assembly_line_steps` → `worker_versions` → `workers`.
- Consider allowing step reordering in a future task. For MVP, steps are set at creation time and cannot be reordered without creating a new Assembly Line.
- Import `WorkersModule` (which exports `WorkersService`) to validate worker version references. Alternatively, validate directly via Drizzle queries on the `worker_versions` table.
- Use the same slug generation utility as Workers (extract to a shared utility if not already done).
