# Tasks: War Room Web

**Input**: Design documents from `specs/017-war-room-web/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`

**Tests**: Included because Constitution Principle IV requires tests for every new behavior. Keep the existing `node:test` runner via `tsx`; use fake strategies/services and SQLite `:memory:` so tests do not require model-provider calls.

**Organization**: Tasks are grouped by user story so each story can be independently implemented and validated. Priorities follow `spec.md`: US1, US2, US4 (P1), then US3 (P2).

## Phase 1: Setup

**Purpose**: Add the web toolchain and establish the frontend and CORS configuration scaffolding.

- [X] T001 Add Vite, `@vitejs/plugin-react`, React, React DOM, `@types/react`, `@types/react-dom`, `cors`, and `@types/cors` to `package.json` and `package-lock.json`; add `dev:web`, `build:web`, and `preview:web` scripts; extend `typecheck` and `test` to cover `web/` while retaining `node:test` via `tsx`.
- [X] T002 [P] Create the Vite/React entry files in `web/index.html`, `web/vite.config.ts`, `web/tsconfig.app.json`, `web/src/main.tsx`, and `web/src/App.tsx`; set the Vite base to `/opspilot/` and keep the API `tsconfig.json` scoped to `src/`.
- [X] T003 [P] Add the non-secret local CORS example `CORS_ORIGIN=http://localhost:5173` to `.env.example`; do not add credentials or edit `.env`.

---

## Phase 2: Foundational

**Purpose**: Establish shared boundary schemas, CORS policy, and browser settings primitives required by the user stories.

**Checkpoint**: Complete this phase before implementing story-specific UI or approval behavior.

- [X] T004 [P] Add `node:test` contract cases in `src/contracts/war-room.test.ts` for chat 200/202 responses, typed trace validation, action listing, and approve/deny decisions; run them and confirm the new cases fail before implementing the schemas.
- [X] T005 Implement shared Zod contracts in `src/contracts/war-room.ts`. Preserve these data-model constraints verbatim: `requestId` — “Identificador existente do trace de solicitação”; `conversationId` — “Retornado pela API de chat”; `userId` — “Identificador atual, local ao navegador”; `message` — “Removido de espaços extras antes do envio”; `answer` — “Obrigatório em uma resposta normal concluída”; `trace` — “Parseado pela união Zod compartilhada; sequência e campos específicos permanecem tipados”; `metrics` — “Validado pelo schema de resposta Zod existente”.
- [X] T006 [P] Add CORS integration tests in `src/http/server.test.ts` for the exact configured origin, rejection of an unlisted origin, JSON `OPTIONS` preflight, and absence of credentialed or wildcard permission; run the new cases and confirm they fail before implementation.
- [X] T007 Configure the Express CORS middleware and injectable origin in `src/http/server.ts`; read `CORS_ORIGIN`, allow only the configured exact origin and `GET`, `POST`, `OPTIONS` with `Content-Type`, disable credentials, and keep CORS distinct from authentication.
- [X] T008 [P] Add `node:test` cases in `web/src/api/settings.test.ts` for URL parsing, browser ID generation, and API-scoped conversation restoration; include invalid schemes, embedded credentials, query strings, and fragments.
- [X] T009 Implement browser settings primitives in `web/src/api/settings.ts` with these data-model constraints verbatim: `apiBaseUrl` — “Parse Zod de URL; esquema `http:` ou `https:`; sem credenciais, query ou fragmento; barra final normalizada”; `userId` — “Gerado uma vez por perfil do navegador e validado como UUID”; `conversationId` — “Recebido em resposta de chat validada; associado à URL configurada e ao `userId`”. Use `VITE_API_BASE_URL` only as a public initial default and persist settings through an injectable storage interface.

---

## Phase 3: User Story 1 - Conversar com o OpsPilot (Priority: P1) 🎯 MVP

**Goal**: Send a message through the configured API, show the matching answer, and make request failures explicit.

**Independent Test**: With a fake HTTP response, send a valid message and verify the corresponding answer appears; return a network or API error and verify it is not shown as a successful answer.

### Tests for User Story 1

- [X] T010 [P] [US1] Add fake-fetch tests in `web/src/api/client.test.ts` for the valid chat request, validated 200 response, malformed response, and explicit HTTP/network failures; verify the request path preserves a configured API path prefix.
- [X] T011 [P] [US1] Add pure state-transition tests in `web/src/chat-state.test.ts` for pending submission, matching response, and failed request without success-shaped fallback; run them before implementation.

### Implementation for User Story 1

- [X] T012 [US1] Implement the typed chat request in `web/src/api/client.ts`, sending `message`, browser `userId`, and optional `conversationId` to `POST /chat`; append the operation path without dropping an API base path and validate the 200 response with `src/contracts/war-room.ts`.
- [X] T013 [US1] Implement chat request/response/error transitions in `web/src/chat-state.ts`; retain the exchange's own `requestId`, `conversationId`, and typed trace and never replace a failed result with a success.
- [X] T014 [US1] Build the message composer, conversation list, loading state, and explicit error view in `web/src/components/ChatRoom.tsx`; send only non-empty trimmed messages through the client.
- [X] T015 [US1] Wire `ChatRoom` into `web/src/App.tsx` using the browser settings primitives and verify a 200 response renders only its matching exchange.

**Checkpoint**: US1 works with a deterministic fake API and remains useful without approval, settings-editing, or trace-viewer stories.

---

## Phase 4: User Story 2 - Revisar uma ação proposta (Priority: P1)

**Goal**: Return pending operational mutations as 202 cards, restore unresolved cards, and execute a mutation only after one explicit approval.

**Independent Test**: Use fake incident services and an in-memory SQLite store to verify no mutation occurs before approval, approval executes once, denial does not execute, a reload restores unresolved state, and a conflicting decision is rejected.

### Tests for User Story 2

- [X] T016 [P] [US2] Add SQLite store tests in `src/store/sqlite-pending-action-store.test.ts` for persistence, valid/invalid status constraints, conditional claims, duplicate decisions, and startup conversion of interrupted `processing` records.
- [X] T017 [P] [US2] Add service tests in `src/services/pending-action-service.test.ts` and proposal-tool tests in `src/agents/tools.test.ts` using fake incident operations to prove pending creation has no side effect, approval invokes one validated operation once, denial invokes none, and failures never return approval.
- [X] T018 [P] [US2] Add HTTP tests in `src/http/server.test.ts` for `POST /chat` 202, `GET /actions?userId=...`, `POST /actions/:id/decision`, 400/404/409/500 results, and ownership mismatch; run these cases before endpoint implementation.
- [X] T019 [P] [US2] Add pending-action client/state tests in `web/src/pending-action-state.test.ts` for one card per 202 action, active-action restoration, disabled controls outside `pending`, and no false success after decision failure.

### Implementation for User Story 2

- [X] T020 [US2] Define the pending-action record and store interface in `src/services/pending-action-store.ts`, preserving these data-model constraints verbatim: `id` — “Gerado pela API e usado como identificador do recurso de decisão”; `requestId` — “Referencia a solicitação de chat que propôs a ação”; `userId` — “Deve corresponder ao ID anônimo de navegador associado à ação”; `kind` — “Enum Zod fechado que determina a operação permitida”; `summary` — “Resumo seguro para exibição, derivado da entrada validada”; `details` — “Campos operacionais exibidos para revisão, sem incluir payload de execução não necessário”; `payload` — “Validado pelos schemas existentes das ferramentas de incidente; nunca aceito como comando arbitrário não validado”; `status` — “Valores fechados validados e impostos por constraints SQLite”; `createdAt` — “Gerado pela API”; `decidedAt` — “Definido quando uma decisão ou resultado terminal é registrado”; `result` — “Presente somente após execução aprovada com sucesso”; `errorCode` — “Código de domínio seguro; sem stack ou detalhes internos”.
- [X] T021 [US2] Implement `pending_actions` persistence in `src/store/sqlite-pending-action-store.ts` using `DatabaseSync`, prepared statements, bound values, closed SQLite status constraints, and `:memory:` support; conditionally claim actions and convert stranded `processing` rows to `reconciliation_required` without retrying mutations.
- [X] T022 [US2] Implement action creation, listing, state transitions, typed domain errors, and result retention in `src/services/pending-action-service.ts` and `src/services/domain-error.ts`; enforce `pending -> processing -> approved|failed`, `pending -> denied`, and `processing -> reconciliation_required`.
- [X] T023 [US2] Defer `open_incident` and `resolve_incident` side effects in `src/agents/tools.ts` and inject the pending-action service through `src/agents/index.ts` and `src/index.ts` for HTTP strategies only; leave read-only tools and the explicit `forget_preference` flow unchanged.
- [X] T024 [US2] Implement 202 response selection and `GET /actions?userId=...` plus `POST /actions/:id/decision` in `src/http/server.ts`; validate all inputs and outputs with shared Zod schemas, return explicit 400/404/409/500 errors, and never report an unconfirmed operation as successful.
- [X] T025 [US2] Extend `web/src/api/client.ts` and `web/src/pending-action-state.ts` to parse 202 `pendingActions`, load unresolved actions on startup, submit `approve`/`deny`, and keep `processing`, `failed`, and `reconciliation_required` actions visible with controls disabled.
- [X] T026 [US2] Implement `web/src/components/PendingActionCard.tsx` and connect it to `web/src/components/ChatRoom.tsx`; render only API-returned `kind`, `summary`, and safe `details`, disable duplicate/conflicting decisions, and show terminal state only after API confirmation.

**Checkpoint**: US2 independently proves the server does not mutate incidents before approval and the interface cannot turn a failed or conflicting decision into a success.

---

## Phase 5: User Story 4 - Configurar a conexão com a API (Priority: P1)

**Goal**: Let the operator edit and retain the API base URL from the gear control without losing browser/API conversation scope.

**Independent Test**: Save a valid URL in the settings flow, reload the browser and verify it remains active; reject invalid URLs without sending a request.

### Tests for User Story 4

- [X] T027 [P] [US4] Add settings-flow tests in `web/src/settings-state.test.ts` for valid save, invalid save, persisted URL after reload, and resetting the active conversation when the API URL changes; run them before implementation.

### Implementation for User Story 4

- [X] T028 [US4] Implement settings-form transitions in `web/src/settings-state.ts`, calling `web/src/api/settings.ts` validation and storage and preserving the active conversation only while its configured API URL is unchanged.
- [X] T029 [US4] Implement the gear-triggered API URL form in `web/src/components/ApiSettings.tsx`; show validation errors, the current target, and a generic connection/configuration error without storing credentials.
- [X] T030 [US4] Integrate `ApiSettings` into `web/src/App.tsx`, apply a saved URL to subsequent chat/action requests, and keep the settings editable after network or cross-origin failures.

**Checkpoint**: US4 can be tested independently with browser storage and a fake API target; the setting survives reload in the same browser.

---

## Phase 6: User Story 3 - Inspecionar o raciocínio da execução (Priority: P2)

**Goal**: Open the typed, ordered trace associated with one chat exchange and close it without losing the conversation.

**Independent Test**: Supply a fixture response with multiple typed events, open its trace, verify event order and association, and test the empty/unavailable case.

### Tests for User Story 3

- [X] T031 [P] [US3] Add trace view-model tests in `web/src/trace-view-model.test.ts` for event-type rendering data, stable API order, empty/unavailable traces, and prevention of cross-exchange association; run them before implementation.

### Implementation for User Story 3

- [X] T032 [US3] Implement trace selection and view-model validation in `web/src/trace-view-model.ts` using the shared `TraceEvent` schema; preserve sequence order and return an explicit unavailable state for an empty or invalid trace.
- [X] T033 [US3] Implement the ordered trace panel and close control in `web/src/components/TraceViewer.tsx`, rendering typed event fields without inventing fields or events.
- [X] T034 [US3] Add the “Ver raciocínio” action to `web/src/components/ChatRoom.tsx` and connect it to `TraceViewer`; scope the viewer to the selected exchange and preserve the conversation position when it closes.

**Checkpoint**: US3 displays only the selected exchange's validated trace and leaves the chat state intact when the panel closes.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify shared documentation, quality gates, deployment path, and CORS assumptions.

- [X] T035 [P] Update `specs/017-war-room-web/quickstart.md` to match the final scripts and actual browser/server flows, including local CORS setup, action restoration, interrupted-action reconciliation, and static hosting under `/opspilot/`.
- [X] T036 Run `npm run typecheck`, `npm test`, and `npm run build:web` from the repository root; execute the manual scenarios in `specs/017-war-room-web/quickstart.md` and fix only failures in files scoped to this feature.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No prerequisites.
- **Foundational (Phase 2)**: Depends on Setup; shared contracts, CORS, and browser settings block story implementation.
- **US1 (Phase 3)**: Depends on Foundation and is the first independently demonstrable increment.
- **US2 (Phase 4)**: Server/store work depends on Foundation; chat-card UI integration depends on US1's `ChatRoom` and API client.
- **US4 (Phase 5)**: Settings logic depends on Foundation; `App.tsx` integration depends on the US1 app shell. Its persistence/validation tests are independent of US2.
- **US3 (Phase 6)**: Depends on the shared trace contract and US1 chat exchange; viewer integration depends on US1's `ChatRoom`.
- **Polish (Phase 7)**: Depends on the stories selected for delivery.

### User Story Dependencies

- **US1 (P1)**: Starts after Foundation; no dependency on another story. MVP.
- **US2 (P1)**: Backend action tests/service/store can start after Foundation; end-to-end UI integration depends on US1's chat flow.
- **US4 (P1)**: Settings logic can start after Foundation; `App.tsx` integration depends on US1's app shell. It does not depend on approval or trace work.
- **US3 (P2)**: Trace viewer can be implemented against a fixture after Foundation; integration into chat depends on US1.

### Parallel Opportunities

- Setup tasks T002 and T003 can run alongside T001 because they touch different files.
- Foundation test tasks T004, T006, and T008 can be prepared in parallel; each implementation follows its own failing tests.
- Within US1, T010 and T011 target different test files and can be authored in parallel; client and state implementations follow those tests.
- Within US2, T016–T019 use separate test files and can be authored in parallel. Afterward, store/service/API-client implementation can proceed in parallel until the HTTP/tool integration and ChatRoom card wiring checkpoints.
- US4 settings-state work can proceed independently from US2 backend work after Foundation; avoid parallel edits to `web/src/App.tsx`.
- US3 view-model tests and trace component can be prepared separately from settings work; integrate into `ChatRoom.tsx` after the US1 component is stable.

## Parallel Examples

### User Story 1

```text
Task: T010 Add fake-fetch tests in web/src/api/client.test.ts
Task: T011 Add state-transition tests in web/src/chat-state.test.ts
```

### User Story 2

```text
Task: T016 Add SQLite store tests in src/store/sqlite-pending-action-store.test.ts
Task: T017 Add service tests in src/services/pending-action-service.test.ts
Task: T018 Add HTTP tests in src/http/server.test.ts
Task: T019 Add UI state tests in web/src/pending-action-state.test.ts
```

### User Story 4

```text
Task: T027 Add settings-flow tests in web/src/settings-state.test.ts
```

### User Story 3

```text
Task: T031 Add trace view-model tests in web/src/trace-view-model.test.ts
```

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Setup and Foundation.
2. Implement and independently test US1 with `VITE_API_BASE_URL` as a public initial default and the generated browser-scoped `userId`.
3. Validate chat 200 responses and explicit error states with fakes; do not require model-provider access for automated tests.
4. Deliver the chat screen before adding approval, gear settings, or trace viewing.

### Incremental Delivery

1. Setup + Foundation → shared schemas, CORS, Vite base, and browser settings primitives.
2. US1 → chat MVP with validated 200 responses and explicit failures.
3. US2 → persisted pending actions, 202 cards, approve/deny, and reload restoration.
4. US4 → gear settings and runtime API URL switching.
5. US3 → typed trace inspection tied to each response.
6. Polish → all quality gates and quickstart checks.

## Notes

- Every task uses the `- [ ] T### [P?] [US?] ...` checklist format and includes a repository file path.
- `[P]` is reserved for tasks on separate files that do not depend on unfinished work.
- User-story tests are listed before their implementation tasks and must fail for the missing behavior before the implementation is considered complete.
- Keep each task small enough for a focused, reviewable commit; do not read `.env` or add credentials to frontend build variables.
