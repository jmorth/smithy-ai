# Task 032: Create Package Service

## Summary
Create the `PackagesService` with full CRUD operations (create, findAll, findById, update, soft delete) using Drizzle ORM, including pagination support with both cursor-based and offset-based strategies. This service encapsulates all database logic for the Package entity and is the central data layer for package management.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 024 (Database Provider Module), 014 (Package Schema), 031 (Package DTOs)
- **Blocks**: 033 (Package Status Machine), 034 (Package File Management), 035 (Package REST Controller)

## Architecture Reference
The `PackagesService` injects the Drizzle client via `@Inject(DRIZZLE)` and operates on the `packages` and `package_files` tables defined in task 014. All queries use Drizzle's typed query builder for compile-time safety. Soft deletion sets `deleted_at` rather than removing rows, and all queries filter out soft-deleted records by default. The service follows the Repository pattern — controllers call service methods, never Drizzle directly.

## Files and Folders
- `/apps/api/src/modules/packages/packages.service.ts` — Service with CRUD and pagination methods

## Acceptance Criteria
- [ ] `create(dto: CreatePackageDto): Promise<Package>` — inserts a new package with status `PENDING`, returns the created record
- [ ] `findAll(query: PaginationQuery): Promise<{ data: Package[], cursor?: string, total: number }>` — supports cursor-based pagination (using `id` as cursor) and offset pagination
- [ ] `findAll` supports filtering by: `type`, `status`, `assemblyLineId`, date range (`createdAfter`, `createdBefore`)
- [ ] `findById(id: string): Promise<Package>` — returns a single package with its associated files; throws `NotFoundException` if not found
- [ ] `update(id: string, dto: UpdatePackageDto): Promise<Package>` — updates mutable fields (type, metadata, status); throws `NotFoundException` if not found
- [ ] `softDelete(id: string): Promise<void>` — sets `deleted_at` timestamp; throws `NotFoundException` if not found
- [ ] All queries automatically exclude soft-deleted records (`WHERE deleted_at IS NULL`)
- [ ] `findById` returns the package with related `package_files` rows joined
- [ ] Pagination default limit is 20, maximum is 100
- [ ] All methods use parameterized queries (no SQL injection risk)

## Implementation Notes
- Inject the Drizzle client: `constructor(@Inject(DRIZZLE) private db: DrizzleClient)`.
- Use Drizzle's `eq()`, `and()`, `gte()`, `lte()`, `isNull()` operators for building WHERE clauses.
- For cursor pagination: `WHERE id > :cursor ORDER BY id ASC LIMIT :limit + 1` — fetch one extra to determine if there's a next page.
- For the `findAll` method, consider building the query dynamically based on which filters are provided. Drizzle supports composing conditions with `and()`.
- The `findById` with files can use Drizzle's relational queries (`db.query.packages.findFirst({ with: { files: true } })`) if relations are defined in the schema, or a left join.
- Use `returning()` on insert and update operations to get the full record back without a separate SELECT.
- Do not implement status transition validation in this service — that belongs in task 033 (Package Status Machine). This service accepts any status value that passes DTO validation.
