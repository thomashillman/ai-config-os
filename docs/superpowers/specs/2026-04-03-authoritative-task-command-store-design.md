# Single-User Runtime, Enterprise-Shaped Receipts: Authoritative Task-Scoped Command Store Design

**Date:** 2026-04-03  
**Status:** Proposed  
**Scope:** Task mutation path only  
**Deployment assumption:** Single user today, enterprise-shaped persistence and contracts for future multi-user rollout

## 1. Summary

ai-config-os currently uses KV as the primary durable task store, with Durable Objects acting as an optional, fire-and-forget replication target. That is good enough for continuity, but not strong enough for authoritative mutation history, deterministic retries, or future enterprise-grade attribution.

This design hardens the task mutation path without introducing a new platform architecture. The system keeps the existing handler → task service → store path, but changes the write boundary so that every state-changing task mutation is applied through one authoritative task-scoped command store.

The design uses three core concepts in the write model:

- **Principal**: the canonical actor identity
- **Authority**: the evaluated permission snapshot attached to one action
- **ActionCommit**: the immutable receipt for one state-changing task command

The runtime remains simple for a single owner today. Most actions will be performed by a default owner principal under direct-owner authority. But every authoritative receipt already carries org, workspace, repo, task, principal, and authority fields so historical data remains enterprise-legible later.

This design does **not** introduce full event sourcing, queue infrastructure, external IdP integration, or a broad enterprise control plane now. It only hardens the task mutation boundary.

## 2. Goals

### 2.1 Primary goals

1. Make one task-scoped store the authoritative source for state-changing task mutations.
2. Ensure each mutation produces exactly one immutable `ActionCommit` and exactly one resulting task version.
3. Support safe retries through strict idempotency semantics.
4. Demote KV to projection and index storage after cutover.
5. Preserve a simple single-user runtime while keeping persisted receipts ready for future enterprise use.

### 2.2 Non-goals

This design does not implement:

- external human identity sync
- org admin UX
- approval issuance UX
- delegation management UX
- non-task authoritative mutation flows
- full event-sourced rebuild of the whole platform
- queue or stream processing infrastructure

## 3. Current context and constraints

### 3.1 Current repo shape

The current task path is already task-shaped and should be preserved:

- Worker handlers expose task mutation endpoints in `worker/src/handlers/tasks.ts`
- task operations are normalised through `runtime/lib/task-control-plane-service-core.mjs`
- KV is the default durable task store in `runtime/lib/task-store-kv.mjs`
- TaskObject Durable Objects exist in `worker/src/task-object.ts`, but are currently a write-only replication target in the dual-write path
- dual-write behaviour is feature-flagged in `worker/src/task-runtime.ts`
- KV-first, DO-second dual-write logic is implemented in `worker/src/dual-write-task-store.ts`

### 3.2 Operational reality

The user is the only operator today. Cutover risk is mainly about build correctness, dependency management, and deterministic migration, not organisational adoption.

### 3.3 Design implication

The runtime should stay simple today, but the persisted authoritative history should already support future enterprise use. That means:

- default org/workspace/principal are acceptable now
- hard-coding the absence of org/workspace/authority into the receipt model is not acceptable

## 4. Recommended approach

### 4.1 Chosen approach

Adopt an **authoritative task-scoped command store** with a **three-concept write model**, **projection-only KV**, and **staged cutover by command type**.

### 4.2 Why this approach

This fits the repo because it:

- reuses the current handler → service → store path
- promotes an existing task-scoped seam instead of inventing a workspace-wide coordinator
- avoids a second “audit ledger” beside task state
- remains compatible with current Cloudflare Worker + KV + TaskObject architecture
- keeps the runtime simple for single-user operation now

### 4.3 Alternatives considered

#### Alternative A: keep KV authoritative and add richer audit logs

Rejected. This preserves ambiguity in the mutation boundary and leaves authoritative state and audit history too loosely coupled.

#### Alternative B: full event sourcing now

Rejected for now. Cleaner long-term, but too disruptive for the current repo and too large a migration for the problem being solved today.

#### Alternative C: workspace-wide authoritative coordinator

Rejected. The current hot path is task-shaped. A workspace-wide coordinator adds contention and complexity without clear benefit.

## 5. Architecture

The authoritative mutation path is:

**handler → existing task service → authoritative task-scoped store**

Everything else is read-side projection.

### 5.1 Components

#### Worker handlers

`worker/src/handlers/tasks.ts` remains the public mutation surface. Handlers are responsible for:

- authenticating the caller at the transport boundary
- resolving the canonical principal from the authenticated session or service identity
- validating that the caller may act against the requested task boundary
- building the typed internal command envelope
- calling the existing task service

Handlers must **not** persist state directly and must **not** allow clients to supply authoritative principal or authority fields.

#### Task control-plane service

`runtime/lib/task-control-plane-service-core.mjs` remains the normalisation layer. It is responsible for:

- mapping existing task operations onto typed internal commands
- validating command-type-specific rules
- routing all state-changing operations to the authoritative store via `applyCommand()`

It must not create parallel mutation paths.

#### Authoritative task-scoped store

The task-scoped store is the only authority for state-changing task commands. This should be implemented by evolving `worker/src/task-object.ts` rather than introducing a new subsystem.

The authoritative store must:

- accept one `applyCommand()` operation for authoritative writes
- append one immutable `ActionCommit`
- derive the resulting `PortableTaskObject` version
- persist commit, state, version, and idempotency index together
- reject conflicting or malformed writes cleanly

#### Projection layer

KV and other read models remain downstream projections. They may serve:

- recent task lists
- short-code lookups
- name lookups
- task readiness views
- dashboard summaries
- analytics inputs

If projections disagree with the authoritative store, the authoritative store wins.

## 6. Write-model concepts

### 6.1 Principal

`Principal` is the canonical actor identity.

Required fields:

- `principal_id`
- `principal_type` (`human`, `agent`, `service_account`, `system`)
- `org_id`
- `workspace_ids` or default workspace binding
- status flags such as suspended or deleted

Single-user deployment today will typically use:

- one default owner principal
- one or more internal agent or system principals

### 6.2 Authority

`Authority` is the evaluated permission snapshot attached to one action. It is embedded in `ActionCommit` and not treated as a separate hot-path domain object.

Required fields:

- `mode` (`direct_owner`, `delegated`, `approval_backed`)
- `org_id`
- `workspace_id`
- `repo_id`
- `action_scope`
- `grant_ids`
- `delegation_ids`
- `approval_ids`
- `evaluated_at`

In single-user mode today, most commits will use `direct_owner` with a small set of populated fields.

### 6.3 ActionCommit

`ActionCommit` is the immutable receipt for one state-changing task mutation.

Required fields:

- `action_id`
- `task_id`
- `command_type`
- `command_digest`
- `principal_id`
- embedded `authority`
- `request_id`
- `trace_id`
- optional validated execution context, such as `route_id` and `model_path`
- `created_at`
- `task_version_before`
- `task_version_after`
- `result`
- `result_summary`

No task version may exist without a parent `ActionCommit`.

## 7. Internal applyCommand contract

`applyCommand()` is an **internal authoritative store contract**, not a public client contract.

### 7.1 Command envelope

The server constructs and validates the internal command envelope. Clients provide command intent and an idempotency key, but not authoritative identity or authority.

```json
{
  "task_id": "task_01H...",
  "idempotency_key": "idem_01H...",
  "expected_task_version": 7,
  "command_type": "task.append_finding",
  "payload": {
    "finding": {
      "finding_id": "f_01H...",
      "summary": "Null pointer risk in webhook handler",
      "status": "verified",
      "recorded_by_route": "local_repo",
      "recorded_at": "2026-04-03T14:00:00Z"
    },
    "updated_at": "2026-04-03T14:00:00Z"
  },
  "request_context": {
    "request_id": "req_01H...",
    "trace_id": "trace_01H...",
    "surface": "worker",
    "created_at": "2026-04-03T14:00:00Z"
  },
  "resolved_context": {
    "principal_id": "prn_01H...",
    "principal_type": "agent",
    "authority": {
      "mode": "delegated",
      "org_id": "org_01H...",
      "workspace_id": "ws_01H...",
      "repo_id": "repo_01H...",
      "action_scope": "task.append_finding",
      "grant_ids": ["grant_01H..."],
      "delegation_ids": ["dlg_01H..."],
      "approval_ids": [],
      "evaluated_at": "2026-04-03T14:00:00Z"
    },
    "validated_execution": {
      "route_id": "local_repo",
      "model_path": {
        "policy_version": "rp.v1",
        "provider": "anthropic",
        "model": "sonnet",
        "tier": "interactive"
      }
    }
  }
}
```

### 7.2 Store responsibilities

The authoritative store must:

- reject commands missing required fields
- reject commands whose task boundary does not match the actual task record
- reject commands whose authority does not allow the requested action scope
- derive `action_id` internally
- derive `command_digest` internally
- derive resulting task version internally
- write commit, current state, current version, and idempotency index together

### 7.3 Success response

The default hot-path success response should stay compact.

```json
{
  "ok": true,
  "action_id": "act_01H...",
  "task_id": "task_01H...",
  "resulting_task_version": 8,
  "replayed": false,
  "projection_status": "applied"
}
```

Returning the full task should be opt-in or handled through a separate read where appropriate.

## 8. Idempotency semantics

### 8.1 Identifier model

The client supplies one stable `idempotency_key` per logical command attempt.

The server supplies:

- `action_id` for the immutable receipt
- `request_id` and `trace_id` for observability

`command_id` is intentionally omitted to keep the write path simpler.

### 8.2 Stable digest

The authoritative store computes `command_digest` over semantic fields only:

- `task_id`
- `command_type`
- `expected_task_version`
- canonicalised payload
- `principal_id`
- effective authority boundary and action scope
- validated execution context where relevant

It must exclude volatile fields such as transport timestamps or retry-specific headers.

### 8.3 Rules

- Same `idempotency_key` + same digest + already committed: return original `action_id`, version, and `replayed: true`
- Same `idempotency_key` + different digest: reject with `idempotency_key_reused`
- New `idempotency_key` + stale `expected_task_version`: reject with `version_conflict`
- Failed attempt with no persisted commit: same key may retry

If the original command committed successfully and later retries arrive with the same key, the store returns the original result even if the task has since advanced beyond the original expected version.

## 9. Store-side processing sequence

The authoritative store must process writes in this order:

1. Validate envelope shape
2. Validate task boundary and authority against actual task state
3. Check idempotency index
4. If duplicate with matching digest, return prior result
5. If duplicate with mismatched digest, reject
6. Check `expected_task_version`
7. Derive the resulting task state
8. Atomically persist:
   - `ActionCommit`
   - new current task state
   - new current version
   - idempotency index entry
9. Trigger projection update or mark projection lag

The store must not write commit and state separately.

## 10. Error model

The authoritative path must use explicit machine-readable errors.

Minimum error set:

- `invalid_command`
- `unauthorized`
- `boundary_mismatch`
- `task_not_found`
- `idempotency_key_reused`
- `version_conflict`
- `projection_pending`

Important behavioural distinction:

- **duplicate replay of a prior success** is not an error
- **true concurrent stale write** is `version_conflict`

## 11. Security model

### 11.1 Server-stamped authority

Clients must not supply authoritative:

- `principal_id`
- `principal_type`
- `authority`
- `org_id`, `workspace_id`, or `repo_id` as trusted values
- validated route or model-path metadata as trusted values

Clients may only supply command intent and retry identity.

### 11.2 Boundary enforcement

The authoritative path must verify that:

- the task belongs to the repo and workspace implied by the server-resolved boundary
- the principal is allowed to act in that boundary
- the action scope matches the command type

### 11.3 Sensitive response minimisation

Hot-path mutation responses should be compact by default. Full task reads should require appropriate read permissions.

## 12. Projection model

### 12.1 Projection role

KV becomes projection and index storage after cutover. It is not authoritative.

### 12.2 Projection updates

After a successful authoritative commit:

- attempt inline projection update when cheap and safe
- if projection update fails, mark projection status as pending in authoritative metadata
- scheduled reconciliation replays missing commits into KV

### 12.3 Projection observability

Track at least:

- `authoritative_version`
- `projected_version`
- `projection_lag`
- projection update failures
- rebuild success or failure

## 13. Snapshots and retention

Keep the first version simple.

- snapshot every 25 commits
- snapshot on terminal task state
- rebuild from latest snapshot plus remaining commits

Do not add general compaction or queueing infrastructure now. Revisit only if task streams prove large enough to justify it.

## 14. Verification strategy

### 14.1 Unit tests

Test shared command building and validation:

- envelope construction
- digest stability
- idempotency-key rules
- server-stamped principal and authority resolution
- error taxonomy

### 14.2 Store tests

Test authoritative `applyCommand()` for:

- same key + same digest replay
- same key + different digest rejection
- stale version conflict
- exactly one `ActionCommit` and exactly one resulting task version per success
- projection failure without authoritative corruption

### 14.3 Integration tests

Test handler → service → store for the first migrated command types:

- `task.select_route`
- `task.transition_state`
- `task.append_finding`

### 14.4 Concurrency tests

Use a deterministic harness:

- two concurrent commands with same expected version
- one succeeds
- one gets a true `version_conflict`
- no duplicate resulting versions

Repeat with retries using the same `idempotency_key`.

### 14.5 Security tests

Test that callers cannot smuggle:

- a different principal
- a broader boundary
- a wider action scope
- unvalidated route or model-path metadata

### 14.6 Projection and rebuild tests

Test:

- authoritative commit success + projection failure
- subsequent scheduled repair
- rebuild of sampled tasks from authoritative history

## 15. Migration plan

### 15.1 Principle

Cutover is a build and dependency integrity problem first, and a runtime trust problem second. It is not a user adoption problem right now.

### 15.2 Command-type sequence

Migrate by command type, not by broad storage role.

Start with:

- `task.select_route`
- `task.transition_state`
- `task.append_finding`

Later:

- `task.create`
- `task.create_continuation`

### 15.3 Stages

#### Stage 1: contract introduction

- introduce server-side command builder
- introduce `ActionCommit` shape
- add tests and build gates
- no behavioural cutover yet

#### Stage 2: authoritative shadowing

- authoritative store receives `applyCommand()` in shadow for narrow command types
- KV remains served source
- compare authoritative reconstruction with served state

#### Stage 3: command-type cutover

- one command type at a time becomes authoritative in the task-scoped store
- KV becomes projection for that command type
- single-task detail reads may cut over first

#### Stage 4: projection hardening

- add scheduled reconciliation
- add projection lag visibility
- prove rebuild works

#### Stage 5: broaden coverage

- migrate more complex command types after narrow ones are stable

## 16. Cutover gates

A command type may cut over only when all of these are true:

1. No unexplained divergence in sampled shadow comparisons
2. Idempotent replay behaviour proven in tests and staging
3. Rebuild from authoritative history matches served task state for sampled tasks
4. No duplicate resulting versions under conflict testing
5. Projection rebuild tooling succeeds before read cutover
6. Build and dependency checks pass deterministically for the authoritative path

## 17. Rollback rules

### 17.1 Before authoritative cutover

If a command type is still in shadow mode, disable the feature flag and continue using the old path.

### 17.2 After authoritative cutover

Do **not** reintroduce dual authority.

If problems occur after authoritative cutover:

- roll back reads to projection sources if needed
- pause further migration of command types
- repair projections from authoritative history
- freeze the affected command type if the authoritative store itself is suspect

Do not discard authoritative history once written.

## 18. Build and dependency hardening

Because the Worker build already depends on root-level generation and root-level packages, this migration must harden build integrity around the authoritative path.

Required build protections:

- fail build if command envelope schema drifts from authoritative store expectations
- fail build if service-to-store call signatures drift
- fail build if authoritative-store contract tests fail
- keep command builder and validator in one shared path used by handlers and tests

The migration should not introduce hidden cross-package dependency coupling between root, Worker, and runtime modules.

## 19. KISS decisions

Explicit simplifications retained in this design:

- no full event sourcing
- no queue subsystem
- no workspace-wide coordinator
- no external IdP implementation now
- no projection service tier
- no broad enterprise admin workflows now
- no command id separate from idempotency key

These are deliberately omitted because they do not improve the current trust boundary enough to justify their complexity in the current architecture.

## 20. Open assumptions

These assumptions are explicit and acceptable for this design:

- single-user runtime today with one default owner principal
- future multi-user enterprise compatibility required in persisted receipts
- task mutations are the only authoritative scope addressed by this design
- TaskObject is the correct seam to promote into the authoritative store

## 21. Acceptance criteria

The design is successful when:

1. Every successful migrated task mutation returns one `action_id` and one resulting task version
2. No task version exists without a parent `ActionCommit`
3. Same idempotency key + same semantics returns the original result
4. Same idempotency key + different semantics fails deterministically
5. New stale writes fail with `version_conflict`
6. Projection lag is visible and repairable
7. Rebuild from authoritative history reconstructs sampled task state accurately
8. KV is projection-only for migrated command types
9. The runtime remains simple for the current single-user deployment
10. Historical receipts are enterprise-shaped for future multi-user evolution
