# Task 096: Create Package Submission Dialog

## Summary
Create a reusable Package submission dialog component that can be triggered from Assembly Lines and Worker Pools. It includes a package type selector, a metadata key-value editor, and a file upload area with drag-and-drop support. This is the primary interface for injecting new work into the system.

## Phase
Phase 5: Frontend Dashboard

## Dependencies
- **Depends on**: 086 (API Client — creates Package, uploads files), 085 (Tailwind + shadcn — provides Dialog, Input, Button components)
- **Blocks**: None

## Architecture Reference
The Package submission dialog is a modal that creates a new Package entity via the API, then uploads associated files using presigned URLs. The flow is: (1) user fills in type and metadata, (2) user attaches files, (3) on submit, the dialog calls `POST /api/packages` to create the Package, (4) for each file, it requests a presigned upload URL from `POST /api/packages/:id/files/upload-url`, (5) uploads the file directly to S3 via the presigned URL, (6) confirms the upload via `POST /api/packages/:id/files/confirm`. The dialog is parameterized by the target (Assembly Line slug or Worker Pool slug) and calls the appropriate submission endpoint after creation.

## Files and Folders
- `/apps/web/src/components/package-submit-dialog.tsx` — Reusable Package submission dialog with type selector, metadata editor, file upload, and multi-step submission flow

## Acceptance Criteria
- [ ] Dialog opens via a `<PackageSubmitDialog>` component accepting `target: { type: 'assembly-line' | 'worker-pool'; slug: string }` and `open/onOpenChange` props
- [ ] Package type selector: dropdown with default types (e.g., "document", "image", "data", "code") plus a "Custom" option that reveals a text input for arbitrary type strings
- [ ] Metadata editor: dynamic key-value pair rows; each row has a key input and value input; "Add Row" button appends a new pair; "Remove" button on each row removes it
- [ ] File upload area: drag-and-drop zone plus a "Browse" button; shows file names and sizes for selected files; supports multiple files; remove button per file
- [ ] Submit button initiates the multi-step submission flow: create Package -> upload files -> submit to target
- [ ] Progress indicator during submission: shows current step (creating, uploading file 1/N, submitting)
- [ ] On success: closes the dialog and shows a toast notification with the new Package ID
- [ ] On error: shows an inline error message with the failure reason; does NOT close the dialog
- [ ] Cancel button closes the dialog without submitting
- [ ] Form resets when the dialog is closed and reopened
- [ ] Submit button is disabled when required fields are empty (type is required)
- [ ] File upload handles large files without blocking the UI (uses XMLHttpRequest or fetch with progress)

## Implementation Notes
- Use shadcn's Dialog component as the container. The dialog should be controlled (`open` and `onOpenChange` props) so the parent component manages open/close state.
- The metadata key-value editor should start with one empty row and allow adding more. Remove all empty rows on submission (don't send empty key-value pairs).
- For the file upload zone, use an `<input type="file" multiple>` hidden behind a styled drop zone `<div>` with `onDragOver`, `onDragLeave`, `onDrop` handlers. Show visual feedback (border highlight) when files are dragged over.
- File upload progress: if using `fetch`, progress tracking is limited. For per-file progress bars, use `XMLHttpRequest` with `upload.onprogress`. Alternatively, show an indeterminate progress bar.
- The multi-step submission flow should handle partial failures gracefully: if file upload fails for one file, report the error but still show which files succeeded. Consider a retry button per file.
- The dialog should be wide enough to accommodate the metadata editor and file list side by side on desktop, stacking on mobile. Use `max-w-2xl` or similar.
- Presigned URL upload (PUT directly to S3) means the file never passes through the API server. This is important for large files. The dialog needs to PUT the file with the correct `Content-Type` header.
