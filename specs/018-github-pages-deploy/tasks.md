---

description: "Task list for GitHub Pages deployment"
---

# Tasks: GitHub Pages Deployment

**Input**: Design documents from `/specs/018-github-pages-deploy/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/pages-workflow.md`

**Tests**: No new automated test suite was requested. Tasks include build, preview, workflow-contract, and existing quality-gate validation.

**Organization**: Tasks are grouped by user story and ordered by priority.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with another task because files do not overlap and prerequisites are complete.
- **[Story]**: User-story label mapping to `spec.md`.
- Every task names the file or path it creates, updates, or validates.

## Phase 1: Setup

**Purpose**: Project initialization and shared infrastructure.

No setup task is required: the repository already has Node.js 22 compatibility, the Vite application, and build/preview scripts.

---

## Phase 2: Foundational

**Purpose**: Blocking prerequisites shared by user stories.

No additional foundation is required. The Pages site is an independent static deployment; API and database deployment remain out of scope.

---

## Phase 3: User Story 1 - Publicar a sala de plantão (Priority: P1) 🎯 MVP

**Goal**: Automatically publish the approved War Room build at the project GitHub Pages URL while validating pull requests without deployment.

**Independent Test**: Verify the workflow builds pull requests without uploading or deploying, publishes a push or manual dispatch from `main`, skips publication for manual dispatch from other refs, and serves `/ops-pilot/` with its assets.

### Implementation for User Story 1

- [X] T001 [US1] Create `.github/workflows/deploy-pages.yml` with `push` and `pull_request` triggers for `main` and `workflow_dispatch`; build with Node.js 22 using `npm ci` and `npm run build:web -- --base=/ops-pilot/`; upload only `web/dist` with `actions/upload-pages-artifact@v4` for publishable refs; deploy through a dependent `github-pages` environment job using `actions/deploy-pages@v4` only for `main`; restrict workflow/build permissions to `contents: read`, grant deploy only `contents: read`, `pages: write`, and `id-token: write`, expose the deployment URL, and serialize Pages runs without canceling an active deployment.
- [X] T002 [US1] Validate the Pages output from `.github/workflows/deploy-pages.yml` by running `npm run build:web -- --base=/ops-pilot/` and `npm run preview:web -- --host 127.0.0.1 --base=/ops-pilot/`; confirm the preview returns the application at `/ops-pilot/`, asset URLs use that prefix, and only `web/dist` is designated as the upload source.

**Checkpoint**: The P1 story is publishable from `main`, build-only for pull requests and non-main manual runs, and serves the project path correctly.

---

## Phase 4: User Story 2 - Entender e manter a publicação (Priority: P2)

**Goal**: Give maintainers one reliable place to find the public URL, configuration steps, trigger behavior, local checks, and API CORS requirement.

**Independent Test**: Follow the Pages section in `README.md` to identify the public URL, enable GitHub Actions as the Pages source, distinguish build-only from publishing events, preview the matching local build, and configure the separate API's CORS origin.

### Implementation for User Story 2

- [X] T003 [P] [US2] Update `README.md` with `https://moreira-and.github.io/ops-pilot/`, Pages setup through GitHub Actions, pull-request/push/manual branch behavior, local Pages-base build and preview commands, the exact API CORS origin `https://moreira-and.github.io`, and a note that API hosting and credentials remain separate from the static site.

**Checkpoint**: A maintainer can configure, verify, and troubleshoot publication using the README without exposing API credentials.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Run final quality gates and verify the feature contract and documentation agree.

- [X] T004 Run `npm run typecheck`, `npm test`, `npm run build:web -- --base=/ops-pilot/`, and the preview scenario from `specs/018-github-pages-deploy/quickstart.md`; review `.github/workflows/deploy-pages.yml`, `README.md`, and `specs/018-github-pages-deploy/contracts/pages-workflow.md` for matching triggers, branch guards, permissions, artifact scope, and public URL.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No changes required; existing project configuration is already in place.
- **Foundational (Phase 2)**: No additional shared prerequisite; current Vite and npm setup supports the feature.
- **User Stories (Phases 3–4)**: Both can start immediately. Implement P1 first for MVP; the README task may run in parallel because its content is specified independently of workflow implementation.
- **Polish (Phase 5)**: Depends on the workflow and README tasks, and on the P1 preview validation.

### User Story Dependencies

- **User Story 1 (P1)**: Independent; T002 follows T001.
- **User Story 2 (P2)**: Independent; T003 can run in parallel with T001 because it edits only `README.md` and the workflow contract is fixed by the design artifacts.

### Within Each User Story

- **US1**: Workflow implementation (T001) must complete before path/artifact validation (T002).
- **US2**: README publication instructions are validated as part of the final cross-cutting review (T004).

### Parallel Opportunities

- **T001 [US1]** and **T003 [US2]** can run in parallel; they modify `.github/workflows/deploy-pages.yml` and `README.md`, respectively.
- **T002 [US1]** is sequential after T001 because it validates the workflow's build and artifact contract.
- **T004** is final and depends on T001, T002, and T003.

## Parallel Example: User Stories 1 and 2

```text
Task: T001 Implement `.github/workflows/deploy-pages.yml` for GitHub Pages.
Task: T003 Update `README.md` using the already-defined workflow contract.
```

## Implementation Strategy

### MVP First (User Story 1)

1. Implement T001 for the gated Pages workflow.
2. Complete T002 and verify the `/ops-pilot/` preview and artifact scope.
3. Validate a pull request and then a `main` deployment in GitHub Actions when the workflow is available in the repository.

### Incremental Delivery

1. Deliver the P1 deployment workflow and validate its static output.
2. Deliver P2 maintainer instructions independently in the README.
3. Run T004 after both stories are complete.

### Notes

- `[P]` tasks operate on separate files and have no dependency on unfinished work in the other task.
- No standalone test-authoring tasks were added because tests were not requested in the specification; validation commands are included in T002 and T004.
- Deployment can only be verified in GitHub Actions after the workflow is committed to a branch and Pages is configured to use GitHub Actions.
