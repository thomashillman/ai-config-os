# Authoritative task-scoped command store — Implementation Plan

**Status:** Proposed  
**Canonical spec:** [`docs/superpowers/specs/2026-04-03-authoritative-task-command-store-design.md`](../specs/2026-04-03-authoritative-task-command-store-design.md)  
**Scope:** Task mutation path only  
**Deployment assumption:** Single user today, enterprise-shaped receipts and boundaries now, multi-user operations later

> **Execution principle:** Keep the existing `handler → task control-plane service → store` path. Do not introduce a new platform subsystem. Land the authoritative path by **command type**, keep KV authoritative only until each command type is explicitly cut over, and make build and contract drift fail fast.

**Goal:** Replace KV-first task mutation authority with an authoritative task-scoped command store for narrow task commands first, while keeping runtime simple, deterministic, and compatible with the current Worker + KV + TaskObject architecture.

**Core design to implement:**

- `Principal` as canonical actor identity
- embedded `Authority` snapshot stamped by the server, not the caller
- `ActionCommit` as immutable receipt for every authoritative task mutation
- internal `applyCommand()` authoritative write boundary on the task-scoped store
- projection-only KV after command-type cutover
- compact mutation responses, explicit idempotency, explicit conflict semantics

**Migration principle:** Build-safe and dependency-safe first, authoritative shadow second, command-type cutover third.

---

## Architecture summary

**Keep:**

- Worker task handlers in `worker/src/handlers/tasks.ts`
- task operation normalisation in `runtime/lib/task-control-plane-service-core.mjs`
- KV-backed list/read models in `runtime/lib/task-store-kv.mjs`
- TaskObject seam in `worker/src/task-object.ts`

**Change:**

- Clients stop being the source of authoritative principal/authority data
- handlers build internal command envelopes and server-stamp principal/authority/execution context
- TaskObject grows a single authoritative `applyCommand()` path
- KV becomes projection and index storage after cutover for each migrated command type
- `events`, `snapshots`, and `log` inside TaskObject become derived views of `ActionCommit`, not parallel authoritative histories

---

## File map (create / own)

| Area                            | Create / modify                                                                                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command envelope and validation | Create `worker/src/task-command.ts` (or equivalent focused module), create tests under `worker/src/__tests__/task-command*.test.ts`, modify `worker/src/types.ts` only if necessary |
| Handler stamping                | Modify `worker/src/handlers/tasks.ts`, optionally `worker/src/auth.ts` if principal resolution helpers belong there                                                                 |
| Service path                    | Modify `runtime/lib/task-control-plane-service-core.mjs`, `runtime/lib/task-control-plane-service-worker.mjs`                                                                       |
| Authoritative store             | Modify `worker/src/task-object.ts` to add `apply-command`; keep legacy replication endpoints only for migration support                                                             |
| Runtime wiring                  | Modify `worker/src/task-runtime.ts`, modify `worker/src/dual-write-task-store.ts`                                                                                                   |
| Projection logic                | Modify `runtime/lib/task-store-kv.mjs` for projection-only behaviour after cutover, add reconciliation helper under `runtime/lib/` or `worker/src/` as appropriate                  |
| Tests                           | Add authoritative-store tests, replay/conflict tests, projection-repair tests, command-type integration tests                                                                       |
| Docs                            | This plan file, plus spec updates only if implementation uncovers a genuine design mismatch                                                                                         |

---

## Dependency order

**Step 1 → Step 2 → Step 3 → Step 4** are sequential.  
**Step 5** can start only after Step 4 is stable.  
Do **not** cut over `task.create` or continuation flows before route/state/finding commands are authoritative and reconciled.

---

## Step 1 — Internal command envelope and server stamping

**Branch:** `feat/task-command-store-step-01-envelope`  
**PR title:** `feat(task-store): step 1 — internal command envelope and server stamping`

### Goal

Introduce the authoritative internal command shape without changing mutation authority yet.

### Files

- Create: `worker/src/task-command.ts` (or similarly named focused module)
- Create: `worker/src/__tests__/task-command.test.ts`
- Modify: `worker/src/handlers/tasks.ts`
- Modify: `runtime/lib/task-control-plane-service-core.mjs`
- Modify: `runtime/lib/task-control-plane-service-worker.mjs`
- Modify: `worker/src/types.ts` only if needed for narrow shared types

### Deliverables

- server-side command builder
- canonical semantic digest function
- explicit internal command shape with:
  - `task_id`
  - `idempotency_key`
  - `expected_task_version`
  - `command_type`
  - typed `payload`
  - `request_context`
  - `resolved_context` containing stamped principal, embedded authority, and validated execution context
- no caller-supplied authoritative principal or authority accepted on the internal path

### Checklist

- [ ] **Step 1.1:** Write failing tests for command envelope construction:
  - principal is server-stamped
  - authority is server-stamped
  - route/model execution context is validated before inclusion
  - semantic digest excludes volatile fields
- [ ] **Step 1.2:** Implement the command builder and validator in one shared module used by handlers and tests.
- [ ] **Step 1.3:** Modify task handlers so route selection, state transition, and finding append build the new internal command envelope before invoking the task service.
- [ ] **Step 1.4:** Modify task control-plane service so state-changing task methods accept a normalised command envelope internally, while preserving current public handler contracts.
- [ ] **Step 1.5:** Run targeted tests, then repo gate checks.
- [ ] **Step 1.6:** Commit with conventional message.

### Verification

- `npm test` or targeted Worker/runtime suites
- compile/type-check paths that cover Worker + runtime interaction
- `bash ops/pre-pr-mergeability-gate.sh`

---

## Step 2 — Authoritative applyCommand path in TaskObject

**Branch:** `feat/task-command-store-step-02-authoritative-store`  
**PR title:** `feat(task-store): step 2 — authoritative applyCommand in TaskObject`

### Goal

Turn TaskObject into a real task-scoped command store for narrow command types, but keep it in shadow mode first.

### Files

- Modify: `worker/src/task-object.ts`
- Create: `worker/src/__tests__/task-object-apply-command.test.ts`
- Modify: `worker/src/task-runtime.ts`
- Modify: `worker/src/dual-write-task-store.ts`

### Deliverables

- `POST /apply-command` internal endpoint on TaskObject
- hard expected-version enforcement
- idempotency index per task
- append-only `ActionCommit` stream
- `events`, `snapshots`, and `log` treated as derived or migration-support views, not parallel authoritative histories
- legacy `put-state` retained only for migration and projection support, not new authoritative writes

### Checklist

- [ ] **Step 2.1:** Write failing tests for `applyCommand()`:
  - same idempotency key + same digest replays original result
  - same key + different digest fails with `idempotency_key_reused`
  - stale expected version fails with `version_conflict`
  - one successful command writes exactly one `ActionCommit` and one resulting task version
- [ ] **Step 2.2:** Implement `apply-command` in TaskObject and make it the only authoritative write path for migrated command types.
- [ ] **Step 2.3:** Persist authoritative state together:
  - current task state
  - current version
  - ordered commit stream
  - idempotency index
  - continuation fingerprint state
- [ ] **Step 2.4:** Update runtime wiring so authoritative-store shadow writes are possible without yet changing served authority.
- [ ] **Step 2.5:** Keep current dual-write behaviour for non-migrated command types.
- [ ] **Step 2.6:** Run targeted authoritative-store tests and mergeability gate.

### Verification

- task-object unit tests
- conflict and replay tests
- deterministic retry tests
- `bash ops/pre-pr-mergeability-gate.sh`

---

## Step 3 — Shadow mode and reconciliation for narrow command types

**Branch:** `feat/task-command-store-step-03-shadow-reconcile`  
**PR title:** `feat(task-store): step 3 — shadow reconciliation for narrow commands`

### Goal

Keep current served behaviour, but compare authoritative reconstruction against the current task state for the first migrated command types.

### Command types in scope

- `task.select_route`
- `task.transition_state`
- `task.append_finding`

### Files

- Modify: `worker/src/task-runtime.ts`
- Modify: `worker/src/dual-write-task-store.ts`
- Modify: `runtime/lib/task-store-kv.mjs`
- Create: reconciliation helper under `runtime/lib/` or `worker/src/`
- Create: tests for authoritative replay and reconstruction

### Deliverables

- shadow-mode execution for migrated command types
- authoritative reconstruction helper for sampled tasks
- divergence detection between authoritative state and served state
- projection metadata fields such as `authoritative_version`, `projected_version`, and `projection_lag`

### Checklist

- [ ] **Step 3.1:** Write failing tests for authoritative reconstruction of route/state/finding commands.
- [ ] **Step 3.2:** Implement reconciliation helper that rebuilds current task state from authoritative history for sampled tasks.
- [ ] **Step 3.3:** Surface divergence as explicit diagnostic output or structured logs.
- [ ] **Step 3.4:** Add projection-lag metadata and tracking for command types in shadow.
- [ ] **Step 3.5:** Confirm no unexplained divergence in local/staging runs for sampled task sequences.
- [ ] **Step 3.6:** Run tests and gate.

### Verification

- replay/rebuild tests pass
- authoritative rebuild matches current served task state for representative sampled tasks
- no duplicate resulting versions in concurrency tests

---

## Step 4 — Command-type cutover and compact responses

**Branch:** `feat/task-command-store-step-04-cutover-narrow-commands`  
**PR title:** `feat(task-store): step 4 — cut over route state and finding commands`

### Goal

Make the authoritative store the real writer for the first narrow command types and demote KV to projection for those command types.

### Files

- Modify: `worker/src/handlers/tasks.ts`
- Modify: `runtime/lib/task-control-plane-service-core.mjs`
- Modify: `runtime/lib/task-store-kv.mjs`
- Modify: `worker/src/task-runtime.ts`
- Add/update integration tests for handler → service → authoritative store path

### Deliverables

- route selection, state transition, and finding append write through authoritative `applyCommand()`
- compact default mutation responses:
  - `action_id`
  - `task_id`
  - `resulting_task_version`
  - `replayed`
  - `projection_status`
- KV used as projection and index storage for migrated command types
- explicit machine-readable error set:
  - `invalid_command`
  - `unauthorized`
  - `boundary_mismatch`
  - `task_not_found`
  - `idempotency_key_reused`
  - `version_conflict`
  - `projection_pending`

### Checklist

- [ ] **Step 4.1:** Write failing integration tests for migrated command types through the full path.
- [ ] **Step 4.2:** Change the task service/store path so the migrated command types are authoritative in TaskObject.
- [ ] **Step 4.3:** Update mutation responses to use compact receipts by default.
- [ ] **Step 4.4:** Preserve full task reads through explicit read operations rather than mutation responses.
- [ ] **Step 4.5:** Confirm same idempotency key + same semantics returns original `action_id` and version even when the task has advanced.
- [ ] **Step 4.6:** Run tests and gate.

### Cutover gate for Step 4

Do not merge until all are true:

- [ ] No unexplained divergence remains in sampled shadow comparisons
- [ ] Replay and conflict tests are green
- [ ] Projection rebuild succeeds for sampled tasks
- [ ] Compact response shape is stable and documented in tests

---

## Step 5 — Projection hardening and build/dependency gates

**Branch:** `feat/task-command-store-step-05-projection-build-hardening`  
**PR title:** `feat(task-store): step 5 — projection repair and build hardening`

### Goal

Make the migrated path operationally safe and build-safe before broadening to more complex commands.

### Files

- Modify/create reconciliation and repair helper
- Modify build/test wiring as needed
- Optionally add lightweight validation script(s) under `ops/` or `scripts/`

### Deliverables

- scheduled or invokable projection repair for lagging tasks
- build failure on authoritative contract drift
- build failure on service-to-store signature drift
- build failure on authoritative-store contract tests
- clear rollback guidance for reads without reintroducing dual authority

### Checklist

- [ ] **Step 5.1:** Add projection repair path that replays missing authoritative commits into KV for lagging tasks.
- [ ] **Step 5.2:** Add projection lag metrics or structured logs sufficient to detect drift in production-like runs.
- [ ] **Step 5.3:** Add build checks for command envelope drift and authoritative-store expectations.
- [ ] **Step 5.4:** Add tests proving projection failure does not corrupt authoritative state.
- [ ] **Step 5.5:** Document rollback rule in code comments and plan: after command-type cutover, roll back reads if needed, never restore dual authority for that command type.
- [ ] **Step 5.6:** Run full test/gate path.

### Verification

- authoritative state survives projection failure
- repair catches KV up to authoritative version
- build fails when authoritative command/store contracts drift

---

## Follow-on step — Broaden to task create and continuation

**Branch:** `feat/task-command-store-step-06-create-continuation`  
**PR title:** `feat(task-store): step 6 — broaden to create and continuation`

### Goal

Only after Steps 1–5 are stable, broaden the authoritative path to the more complex commands.

### Commands in scope

- `task.create`
- `task.create_continuation`

### Notes

This step is intentionally deferred because it touches:

- short-code and name indexing
- task bootstrap state
- continuation package semantics
- handoff token flows

### Checklist

- [ ] **Step 6.1:** Re-read the canonical spec before broadening scope.
- [ ] **Step 6.2:** Add failing tests for create and continuation through authoritative `applyCommand()`.
- [ ] **Step 6.3:** Implement only after narrow commands have sustained stable operation.
- [ ] **Step 6.4:** Re-run replay, rebuild, and rollback checks.

---

## Verification ladder (every PR)

1. Targeted tests for the changed command/store path
2. Worker/runtime compile and type checks where applicable
3. `bash ops/pre-pr-mergeability-gate.sh`
4. Full `npm test` before or during the hardening/cutover steps where cross-path drift risk is highest

---

## Execution notes

### KISS decisions retained

- no new platform subsystem
- no queue infrastructure yet
- no workspace-wide coordinator
- no external IdP implementation now
- no full event sourcing now
- no broad enterprise UX now
- no `command_id` in addition to `idempotency_key`

### Important anti-pattern to avoid

Do **not** allow both KV and TaskObject to feel authoritative for the same migrated command type. Shadowing is allowed before cutover. Dual authority is not.

---

## Acceptance criteria

The plan is complete when:

1. Route selection, state transition, and finding append are authoritative through `applyCommand()`.
2. Every successful migrated mutation returns one `action_id` and one resulting task version.
3. Replayed retries return the original result deterministically.
4. KV is projection-only for migrated command types.
5. Projection lag is visible and repairable.
6. Build and contract drift fail fast.
7. Runtime remains simple for the current single-user deployment.
8. Persisted receipts remain enterprise-shaped for future multi-user evolution.
