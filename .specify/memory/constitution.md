<!--
Sync Impact Report
Version change: unratified template -> 1.0.0
Modified principles: template placeholders -> five OpsPilot core principles
Added sections: Technology Stack and Runtime; Development Workflow
Removed sections: none
Follow-up TODOs: none
-->
# OpsPilot Constitution

## Core Principles

### I. Explicit MVC Layers and Pure Domain Logic
HTTP and CLI controllers MUST validate boundary data and delegate use cases to services. Services
orchestrate application behavior; models and persistence adapters own database access. Domain rules
MUST be pure and MUST NOT perform I/O. Dependencies flow from controllers to services to models or
stores. This separation keeps behavior deterministic and testable.

### II. Validate at Boundaries with Zod
All external HTTP and CLI input MUST be parsed with Zod before entering application logic. Data sent
out through these boundaries MUST also be validated with Zod schemas. Invalid data MUST NOT cross a
boundary.

### III. Represent Domain Errors Explicitly
Expected domain failures MUST be represented by error classes. HTTP and CLI boundary adapters MUST
translate those errors into the appropriate status and response format. Domain and service layers
MUST NOT encode transport-specific responses.

### IV. Tests and Quality Gates
Every new behavior MUST include tests using `node:test` via `tsx`. Tests are part of the task, and
changes MUST pass `npm run typecheck` and `npm test` before completion.

### V. Security by Default
Secrets MUST NOT be committed or hard-coded. Agents MUST NOT read the contents of `.env`; terminal
commands that could inspect it MUST require explicit approval. Destructive actions MUST use explicit
guardrails and human review, not model discretion alone.

## Technology Stack and Runtime

The project targets Node.js 22 LTS and uses TypeScript ESM with `strict: true`. The HTTP API uses
Express; persistence uses Sequelize with MySQL. Zod is the validation library at HTTP and CLI
boundaries. The production-alert and incident agent uses LangChain/LangGraph with OpenRouter.

## Development Workflow

Changes MUST follow the Spec Kit sequence: `/speckit.specify` -> `/speckit.plan` -> `/speckit.tasks`
-> `/speckit.implement`, with human review between phases. Specs MUST be versioned. Tasks MUST be
small, reversible, and independently verifiable; each task MUST fit in one focused, reviewable
commit.

## Governance

This constitution supersedes conflicting project practices. Changes to it MUST be reviewed, include
a rationale, update the version and last-amended date, and follow semantic versioning: MAJOR for
incompatible governance changes, MINOR for new or materially expanded principles, and PATCH for
clarifications or non-semantic edits. Specs, plans, tasks, and code reviews MUST be checked for
compliance. Runtime guidance is maintained in `.github/copilot-instructions.md`.

**Version**: 1.0.0 | **Ratified**: 2026-10-17 | **Last Amended**: 2026-10-17
