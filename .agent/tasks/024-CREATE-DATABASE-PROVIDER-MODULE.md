# Task 024: Create Database Provider Module

## Summary
Create a NestJS DatabaseModule that provides the Drizzle ORM client as an injectable service, connecting to PostgreSQL using configuration from the ConfigModule. This is the data access foundation — every feature module that reads or writes to the database depends on this provider.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 023 (Zod Configuration Module), 013 (Drizzle ORM Configuration), 018 (Audit Log Schema)
- **Blocks**: 031 (Package DTOs), 032 (Package Service), 038 (Worker Version Service), 043 (Assembly Line Service), 048 (Worker Pool Service) — all modules needing database access

## Architecture Reference
Drizzle ORM is the chosen query builder/ORM for Smithy. Task 013 set up `drizzle.config.ts` and the base database connection file. This task wraps that into a proper NestJS module with dependency injection so any service can `@Inject(DRIZZLE)` the typed Drizzle client. The Drizzle client uses `node-postgres` (`pg`) as the underlying driver with connection pooling via `pg.Pool`.

## Files and Folders
- `/apps/api/src/database/database.module.ts` — Global NestJS module that exports the Drizzle provider
- `/apps/api/src/database/database.provider.ts` — Factory provider that creates the Drizzle client from ConfigService database URL
- `/apps/api/src/database/database.constants.ts` — Injection token constant `DRIZZLE`

## Acceptance Criteria
- [ ] `DRIZZLE` injection token is exported from `database.constants.ts`
- [ ] Drizzle client is created using `drizzle(pool, { schema })` with the full schema from task 014-018
- [ ] `pg.Pool` is configured with connection string from `ConfigService` (`DATABASE_URL`)
- [ ] Connection pool settings are configurable: `max` (default 20), `idleTimeoutMillis` (default 30000), `connectionTimeoutMillis` (default 5000)
- [ ] DatabaseModule is decorated with `@Global()` so it does not need to be imported in every feature module
- [ ] Connection is verified on module initialization (e.g., a simple `SELECT 1` query)
- [ ] Pool is properly drained on application shutdown (`onModuleDestroy` lifecycle hook)
- [ ] Any service can inject the Drizzle client via `@Inject(DRIZZLE) private db: DrizzleClient`
- [ ] A TypeScript type alias `DrizzleClient` is exported for use in service constructors

## Implementation Notes
- Use `@Module({ providers: [drizzleProvider], exports: [drizzleProvider] })` with a custom factory provider.
- The factory provider pattern: `{ provide: DRIZZLE, inject: [ConfigService], useFactory: (config: ConfigService) => { ... } }`.
- Import all schema tables from the shared schema location (tasks 014-018) and pass them to `drizzle()` so relations and typed queries work.
- The `DrizzleClient` type should be inferred from `drizzle(pool, { schema })` return type — use `ReturnType<typeof drizzle>` or equivalent.
- Consider implementing `OnModuleDestroy` on the module class itself to call `pool.end()` during graceful shutdown.
- Do NOT use Drizzle's `migrate()` in the provider — migrations are run separately via CLI (`drizzle-kit push` or `drizzle-kit migrate`).
