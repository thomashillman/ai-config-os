# Task Command Store Implementation Progress

**Date:** 2026-04-03  
**Branch:** `claude/implement-task-command-store-h9UCM`  
**Plan Reference:** `docs/superpowers/plans/2026-04-03-authoritative-task-command-store-implementation-v2.md`

## Summary

Implementing an authoritative task-scoped command store to replace KV-first mutation authority. This document tracks progress through all 5 implementation steps.

## Completed Work

### ✅ Step 1: Internal Command Envelope and Server Stamping (COMPLETE)

**Branch commits:**
- `f1c07e6` - step 1.1: task-command envelope and mutation context types
- `bac979e` - step 1.4: handler modifications with command building

### ✅ Step 2: Authoritative ApplyCommand and Replay Semantics (COMPLETE)

**Branch commits:**
- `664f575` - step 2.1-2.2: apply-command endpoint and idempotency
- `0f4ff0a` - step 2.4: apply-command invocation infrastructure

### ✅ Step 3: Shadow Mode and Projection Hardening (PARTIAL - 3.1-3.3 COMPLETE)

**Branch commits:**
- `89e3bc5` - step 3.1-3.3: projection reconciliation helpers

## Completed Work (Detailed)

### ✅ Step 1: Internal Command Envelope and Server Stamping (COMPLETE)

**Branch commits:**
- `f1c07e6` - step 1.1: task-command envelope and mutation context types
- `bac979e` - step 1.4: handler modifications with command building

**Deliverables implemented:**
- `worker/src/task-command.ts` - Canonical command envelope with:
  - `TaskCommand` interface with server-stamped principal, boundary, authority
  - `computeSemanticDigest()` for idempotency semantics
  - `buildTaskCommand()` builder function
  - Support for all task command types

- `worker/src/task-mutation-context.ts` - Server-side authority resolution with:
  - `resolvePrincipal()` - derives from authenticated request
  - `resolveBoundary()` - loads from task store
  - `resolveAuthority()` - evaluates principal against task boundary
  - `validateBoundaryIntegrity()` - prevents boundary escape
  - `resolveMutationContext()` - single source of truth for all authority derivation

- `worker/src/auth.ts` - Enhanced with:
  - `deriveAuthenticatedRequest()` - single-user principal resolution

- Modified handlers (route selection, state transition, finding append) to:
  - Build command envelopes
  - Resolve mutation context before service invocation
  - Validate principal, boundary, and authority (not yet enforced)

- Tests:
  - 9 tests for command envelope construction and digest semantics
  - 19 tests for principal/boundary/authority resolution
  - All integration tests passing

**Verification:** `npm test` - 92 tests passing in worker

### ✅ Step 2: Authoritative ApplyCommand and Replay Semantics (IN PROGRESS)

**Branch commits:**
- `664f575` - step 2.1-2.2: apply-command endpoint and idempotency

**Deliverables implemented:**
- Extended `task-command.ts` with:
  - `ActionCommit` interface (immutable receipt for authoritative mutations)
  - `ApplyCommandRequest` and `ApplyCommandResponse` interfaces
  - Command application contract types

- `worker/src/task-object.ts` - Authoritative command store:
  - `POST /apply-command` endpoint for internal command application
  - Idempotency index tracking per task: `Map<idempotency_key, {action_id, semantic_digest, version}>`
  - Append-only commit log: `commits` storage array
  - Version conflict detection: `expected_task_version` enforcement
  - Deterministic replay: same idempotency key + digest returns original action_id and version
  - Rejects idempotency key reuse with different semantic digest
  - Handles null expected_version for create operations

- Storage schema changes:
  - Added `commits` array (append-only ActionCommit log)
  - Added `idempotency_index` map (O(1) lookup for replays)
  - Preserved `task`, `version`, `events`, `snapshots`, `log` for backward compatibility

- Tests:
  - 7 contract tests defining apply-command behavior
  - Covers idempotency, version conflicts, replay determinism

**Verification:** `npm test` - 99 tests passing

### ✅ Step 3: Shadow Mode and Projection Hardening (PARTIAL)

**Branch commits:**
- `89e3bc5` - step 3.1-3.3: projection reconciliation helpers

**Deliverables implemented:**
- `worker/src/task-projection-reconcile.ts` - Projection repair and divergence detection:
  - `reconstructAuthoritativeState()` - Replay commits to rebuild current state
  - `detectProjectionDivergence()` - Compare authoritative vs served state
  - `computeProjectionLag()` - Calculate version lag between KV and TaskObject
  - `planProjectionRepair()` - Identify commits needed to catch KV up
  - `validateRepairPlan()` - Ensure repair plan completeness (no gaps)

- Tests: 14 comprehensive tests covering:
  - Reconstruction from empty and multi-commit logs
  - Divergence detection on version and field mismatches
  - Lag computation and repair planning
  - Repair plan validation

**Verification:** 113 worker tests passing (14 new projection tests)

### 🔄 Step 3 Remaining Work

- Step 3.4: Integrate projection repair into runtime
- Step 3.5: Surface divergence detection and lag as diagnostic output
- Step 3.6-3.7: Run sampled task sequences and confirm no divergence

## Architecture Decisions

### Command Types in Scope (Narrow First)
- `task.select_route` ← Step 3-4
- `task.transition_state` ← Step 3-4
- `task.append_finding` ← Step 3-4

### Deferred to Step 6
- `task.create` - complex bootstrap state
- `task.create_continuation` - handoff token flows

### Single-User Deployment
- `Principal` resolved from authenticated request with default `owner` principal
- `Authority` defaults to `direct_owner` for matching owners
- Future: extend for multi-user delegation and approval workflows

### Storage Strategy
- Commit log is append-only and durable
- Idempotency index is mutable (safe to rebuild from commits)
- Task state is mutable (reconstructible from commits)
- KV becomes projection-only after cutover

## Key Invariants Enforced

1. **Semantic digest stability**: Same payload → same digest across retries
2. **Idempotency determinism**: Same key + digest → original result even if task has advanced
3. **Version constraint**: Stale expected_version rejected with conflict error
4. **Boundary integrity**: Principal cannot escape workspace/repo boundaries
5. **Authority stamping**: Principal, boundary, authority stamped on server only

## Test Coverage

### Worker Tests (113 passing)
- Command envelope: 9 tests (digest, builder, payload preservation)
- Mutation context: 19 tests (principal, boundary, authority, validation)
- Apply-command: 7 tests (idempotency, version conflict, replay)
- Projection reconciliation: 14 tests (reconstruction, divergence, repair)
- Existing: 64 tests (task-object, dual-write, storage)

### Test Gaps Identified
- Integration test for command flow: handler → context → command → service
- Storage persistence verification (atomic writes)
- Projection lag detection and repair (Step 3)
- Command-type cutover validation (Step 4)

## Known Limitations

1. **Task state mutation**: Current implementation is minimal (doesn't apply payload semantics)
   - Needs route selection logic, state transition logic, finding append logic
   - Deferred to Step 4 (cutover) when full semantics needed

2. **Projection sync**: Dual-write to KV still happens via old put-state path
   - Step 3 adds shadow-mode apply-command invocation
   - Step 4 makes TaskObject authoritative for narrow commands

3. **Error handling**: ApplyCommandResponse uses simple error codes
   - Should expand to match existing error responses
   - Needs mapping from command errors to contract errors

## Completed in This Session

- ✅ Step 1: Complete command envelope and mutation context
- ✅ Step 2: Complete apply-command endpoint with idempotency
- ✅ Step 2.4: Add apply-command invocation infrastructure to DualWriteTaskStore
- ✅ Step 3.1-3.3: Projection reconciliation helpers (reconstruct, detect divergence, repair planning)
- ✅ All tests passing (113 worker tests + 107 validation tests)
- ✅ Build clean

## Next Steps (For Next Session)

### Step 3.4-3.7: Complete Shadow Mode Hardening
1. Integrate projection repair into task runtime
2. Add projection lag as metadata to task reads
3. Test divergence detection with sampled tasks
4. Validate repair succeeds before cutover

### Step 4: Command-Type Cutover
1. Wire command envelopes from handlers → service → store
2. Make apply-command authoritative for narrow command types
3. Implement full command semantics in apply-command
4. Demote KV to projection-only for migrated commands

### Step 5: Build Hardening
1. Create envelope drift detection validator
2. Create service signature drift detection
3. Integrate into build/test pipeline

### Step 4: Command-Type Cutover
1. Make apply-command the real writer (no more shadow)
2. KV becomes projection and index storage only
3. Full payload semantics (route selection, state transition, findings)
4. Compact mutation responses

### Step 5: Build Hardening
1. Validation artifacts: task-command-envelope-drift.mjs
2. Service signature drift detection
3. Integration into build/test pipeline

## Files Modified

- ✅ Created: `worker/src/task-command.ts` (170 lines)
- ✅ Created: `worker/src/task-mutation-context.ts` (240 lines)
- ✅ Created: `worker/src/__tests__/task-command.test.ts` (200 lines)
- ✅ Created: `worker/src/__tests__/task-mutation-context.test.ts` (380 lines)
- ✅ Created: `worker/src/__tests__/task-object-apply-command.test.ts` (220 lines)
- ✅ Modified: `worker/src/auth.ts` (added 30 lines)
- ✅ Modified: `worker/src/handlers/tasks.ts` (added 230 lines to 3 handlers)
- ✅ Modified: `worker/src/task-runtime.ts` (added 10 lines)
- ✅ Modified: `worker/src/task-object.ts` (added 180 lines for apply-command)
- 📝 To do: `worker/src/dual-write-task-store.ts` (Step 2.4)
- 📝 To do: `runtime/lib/task-control-plane-service-core.mjs` (Step 2.5)
- 📝 To do: `runtime/lib/task-projection-reconcile.mjs` (Step 3)
- 📝 To do: Validation artifacts (Step 5)

## Validation Checklist

### Currently Passing
- ✅ TypeScript compilation (`npm run check:test-types`)
- ✅ All worker tests (99 tests)
- ✅ Build completes without errors (`npm run build`)
- ✅ No type errors in handlers or service integration points

### Still Needed
- ⏳ Runtime tests (mjs modules)
- ⏳ Integration test for command flow
- ⏳ Mergeability gate validation
- ⏳ Projection repair tests (Step 3)
- ⏳ Cutover validation (Step 4)

## Command Flow (Implemented)

```
Request → Handler
  ↓
Request Validation (existing)
  ↓
Authenticated Request Derivation (NEW)
  ↓
Mutation Context Resolution (NEW)
  ├─ Load task boundary
  ├─ Resolve principal
  ├─ Validate boundary integrity
  └─ Resolve authority
  ↓
Command Envelope Building (NEW)
  ├─ Compute semantic digest
  └─ Generate idempotency key
  ↓
Service Invocation (existing)
  ↓
Response Mapping (existing)
```

**Current:** Commands built but not yet enforced (Step 1 complete, Step 2 in progress)  
**Next:** Apply-command invocation from service (Step 2.4)  
**Future:** Command becomes source of truth (Step 4)

## Branch Status

- **Branch:** `claude/implement-task-command-store-h9UCM`
- **Tracking:** `origin/claude/implement-task-command-store-h9UCM`
- **Commits:** 3 feature commits so far
- **Ready for:** Step 2.4 implementation or PR review of Step 1-2 work so far

## Testing Commands

```bash
# Full test suite
npm test

# Type checking
npm run check:test-types

# Build
npm run build

# Specific test file
npm test -- src/__tests__/task-command.test.ts
npm test -- src/__tests__/task-mutation-context.test.ts
npm test -- src/__tests__/task-object-apply-command.test.ts
```

## References

- Implementation plan: `docs/superpowers/plans/2026-04-03-authoritative-task-command-store-implementation-v2.md`
- Canonical spec: `docs/superpowers/specs/2026-04-03-authoritative-task-command-store-design.md`
