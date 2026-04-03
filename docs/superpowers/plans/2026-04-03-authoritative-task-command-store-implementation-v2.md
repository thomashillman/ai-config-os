# Authoritative task-scoped command store — Implementation Plan (v2)

**Status:** Proposed, supersedes `2026-04-03-authoritative-task-command-store-implementation.md`  
**Canonical spec:** [`docs/superpowers/specs/2026-04-03-authoritative-task-command-store-design.md`](../specs/2026-04-03-authoritative-task-command-store-design.md)  
**Scope:** Task mutation path only  
**Deployment assumption:** Single user today, enterprise-shaped receipts and boundaries now, multi-user operations later

> **Execution principle:** Keep the existing `handler → task control-plane service → store` path. Do not introduce a new platform subsystem. Land the authoritative path by **command type**, derive principal/boundary/authority on the server only, harden projection repair before cutover, and make build and contract drift fail fast.

**Goal:** Replace KV-first task mutation authority with an authoritative task-scoped command store for narrow task commands first, while keeping runtime simple, deterministic, and compatible with the current Worker + KV + TaskObject architecture.

**Core design to implement:**

- `Principal` as canonical actor identity
- embedded `Authority` snapshot stamped by the server, not the caller
- `ActionCommit` as immutable receipt for every authoritative task mutation
- internal `applyCommand()` authoritative write boundary on the task-scoped store
- projection-aware KV that becomes projection-only after cutover
- compact mutation responses, explicit idempotency, explicit replay semantics, explicit conflict semantics

**Migration principle:** Build-safe and dependency-safe first, authoritative shadow second, projection repair proven before cutover, command-type cutover fourth.

---

## Architecture summary

**Keep:**

- Worker task handlers in `worker/src/handlers/tasks.ts`
- task operation normalisation in `runtime/lib/task-control-plane-service-core.mjs`
- KV-backed list/read models in `runtime/lib/task-store-kv.mjs`
- TaskObject seam in `worker/src/task-object.ts`

**Change:**

- clients stop being the source of authoritative principal, boundary, authority, route, or model truth
- handlers derive request identity from the authenticated request and stamp a canonical internal command envelope
- task service remains the only normalisation path for state-changing task mutations
- TaskObject grows a single authoritative `applyCommand()` path
- projection lag, repair, and rebuild become part of the migration before command-type cutover
- KV becomes projection and index storage after cutover for each migrated command type
- `events`, `snapshots`, and `log` inside TaskObject become derived views of `ActionCommit`, not parallel authoritative histories

---

## Source of truth rules

These are non-negotiable and should be treated as implementation invariants:

1. **Principal truth** comes from the authenticated request and server-side principal resolution only.
2. **Boundary truth** comes from the authoritative task record plus server-side repo/workspace defaults or mappings, never from caller-supplied boundary identifiers alone.
3. **Authority truth** comes from server-side evaluation of the current principal against the allowed action scope and task boundary.
4. **Validated execution truth** such as route and model-path metadata is either derived or explicitly validated by the server before it is stamped into the command envelope and `ActionCommit`.
5. **Replay truth** comes from the authoritative idempotency index and commit stream, not from client memory or request timestamps.

For the current single-user deployment, most authoritative writes will resolve to a default owner principal and `direct_owner` authority mode. The persisted shape must still support future delegated and approval-backed modes.

---

## File map (create / own)

| Area | Create / modify |
| --- | --- |
| Command envelope and context resolution | Create `worker/src/task-command.ts`; create `worker/src/task-mutation-context.ts`; create tests under `worker/src/__tests__/task-command*.test.ts`; modify `worker/src/types.ts` only if necessary |
| Handler stamping | Modify `worker/src/handlers/tasks.ts`; modify `worker/src/auth.ts` only if shared request identity helpers belong there |
| Service path | Modify `runtime/lib/task-control-plane-service-core.mjs`; modify `runtime/lib/task-control-plane-service-worker.mjs` |
| Authoritative store | Modify `worker/src/task-object.ts` to add `apply-command`; keep legacy replication endpoints only for migration support |
| Runtime wiring | Modify `worker/src/task-runtime.ts`; modify `worker/src/dual-write-task-store.ts` |
| Projection logic | Modify `runtime/lib/task-store-kv.mjs`; create `runtime/lib/task-projection-reconcile.mjs` or equivalent focused module |
| Validation artifacts | Create `scripts/validate/task-command-envelope-drift.mjs`; create `scripts/validate/task-command-store-signatures.mjs`; create `ops/validate-task-command-store.sh` |
| Tests | Add authoritative-store tests, replay/conflict tests, projection-repair tests, boundary/security tests, command-type integration tests |
| Docs | This plan file; spec updates only if implementation uncovers a genuine design mismatch |

---

## Dependency order

**Step 1 → Step 2 → Step 3 → Step 4** are sequential.  
**Step 5** can start only after Step 4 is stable.  
Do **not** cut over `task.create` or continuation flows before route/state/finding commands are authoritative, replay-safe, and projection-repair-safe.

---

## Step 1 — Internal command envelope, mutation context, and server stamping

**Branch:** `feat/task-command-store-step-01-envelope-context`  
**PR title:** `feat(task-store): step 1 — internal command envelope and server stamping`

### Goal

Introduce the authoritative internal command shape and make the source of principal, boundary, and authority truth explicit, without changing mutation authority yet.

### Files

- Create: `worker/src/task-command.ts`
- Create: `worker/src/task-mutation-context.ts`
- Create: `worker/src/__tests__/task-command.test.ts`
- Create: `worker/src/__tests__/task-mutation-context.test.ts`
- Modify: `worker/src/handlers/tasks.ts`
- Modify: `runtime/lib/task-control-plane-service-core.mjs`
- Modify: `runtime/lib/task-control-plane-service-worker.mjs`
- Modify: `worker/src/types.ts` only if needed for narrow shared types

### Deliverables

- one canonical server-side command builder
- one canonical semantic digest function
- one canonical mutation-context resolver that derives:
  - authenticated principal
  - effective boundary
  - authority mode and action scope
  - validated execution context where relevant
- explicit internal command shape with:
  - `task_id`
  - `idempotency_key`
  - `expected_task_version`
  - `command_type`
  - typed `payload`
  - `request_context`
  - `resolved_context`
- no caller-supplied authoritative principal, boundary, or authority accepted on the internal path

### Checklist

- [ ] **Step 1.1:** Write failing tests for mutation-context resolution:
  - principal is derived from the authenticated request
  - boundary is derived from authoritative task context, not caller-supplied ids alone
  - authority is server-stamped
  - route/model execution context is validated before inclusion
- [ ] **Step 1.2:** Write failing tests for command envelope construction:
  - semantic digest excludes volatile fields
  - digest changes when semantic payload changes
  - digest remains stable across valid retries
- [ ] **Step 1.3:** Implement one shared command builder and one shared mutation-context resolver used by handlers and tests.
- [ ] **Step 1.4:** Modify task handlers so route selection, state transition, and finding append use the shared resolver and command builder before invoking the task service.
- [ ] **Step 1.5:** Modify task control-plane service so state-changing task methods accept a normalised command envelope internally, while preserving current public handler contracts.
- [ ] **Step 1.6:** Run targeted tests and gate checks.

### Verification

- `npm test` or targeted Worker/runtime suites
- compile/type-check paths that cover Worker + runtime interaction
- `node scripts/validate/task-command-envelope-drift.mjs`
- `bash ops/pre-pr-mergeability-gate.sh`

---

## Step 2 — Authoritative applyCommand path and explicit replay semantics

**Branch:** `feat/task-command-store-step-02-authoritative-store-replay`  
**PR title:** `feat(task-store): step 2 — authoritative applyCommand and replay semantics`

### Goal

Turn TaskObject into a real task-scoped command store for narrow command types in shadow mode first, with explicit replay and conflict behaviour.

### Files

- Modify: `worker/src/task-object.ts`
- Create: `worker/src/__tests__/task-object-apply-command.test.ts`
- Create: `worker/src/__tests__/task-object-replay-semantics.test.ts`
- Modify: `worker/src/task-runtime.ts`
- Modify: `worker/src/dual-write-task-store.ts`

### Deliverables

- `POST /apply-command` internal endpoint on TaskObject
- hard expected-version enforcement
- idempotency index per task
- append-only `ActionCommit` stream
- explicit replay semantics implemented in the store:
  - same `idempotency_key` + same semantic digest + prior success returns original `action_id`, original resulting version, and `replayed: true`
  - same key + different digest fails with `idempotency_key_reused`
  - new key + stale expected version fails with `version_conflict`
  - prior success must replay cleanly even if current task version has advanced
- `events`, `snapshots`, and `log` treated as derived or migration-support views, not parallel authoritative histories
- legacy `put-state` retained only for migration and projection support, not new authoritative writes

### Checklist

- [ ] **Step 2.1:** Write failing tests for `applyCommand()`:
  - same idempotency key + same digest replays original result
  - same key + different digest fails with `idempotency_key_reused`
  - stale expected version fails with `version_conflict`
  - prior success replays the original result even when the task has since advanced
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
- [ ] **Step 2.6:** Run authoritative-store tests and mergeability gate.

### Verification

- task-object unit tests
- conflict and replay tests
- deterministic retry tests
- `node scripts/validate/task-command-store-signatures.mjs`
- `bash ops/pre-pr-mergeability-gate.sh`

---

## Step 3 — Shadow mode, projection hardening, and reconciliation for narrow command types

**Branch:** `feat/task-command-store-step-03-shadow-projection-hardening`  
**PR title:** `feat(task-store): step 3 — shadow reconciliation and projection hardening`

### Goal

Keep current served behaviour, but harden projection repair and compare authoritative reconstruction against the current task state for the first migrated command types **before** cutover.

### Command types in scope

- `task.select_route`
- `task.transition_state`
- `task.append_finding`

### Files

- Modify: `worker/src/task-runtime.ts`
- Modify: `worker/src/dual-write-task-store.ts`
- Modify: `runtime/lib/task-store-kv.mjs`
- Create: `runtime/lib/task-projection-reconcile.mjs`
- Create: `runtime/lib/__tests__/task-projection-reconcile.test.mjs`
- Create: tests for authoritative replay and reconstruction

### Deliverables

- shadow-mode execution for migrated command types
- authoritative reconstruction helper for sampled tasks
- projection lag metadata fields:
  - `authoritative_version`
  - `projected_version`
  - `projection_lag`
- invokable projection repair path before cutover
- divergence detection between authoritative state and served state
- proof that projection repair catches KV up to authoritative version before command-type cutover

### Checklist

- [ ] **Step 3.1:** Write failing tests for authoritative reconstruction of route/state/finding commands.
- [ ] **Step 3.2:** Write failing tests for projection repair:
  - authoritative commit success + projection failure
  - later repair catches projection up to authoritative version
  - authoritative state remains correct even when projection update fails
- [ ] **Step 3.3:** Implement reconstruction helper that rebuilds current task state from authoritative history for sampled tasks.
- [ ] **Step 3.4:** Implement projection repair helper that replays missing authoritative commits into KV for lagging tasks.
- [ ] **Step 3.5:** Surface divergence and lag as explicit diagnostic output or structured logs.
- [ ] **Step 3.6:** Confirm no unexplained divergence in local/staging runs for sampled task sequences and confirm repair succeeds for sampled lagging tasks.
- [ ] **Step 3.7:** Run tests and gate.

### Verification

- replay/rebuild tests pass
- projection repair passes for sampled lagging tasks
- authoritative rebuild matches current served task state for representative sampled tasks
- no duplicate resulting versions in concurrency tests
- projection lag is visible before cutover

---

## Step 4 — Command-type cutover, compact responses, and boundary abuse tests

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
- Add boundary/security misuse tests

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
- explicit boundary abuse coverage:
  - valid principal, wrong repo
  - valid principal, wrong workspace
  - valid task id with mismatched boundary context
  - stolen or reused idempotency key from the wrong principal

### Checklist

- [ ] **Step 4.1:** Write failing integration tests for migrated command types through the full path.
- [ ] **Step 4.2:** Add failing security/boundary misuse tests.
- [ ] **Step 4.3:** Change the task service/store path so the migrated command types are authoritative in TaskObject.
- [ ] **Step 4.4:** Update mutation responses to use compact receipts by default.
- [ ] **Step 4.5:** Preserve full task reads through explicit read operations rather than mutation responses.
- [ ] **Step 4.6:** Confirm same idempotency key + same semantics returns original `action_id` and version even when the task has advanced.
- [ ] **Step 4.7:** Run tests and gate.

### Cutover gate for Step 4

Do not merge until all are true:

- [ ] No unexplained divergence remains in sampled shadow comparisons
- [ ] Replay and conflict tests are green
- [ ] Projection repair succeeds for sampled lagging tasks
- [ ] Compact response shape is stable and documented in tests
- [ ] Boundary/security misuse tests are green

---

## Step 5 — Build hardening, named validation artifacts, and rollback-readiness

**Branch:** `feat/task-command-store-step-05-build-hardening-rollback`  
**PR title:** `feat(task-store): step 5 — build hardening and rollback readiness`

### Goal

Make the migrated path build-safe and operationally safe before broadening to more complex commands.

### Files

- Modify/create reconciliation and repair helper if needed
- Create/modify named validation artifacts:
  - `scripts/validate/task-command-envelope-drift.mjs`
  - `scripts/validate/task-command-store-signatures.mjs`
  - `ops/validate-task-command-store.sh`
- Modify build/test wiring as needed

### Deliverables

- build failure on command envelope drift
- build failure on service-to-store signature drift
- build failure on authoritative-store contract-test failure
- one invokable validation script that runs the authoritative-path checks together
- clear rollback guidance for reads without reintroducing dual authority

### Checklist

- [ ] **Step 5.1:** Implement `scripts/validate/task-command-envelope-drift.mjs`.
- [ ] **Step 5.2:** Implement `scripts/validate/task-command-store-signatures.mjs`.
- [ ] **Step 5.3:** Implement `ops/validate-task-command-store.sh` to run the named authoritative-path validation set.
- [ ] **Step 5.4:** Wire those checks into the build/test path where appropriate.
- [ ] **Step 5.5:** Add tests proving projection failure does not corrupt authoritative state.
- [ ] **Step 5.6:** Document rollback rule in code comments and plan: after command-type cutover, roll back reads if needed, never restore dual authority for that command type.
- [ ] **Step 5.7:** Run full test/gate path.

### Verification

- authoritative state survives projection failure
- repair catches KV up to authoritative version
- named validation artifacts fail fast when authoritative command/store contracts drift
- rollback guidance is explicit and tested at the read-path level where practical

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
- [ ] **Step 6.4:** Re-run replay, rebuild, rollback, and projection repair checks.

---

## Verification ladder (every PR)

1. Targeted tests for the changed command/store path
2. Worker/runtime compile and type checks where applicable
3. `node scripts/validate/task-command-envelope-drift.mjs`
4. `node scripts/validate/task-command-store-signatures.mjs`
5. `bash ops/validate-task-command-store.sh`
6. `bash ops/pre-pr-mergeability-gate.sh`
7. Full `npm test` before or during the hardening/cutover steps where cross-path drift risk is highest

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

### Important anti-patterns to avoid

- Do **not** allow both KV and TaskObject to feel authoritative for the same migrated command type. Shadowing is allowed before cutover. Dual authority is not.
- Do **not** let handlers, services, and store all invent their own digest or validation rules. There must be one canonical builder, one canonical digest function, and one canonical validator.

---

## Acceptance criteria

The plan is complete when:

1. Route selection, state transition, and finding append are authoritative through `applyCommand()`.
2. Every successful migrated mutation returns one `action_id` and one resulting task version.
3. Replayed retries return the original result deterministically, even after later task advancement.
4. KV is projection-only for migrated command types.
5. Projection lag is visible, repairable, and repair is proven before command-type cutover.
6. Build and contract drift fail fast via named validation artifacts.
7. Runtime remains simple for the current single-user deployment.
8. Persisted receipts remain enterprise-shaped for future multi-user evolution.
