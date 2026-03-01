# Task 035: Create Package REST Controller

## Summary
Create the `PackagesController` with all REST endpoints for Package CRUD and file management operations, wiring up the `PackagesModule` that ties together the controller, service, and all dependencies. This is the public API surface for package management.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 032 (Package Service), 033 (Package Status Machine), 034 (Package File Management)
- **Blocks**: 036 (Package Module Tests)

## Architecture Reference
The controller follows standard NestJS REST conventions with the `/api/packages` base path. It delegates all business logic to `PackagesService` and returns appropriate HTTP status codes. The `PackagesModule` is a feature module imported into `AppModule` that declares the controller and provides the service. File operations are nested under the package route: `/api/packages/:id/files/*`.

## Files and Folders
- `/apps/api/src/modules/packages/packages.controller.ts` — REST controller with all package and file endpoints
- `/apps/api/src/modules/packages/packages.module.ts` — Feature module wiring controller, service, and imports

## Acceptance Criteria
- [ ] `POST /api/packages` — Creates a package, returns 201 with the created package
- [ ] `GET /api/packages` — Lists packages with pagination and filters, returns 200
- [ ] `GET /api/packages/:id` — Returns a single package with files, returns 200; 404 if not found
- [ ] `PATCH /api/packages/:id` — Updates a package, returns 200; 400 on invalid status transition; 404 if not found
- [ ] `DELETE /api/packages/:id` — Soft deletes a package, returns 204; 404 if not found
- [ ] `POST /api/packages/:id/files/presign` — Returns presigned upload URL, returns 200; 404 if package not found
- [ ] `POST /api/packages/:id/files/confirm` — Confirms file upload, returns 201; 404 if package not found
- [ ] `GET /api/packages/:id/files` — Lists package files, returns 200
- [ ] `DELETE /api/packages/:id/files/:fileId` — Deletes a file, returns 204; 404 if not found
- [ ] All endpoints use appropriate DTO classes for request body/query validation
- [ ] `:id` parameters are validated as UUIDs via `ParseUUIDPipe`
- [ ] `PackagesModule` imports `StorageModule` (or relies on its global status)
- [ ] `PackagesModule` is imported in `AppModule`

## Implementation Notes
- Use `@Controller('packages')` — the `/api` prefix is added globally in `main.ts`.
- Apply `@HttpCode()` decorators where the default status code is not desired (e.g., `@HttpCode(HttpStatus.NO_CONTENT)` for DELETE).
- Use `@Param('id', ParseUUIDPipe)` for UUID validation on path parameters.
- For the paginated list endpoint, accept query parameters via a `PaginationQueryDto` class.
- The controller should be thin — no business logic, just parameter extraction, service delegation, and response formatting.
- Consider adding `@ApiTags('packages')` and other Swagger decorators if `@nestjs/swagger` is planned. For MVP, this is optional.
- The `PackagesModule` should declare `providers: [PackagesService]` and `controllers: [PackagesController]`. If StorageModule is `@Global()`, no explicit import is needed.
