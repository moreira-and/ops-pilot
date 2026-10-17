# Tasks: Camada Reflection

**Input**: Design documents from `/specs/002-reflection-layer/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Include deterministic `node:test` tasks as required by the feature acceptance scenarios and the project constitution.

**Organization**: Tasks are grouped by user story to support incremental implementation and validation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Task can run in parallel with another task because it touches different files and has no unfinished prerequisites.
- **[Story]**: User story label corresponding to `spec.md`.
- Every task includes its target file path.

## Phase 1: Setup

**Purpose**: Reuse the existing TypeScript project, dependencies, and test runner; no project initialization or new dependency is required.

No setup changes are required.

---

## Phase 2: Foundational

**Purpose**: Extend the shared trace contract before the decorator and stories consume Reflection critique events.

- [X] T001 Extend the `critique` variant in `src/agents/reasoning.ts` to validate Reflection events with required `approved` boolean and `feedback` string while preserving the existing `content` summary variant; add schema compatibility coverage in `src/agents/trace.test.ts`.

**Checkpoint**: Both Reflection critique events and current Plan-and-Execute critique summaries pass trace schema validation.

---

## Phase 3: User Story 1 - Respostas revisadas com limite (Priority: P1) 🎯 MVP

**Goal**: Decorate any reasoning strategy, evaluate each candidate, regenerate the complete strategy with feedback when rejected, and stop on approval or at the configured limit.

**Independent Test**: Use a fake strategy and fake structured critic to verify immediate approval, rejection followed by feedback-driven rerun, exhaustion at the default limit, zero reflections, and invalid limit rejection without network calls.

### Tests for User Story 1

- [X] T002 [US1] Add deterministic tests in `src/agents/reflection.test.ts` for immediate approval, rejected candidate followed by a rerun that receives the original request plus feedback, return of the latest rejected answer after the default two regenerations, zero reflections skipping critic creation, and rejection of negative or non-integer `maxReflections`.

### Implementation for User Story 1

- [X] T003 [US1] Implement `withReflection(strategy, opts)` in `src/agents/reflection.ts`, including validated options with default `maxReflections: 2`, structured critic output validation, candidate-versus-observation review using the shared model factory by default, complete strategy reruns with rejection feedback, stop-on-approval and bounded exhaustion, and contiguous merged trace sequence values; preserve all base trace events and return the most recent candidate.

**Checkpoint**: The decorator works with a test strategy and obeys approval, feedback, zero-bound, default-bound, and invalid-option behavior.

---

## Phase 4: User Story 2 - Auditoria do processo de reflexão (Priority: P2)

**Goal**: Make each critique visible in the trace, aggregate actual critic and strategy model calls, measure whole-run latency, and surface failures explicitly.

**Independent Test**: Compare a deterministic sequence of base runs and critic calls against the ordered critique trace and `llmCalls`; verify malformed critic output and failed critic/regeneration calls are never treated as approval.

### Tests for User Story 2

- [X] T004 [P] [US2] Add tests in `src/agents/reflection.test.ts` asserting exactly one ordered critique event per evaluated candidate with its `approved` and `feedback` fields, correctly sequenced merged trace, exact sum of base and critic model invocations including failed invocation starts, whole-wrapper latency, and explicit failure for invalid critic output or failed critique/regeneration.

### Implementation for User Story 2

- [X] T005 [P] [US2] Complete Reflection trace and metric handling in `src/agents/reflection.ts`: append one structured critique event per evaluation, aggregate each strategy result's `metrics.llmCalls` with critic calls counted through model invocation callbacks exactly once, measure `metrics.latencyMs` around the full wrapper run, and propagate invalid-output, critic, and regeneration failures without returning a candidate as approved.

**Checkpoint**: A caller can audit every critique, reproduce the exact model-call total, and distinguish execution failures from approval or rejection.

---

## Phase 5: User Story 3 - Seleção da reflexão na Arena (Priority: P2)

**Goal**: Expose the reflected ReAct and Plan-and-Execute variants as independent Arena selectors without changing existing selectors.

**Independent Test**: Parse each reflected selector and run the Arena with an injected strategy registry to verify that each selector calls the corresponding reflected strategy and preserves output ordering and result presentation.

### Tests for User Story 3

- [X] T006 [P] [US3] Add Arena tests in `src/arena.test.ts` verifying `reflect:react` and `reflect:plan-and-execute` are accepted, mapped to the corresponding reflected strategies, and can be selected alongside unchanged unreflected strategies without changing result ordering.

### Implementation for User Story 3

- [X] T007 [P] [US3] Update `src/arena.ts` to accept `reflect:react` and `reflect:plan-and-execute`, construct each by wrapping its existing strategy with `withReflection`, register both reflected names while retaining `react` and `plan-and-execute`, and keep existing validation and result presentation behavior.

**Checkpoint**: Both reflected selectors execute their matching strategy, and the two original selectors remain compatible.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the documented scenarios and project-wide quality gates after all stories are integrated.

- [X] T008 Run the deterministic validation scenarios from `specs/002-reflection-layer/quickstart.md` and correct any discrepancy in that guide or the implementation files `src/agents/reflection.test.ts` and `src/arena.test.ts`.
- [X] T009 Run `npm run typecheck` and `npm test`; resolve any feature-related failures in the affected source and test files `src/agents/reasoning.ts`, `src/agents/reflection.ts`, `src/agents/reflection.test.ts`, `src/arena.ts`, `src/arena.test.ts`, and `src/agents/trace.test.ts`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No changes required; existing project infrastructure is used.
- **Foundational (Phase 2)**: Must complete T001 before Reflection-specific trace events can be produced or validated.
- **User Story 1 (Phase 3)**: Depends on T001; delivers the core decorator and is the MVP.
- **User Story 2 (Phase 4)**: Depends on T001 and T003; augments the decorator and its focused tests with trace, metrics, and failure guarantees.
- **User Story 3 (Phase 5)**: Depends on T003 so the decorator is available to the Arena; can proceed independently of US2 after US1.
- **Polish (Phase 6)**: Depends on all selected stories, especially T005 and T007.

### User Story Dependencies

- **US1 (P1)**: Starts after the foundational trace contract. No dependency on another user story.
- **US2 (P2)**: Depends on US1's decorator implementation; tests the auditing and failure behavior of that decorator.
- **US3 (P2)**: Depends on US1's decorator implementation; does not depend on US2.

### Dependency Graph

```text
T001
  └── T002 -> T003
        ├── T004 -> T005 ─┐
        └── T006 -> T007 ─┴── T008 -> T009
```

### Parallel Opportunities

- No implementation tasks are safely parallel before T003 because all story work relies on the shared decorator and trace contract.
- After T003, US2 tasks T004-T005 and US3 tasks T006-T007 can proceed in parallel as they primarily touch different test/source files.
- T008 and T009 are sequential validation tasks and should run after the story implementations are integrated.

---

## Parallel Example: User Stories 2 and 3

```text
# After T003 is complete, start T004 and T006 in parallel, then
# implement their separate files with T005 and T007 in parallel:
Track A: T004 -> T005  # Reflection trace, metrics, and failure behavior
Track B: T006 -> T007  # Arena selectors and reflected strategy registration
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Confirm Phase 1 requires no changes.
2. Complete T001 to establish the compatible trace contract.
3. Complete T002 and T003 to deliver the decorator and its bounded review behavior.
4. Validate User Story 1 independently with `node --import tsx --test src/agents/reflection.test.ts`.
5. Stop for review if the core reflection lifecycle or repeated tool side effects need reconsideration before adding Arena selectors.

### Incremental Delivery

1. Complete T001-T003 and validate the core decorator as the MVP.
2. Complete T004-T005 to deliver auditable critiques, exact call metrics, and explicit error handling.
3. Complete T006-T007 to expose both reflected strategies through Arena.
4. Complete T008-T009 to validate the quickstart, strict typecheck, and full test suite.

## Notes

- All tasks are unchecked and use sequential IDs.
- `[P]` is intentionally omitted because the dependency graph contains no safe same-phase parallel task pair before the shared decorator is implemented.
- Each user-story task includes its story label and file path; tests are scheduled before their corresponding implementation tasks.
- Complete strategy reruns may repeat operational tool side effects, as selected and documented in `research.md` and the contracts.
