# Task 099: Create Package Detail Page

## Summary
Create the Package detail page with metadata display, status timeline, file viewer with download capability, job execution history, and an interactive response UI for answering questions from STUCK Workers. This is the comprehensive view for tracking a single Package through the system.

## Phase
Phase 5: Frontend Dashboard

## Dependencies
- **Depends on**: 098 (Package List Page — provides hooks and navigation), 087 (Socket.IO Client — real-time updates and interactive responses)
- **Blocks**: None

## Architecture Reference
The Package detail page combines multiple data sources: the Package entity (metadata, status, files), its job execution history (from the jobs API), and real-time status updates (from Socket.IO). The interactive response UI is the human-in-the-loop feature — when a Worker encounters something it cannot resolve, it marks the job as STUCK and emits a question via Socket.IO. The dashboard renders the question and an answer form, and the user's response is sent back via the `/interactive` Socket.IO namespace.

## Files and Folders
- `/apps/web/src/pages/packages/[id].tsx` — Package detail page composing all sub-components
- `/apps/web/src/pages/packages/components/package-files.tsx` — File list with download links and text/code preview
- `/apps/web/src/pages/packages/components/job-history.tsx` — Job execution timeline
- `/apps/web/src/pages/packages/components/interactive-response.tsx` — Question display and answer form for STUCK jobs

## Acceptance Criteria
### Package Info
- [ ] Displays Package metadata: ID (full), type (badge), status (colored badge), created date, updated date
- [ ] Displays workflow context: which Assembly Line or Worker Pool the Package belongs to, with link
- [ ] Displays custom metadata as a key-value table (from the Package's metadata object)

### Status Timeline
- [ ] Visual timeline showing the Package's progression through states with timestamps
- [ ] Each state change rendered as a node on a vertical timeline: `created -> queued -> processing -> [step N] -> completed`
- [ ] Each node shows: state name, timestamp, duration in state
- [ ] Current state is highlighted and shown as active (e.g., pulsing dot)
- [ ] Failed state shows error message inline

### File Viewer
- [ ] Lists all Package files: filename, size (formatted: KB/MB), MIME type
- [ ] Download button per file: fetches a presigned download URL from the API and opens it
- [ ] Text/code preview: for files with text MIME types (text/*, application/json, application/yaml), show file contents inline with syntax highlighting
- [ ] Preview uses a code block with monospace font; syntax highlighting is optional but preferred (e.g., via `highlight.js` or `prism`)
- [ ] Image preview: for image MIME types, show a thumbnail

### Job History
- [ ] Timeline of job executions for this Package, ordered newest first
- [ ] Each job entry shows: Job ID, Worker name and version, status (badge), started at, duration, exit code (if completed/failed)
- [ ] Clicking a job entry expands to show log output snippet or links to the log viewer
- [ ] Jobs in progress show a running duration counter

### Interactive Response
- [ ] When the current job status is STUCK, prominently display the interactive response section
- [ ] Shows the question text from the Worker (received via Socket.IO or fetched from API)
- [ ] Provides a textarea for the user to type an answer
- [ ] "Submit Answer" button sends the response via Socket.IO's `/interactive` namespace using `sendInteractiveResponse(jobId, response)`
- [ ] Shows a confirmation message after the answer is sent
- [ ] Hides the interactive section when the job resumes (status changes from STUCK)
- [ ] Subscribes to the job-specific Socket.IO room for real-time status updates

## Implementation Notes
- The page has multiple data requirements. Consider using parallel `useQuery` calls: one for the Package entity, one for its files, one for its job history. Alternatively, if the API returns all data in a single response, use one query.
- The status timeline can be built with a vertical flexbox and CSS: left-aligned dots connected by lines, with labels to the right. Use Tailwind's `border-l` for the connecting line and `rounded-full` for the dots.
- For file preview, lazy-load the file content only when the user clicks "Preview". Use a separate fetch to get the file content via presigned URL. Don't load all file previews on page load.
- The interactive response section should be visually prominent (e.g., yellow/amber background, alert icon) to grab the user's attention when a Package is stuck.
- Subscribe to the Socket.IO room on mount: `subscribeJob(jobId)` where `jobId` is the current active job for this Package. Listen for `job.stuck` events (to show the question) and `job.resumed` / `job.completed` events (to hide the interactive section).
- The answer textarea should support multi-line input. Consider adding a "common responses" dropdown for frequently used answers.
- For the job history, if the Package has been through multiple steps (Assembly Line), show which step each job corresponds to.
