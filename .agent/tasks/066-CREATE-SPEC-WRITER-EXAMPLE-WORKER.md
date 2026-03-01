# Task 066: Create Spec Writer Example Worker

## Summary
Create the spec-writer example Worker — accepts `USER_INPUT` Packages, outputs `SPECIFICATION` Packages, and demonstrates the interactive STUCK state by calling `context.askQuestion()` to ask 2-3 clarifying questions before generating a detailed specification. This is the canonical example of a Worker that pauses execution to request human input.

## Phase
Phase 3: Worker Runtime

## Dependencies
- **Depends on**: 062 (Worker Base Docker Image — Dockerfile extends the base)
- **Blocks**: None

## Architecture Reference
The spec-writer Worker demonstrates the interactive question/answer flow. During `onProcess`, it reads the user's initial input, then calls `context.askQuestion()` multiple times to gather additional context. Each `askQuestion` call transitions the job to the STUCK state via the API, pauses execution, and waits for a human to provide an answer (via the frontend or API). Once all questions are answered, the Worker uses the combined input to generate a detailed specification document via AI. This example exercises the full STUCK-state pipeline: Worker SDK → API → Socket.IO → Frontend → API → Worker SDK.

## Files and Folders
- `/workers/examples/spec-writer/worker.yaml` — Worker configuration for the spec writer
- `/workers/examples/spec-writer/worker.ts` — Worker implementation with interactive askQuestion calls
- `/workers/examples/spec-writer/Dockerfile` — Extends `smithy-worker-base:latest`

## Acceptance Criteria
- [ ] `worker.yaml` defines: `name: "spec-writer"`, `slug: "spec-writer"`, `inputTypes: ["USER_INPUT"]`, `outputType: "SPECIFICATION"`, provider config for AI
- [ ] `worker.ts` exports a class extending `SmithyWorker`
- [ ] `onProcess` reads the initial user input text from the input Package
- [ ] Calls `context.askQuestion()` at least 2-3 times with contextual clarifying questions (e.g., "What is the target audience?", "Are there any technical constraints?", "What is the desired timeline?")
- [ ] Questions may include `choices` option for multiple-choice answers where appropriate
- [ ] Each `askQuestion` call transitions the job to STUCK state, awaits the answer, then resumes
- [ ] After all questions are answered, combines original input + answers into a comprehensive AI prompt
- [ ] Calls `generateText` with a specification-writing system prompt to produce a detailed spec document
- [ ] Output Package contains `specification.md` with structured sections: Overview, Requirements, Constraints, Timeline, Acceptance Criteria
- [ ] Output metadata includes: `{ questionsAsked: number, model: string, generatedAt: string }`
- [ ] `Dockerfile` extends base image, copies worker files
- [ ] Docker image builds successfully

## Implementation Notes
- The `askQuestion` calls are sequential — each question's answer may inform the next question. For example, if the user says the target audience is "developers", the next question might ask about the programming language.
- Use conditional logic for follow-up questions: read the answer from the previous question and branch accordingly. This demonstrates that `askQuestion` is a real blocking call, not just a batch of questions.
- Example flow:
  1. Read input: "I want to build a task management app"
  2. Ask: "What is the target audience for this application?" (free text)
  3. Ask: "Which platform(s) should this support?" (choices: ["Web", "Mobile", "Desktop", "All"])
  4. Ask: "Are there any specific technical requirements or constraints?" (free text)
  5. Generate spec from all gathered context
- The specification prompt should be detailed and produce a document that could serve as a real project brief.
- This is the most complex example Worker and should be the go-to reference for developers building interactive Workers.
- Set a reasonable timeout for `askQuestion` (e.g., 30 minutes) — if no human responds, the Worker should fail gracefully rather than hang indefinitely.
