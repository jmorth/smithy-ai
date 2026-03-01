# Summary
A lightweight, easily extended framework for orchestrating AI agents called Smithy.

## High-level summary

Smithy handles inputs from a user (or process via API call) and transforms the input by moving along like workers in a factory. The UI/UX can either be a traditional "Managerial Looking" interface, or a graphical "Factory" interface with 16-bit sprites.

### Key terms
- Packages
  - Various types exist (user input, specification, code, image, PR) but a package has a singular type
  - Some types are provided by default, user may define others
  - Contain files that are defined by its type
  - Represent inputs/outputs of Workers

- Workers
  - AI agents that accept one or more types of Packages
  - May be interactive (asks user/caller questions and potentially responds with more questions) or non-interactive
  - Have their own prompts, tooling, transforms, etc.
  - Execute defined steps and then create an output Package 
  - Have clearly-defined states: waiting, working, done, stuck (needs feedback from a user or process), or error (user must determine retry approach)

- Assembly Line
  - Strict workflow with clearly defined steps: Worker A hands output to Worker B which hands output to Worker C
  - Scale out by permitting up to (Steps - 1) packages on the line at once
  - Scale up by adding more Assembly Lines

- Worker Pools
  - Loose workflow where Workers wait to receive Packages that match their input types, and then queue their outputs when done
  - Scale up by adding additional Workers

## Technical decisions
- TypeScript for frontend and backend
- Message bus (RabbitMQ or similiar) for events
- PostgreSQL for data storage
- Redis for caching
- Docker Compose for local development/on-prem deployment
- Railway for cloud deployment
- Resend for email notifications
- Phaser for graphical "Factory" interface (acts like a visual representation of a Dashboard, not "game-ified")