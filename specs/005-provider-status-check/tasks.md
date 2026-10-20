# Tasks: Provider Status Check

**Input**: Design documents from `/specs/005-provider-status-check/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/check-provider-status.md, quickstart.md

**Tests**: Included because the specification explicitly requires network-free tests using an injectable fetch function.

**Organization**: Tasks are grouped by user story; US2 extends the status tool introduced in US1.

## Phase 1: Setup

**Purpose**: Project setup is already complete: the existing TypeScript project, Zod dependency, agent-tool module, and test runner are in place.

No setup tasks are required.

---

## Phase 2: Foundational

**Purpose**: Establish the injectable fetch seam that both independently testable stories use.

- [X] T001 Add an injectable fetch dependency for the provider status check, preserving the default runtime fetch behavior, in `src/agents/tools.ts`

**Checkpoint**: Provider status requests can be supplied a fake fetch in tests without changing behavior of existing operational tools.

---

## Phase 3: User Story 1 - Check an external provider (Priority: P1) 🎯 MVP

**Goal**: Let an on-call operator check GitHub or Cloudflare and receive a compact status indicator and description.

**Independent Test**: Use a fake fetch to verify that omitted provider selects GitHub, explicit `cloudflare` selects Cloudflare, and successful results include both status fields on one line.

### Tests for User Story 1

- [X] T002 [US1] Add fake-fetch tests for GitHub default selection, Cloudflare selection, fixed endpoint mapping, and compact successful output in `src/agents/tools.test.ts`

### Implementation for User Story 1

- [X] T003 [US1] Define the provider input schema with `github` and `cloudflare` choices and GitHub default, validate the status payload with Zod, implement successful status lookup, and expose `check_provider_status` through the operational tool factory in `src/agents/tools.ts`

**Checkpoint**: The operator can check either provider and receive its indicator and description on one line, without network access in tests.

---

## Phase 4: User Story 2 - Receive a useful result when a status check fails (Priority: P2)

**Goal**: Keep the status check bounded and useful when provider requests fail or return unusable data.

**Independent Test**: Using fake fetch, verify a five-second timeout per attempt, a maximum of two attempts after timeout/network/5xx failures, no retry for invalid payloads or other non-5xx HTTP failures, and readable final tool results without escaping exceptions.

### Tests for User Story 2

- [X] T004 [US2] Add fake-fetch tests for timeout, network and 5xx retry behavior and attempt limits, malformed payloads, non-retryable HTTP failures, and readable final results in `src/agents/tools.test.ts`

### Implementation for User Story 2

- [X] T005 [US2] Apply `AbortSignal.timeout(5000)` to each request, retry timeout/network/5xx failures exactly once, return readable results for final failures, and ensure successful output remains on one line in `src/agents/tools.ts`

**Checkpoint**: All final failure conditions return readable tool-result text and never escape as exceptions from the tool.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Validate the integrated behavior and project quality gates.

- [X] T006 Run the focused provider status test and repository typecheck and test suite using the commands documented in `specs/005-provider-status-check/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No work required; project initialization is already complete.
- **Foundational (Phase 2)**: T001 creates the injection seam required by both stories.
- **User Stories (Phase 3+)**: US1 depends on T001. US2 depends on the tool and successful behavior delivered by US1 because both stories extend the same tool and source/test files.
- **Polish (Phase 5)**: T006 depends on completion of US1 and US2.

### User Story Dependencies

- **User Story 1 (P1)**: Starts after T001; no dependency on another story.
- **User Story 2 (P2)**: Starts after US1; extends its tool behavior to cover resilience and final failure results.

### Within Each User Story

- Tests are specified before their corresponding implementation task.
- The fake fetch injection seam must be in place before US1 tests and implementation.
- US2 tests and implementation follow US1 because they exercise and extend the same tool and test module.

### Dependency Graph

```text
T001
 └── US1: T002 → T003
      └── US2: T004 → T005
           └── T006
```

### Parallel Opportunities

- No implementation tasks are safely parallelizable: the stories modify the same agent tool and test files, and later tasks depend on earlier behavior.
- After T001, test authoring tasks T002 and T004 target `src/agents/tools.test.ts` and cannot run concurrently; T004 also depends on the US1 tool contract.
- Independent review of the contract and data-model documentation can occur alongside coding, but no separate task is needed because these documents are already complete.

## Parallel Example: User Story 1

US1's test and implementation tasks share a serial, test-first dependency; do not run them in parallel:

```text
T002 (write success/default/provider tests) → T003 (implement provider status tool)
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001 to make the fetch implementation injectable.
2. Complete T002 and T003 to deliver and independently validate successful checks for both providers.
3. Stop and verify the focused tests; this is the first demonstrable increment.

### Incremental Delivery

1. Deliver US1 with provider selection and compact successful observations.
2. Deliver US2 with bounded retries and readable final failure results.
3. Complete T006 to run the focused and repository-wide quality checks.

### Parallel Team Strategy

The implementation is a small, shared-file change; parallel story implementation is not recommended. Keep the listed tasks sequential to avoid conflicts in `src/agents/tools.ts` and `src/agents/tools.test.ts`.

## Notes

- `[P]` is omitted because no task can safely run in parallel without a dependency or shared-file conflict.
- Every task has a sequential ID, checkbox, appropriate story label, and explicit file path(s).
- Status observations are not persisted; no database or migration work is required.
