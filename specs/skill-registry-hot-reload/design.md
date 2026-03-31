# Design: Track B Runtime Convergence with Root Dashboard Gate

## Architecture Overview

Converge duplicated MCP/dashboard runtime action behavior behind shared runtime modules, while preserving Worker-safe task service boundaries and making dashboard validation part of root mergeability enforcement.

### Current vs Target

- Current:
  - Task operations are largely shared through `runtime/lib/task-control-plane-service*.mjs`.
  - Several non-task actions are still duplicated between `runtime/mcp/handlers.mjs` and `runtime/mcp/dashboard-api.mjs`.
  - Root `verify` has not consistently enforced dashboard test/build in all execution environments.
- Target:
  - One shared action matrix + dispatcher path governs shared runtime actions.
  - MCP and dashboard become thin transport adapters for shared behavior.
  - Root `verify` and PR mergeability workflow both enforce dashboard checks.

## Core Components and Interfaces

### 1) Runtime Action Matrix

File:

- `runtime/lib/runtime-action-matrix.mjs`

Responsibilities:

- Define action classification (`shared-service`, `script-wrapper`, `surface-only`).
- Expose lookup helpers for dispatcher and parity tests.

Interface contract:

- Deterministic, version-controlled map.
- Complete coverage for all MCP/dashboard shared actions.

### 2) Shared Runtime Action Dispatcher

File:

- `runtime/lib/runtime-action-dispatcher.mjs`

Responsibilities:

- Route `script-wrapper` actions through one mapping path.
- Normalize/default arguments before execution.
- Throw typed errors for unknown action and invalid arguments.

Interface contract:

- Input: `actionName`, `actionArgs`.
- Output: normalized execution result shared by MCP and dashboard wrappers.
- Errors: typed and surface-mappable.

### 3) MCP Adapter Layer

File:

- `runtime/mcp/handlers.mjs`

Responsibilities:

- Delegate script-wrapper actions to dispatcher.
- Preserve existing task-service routing and tool contract behavior.

Integration contract:

- Tool names and response envelopes remain backward compatible.
- Capability profile attachment and existing tool error semantics remain intact.

### 4) Dashboard API Adapter Layer

File:

- `runtime/mcp/dashboard-api.mjs`

Responsibilities:

- Delegate script-backed routes to dispatcher.
- Preserve dashboard route structure and JSON envelope format.

Integration contract:

- Existing route paths and success/failure payload structure remain stable.
- Dashboard-specific transport details stay local to this adapter.

### 5) Root Verification and Mergeability Gate

Files:

- `scripts/build/verify.mjs`
- `.github/workflows/pr-mergeability-gate.yml`

Responsibilities:

- `verify.mjs` runs dashboard test and dashboard production build as explicit steps.
- PR mergeability workflow installs dashboard dependencies before `npm run -s verify`.

Integration contract:

- Dashboard regressions fail branch mergeability via the same root gate used by CI.
- Dashboard enforcement is part of normal branch readiness, not an optional side workflow.

## Data Flow

### Script-wrapper action flow (MCP/dashboard)

1. Surface adapter receives request.
2. Adapter identifies action and forwards to dispatcher.
3. Dispatcher validates and normalizes args.
4. Dispatcher runs mapped script/service path.
5. Adapter wraps result in surface-specific transport envelope.

### Mergeability flow (dashboard gate)

1. PR workflow installs root dependencies.
2. PR workflow installs dashboard dependencies.
3. PR workflow runs root `verify`.
4. Root `verify` executes dashboard tests and dashboard build.
5. Any dashboard failure fails mergeability.

## Technical Decisions

1. Preserve script execution boundary where integration still relies on shell/runtime scripts.
2. Centralize shared action mapping/validation to remove drift.
3. Keep Worker-safe separation explicit; do not move Node-only behavior into Worker runtime.
4. Enforce dashboard readiness through root verification path to keep one mergeability truth.

## Error Handling Strategy

- Dispatcher emits explicit typed errors (`unknown-action`, `invalid-arguments`).
- MCP maps typed errors to existing tool error responses.
- Dashboard maps typed validation errors to `400` envelope responses.
- Root verifier fails fast on dashboard test/build failures with step-level context.

## File Change Plan

Add:

- `runtime/lib/runtime-action-matrix.mjs`
- `runtime/lib/runtime-action-dispatcher.mjs`
- `runtime/lib/runtime-action-dispatcher.test.mjs`

Update:

- `runtime/mcp/handlers.mjs`
- `runtime/mcp/dashboard-api.mjs`
- `runtime/mcp/dashboard-api.test.mjs`
- `runtime/mcp/contract-parity.test.mjs`
- `scripts/build/verify.mjs`
- `.github/workflows/pr-mergeability-gate.yml`

## Test Strategy

### Unit tests

- Dispatcher + matrix behavior:
  - mapping lookup
  - argument defaults/normalization
  - typed error paths

### Adapter tests

- MCP handler tests for migrated script-wrapper actions.
- Dashboard API tests for migrated routes and error semantics.

### Parity tests

- Matrix-driven parity checks for classified shared actions across MCP/dashboard.

### Gate tests

- Root `npm run -s verify` includes dashboard test/build.
- Mergeability workflow path provisions dashboard dependencies before verify.

## Open Risks

1. Baseline unrelated test failures can obscure gate wiring outcomes in local validation.
2. Surface-specific response post-processing could still drift if parity assertions are incomplete.
3. Command invocation differences across OS shells can break dashboard checks unless verifier invocation is cross-platform-safe.

Mitigations:

- Keep parity tests table-driven from the matrix.
- Keep dashboard gate commands explicit and shell-compatible in verifier.
- Report baseline failures separately from convergence/gate integration status.

## Definition of Done

- Shared dispatcher + matrix own shared runtime action behavior.
- MCP/dashboard parity checks enforce equivalent behavior for classified shared actions.
- Root `verify` and PR mergeability workflow enforce dashboard test/build.
- Worker-safe control-plane boundaries remain intact and unchanged.
