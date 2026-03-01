# Task 026: Create Global Validation Pipe

## Summary
Configure a global `ValidationPipe` with `class-validator` and `class-transformer` for automatic DTO validation on all incoming requests. Whitelist mode strips unknown properties, and transform mode converts plain JSON objects to typed class instances, enabling decorator-based validation across all controllers.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 022 (Bootstrap NestJS Application)
- **Blocks**: 031 (Package DTOs), 037 (Worker DTOs), 043 (Assembly Line Service) — all DTOs rely on validation being active

## Architecture Reference
NestJS pipes transform and validate incoming data before it reaches controller handlers. The `ValidationPipe` uses `class-validator` decorators on DTO classes to enforce constraints and `class-transformer` to convert plain objects to class instances. This pipe is registered globally so every controller parameter decorated with a DTO class is automatically validated. The pipe works in conjunction with the global exception filter (task 025) — validation failures throw `BadRequestException` which the filter formats into the standard error shape.

## Files and Folders
- `/apps/api/src/common/pipes/validation.pipe.ts` — Custom validation pipe configuration (or inline in `main.ts` if simple enough)
- `/apps/api/src/main.ts` — Updated to register the validation pipe globally via `app.useGlobalPipes()`

## Acceptance Criteria
- [ ] `ValidationPipe` is registered globally in `main.ts`
- [ ] `whitelist: true` — properties not decorated with class-validator decorators are automatically stripped from the payload
- [ ] `forbidNonWhitelisted: true` — requests with unknown properties return a 400 error instead of silently stripping
- [ ] `transform: true` — plain objects are automatically transformed to DTO class instances
- [ ] `transformOptions.enableImplicitConversion: true` — path/query params are auto-converted to their declared types
- [ ] Invalid DTOs return 400 with an array of human-readable validation error messages
- [ ] Validation errors include the property name and constraint that failed (e.g., `"name must be a string"`)
- [ ] Nested object validation works when DTOs contain nested validated classes (using `@ValidateNested()` and `@Type()`)
- [ ] `class-validator` and `class-transformer` are installed as dependencies

## Implementation Notes
- The simplest approach is to configure the pipe directly in `main.ts`:
  ```typescript
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));
  ```
- If custom error formatting is needed (e.g., flattening nested validation errors), create a custom `exceptionFactory` option on the pipe.
- Install: `pnpm --filter api add class-validator class-transformer`
- `class-transformer` requires `"emitDecoratorMetadata": true` and `"experimentalDecorators": true` in `tsconfig.json` — verify these are set from task 003.
- The `forbidNonWhitelisted` option is intentionally strict for an API — it prevents clients from sending junk fields that could indicate a misunderstanding of the API contract.
- For query parameters, `enableImplicitConversion` is critical because query params arrive as strings but DTOs may declare them as `number` or `boolean`.
