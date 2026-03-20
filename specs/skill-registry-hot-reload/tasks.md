# Tasks: Track B Runtime Convergence

## Chosen Granularity

`fine`

## Phase 1: Shared Runtime Foundations (POC-first)

- [x] T001 Create runtime action matrix source of truth
  - Target files:
    - `runtime/lib/runtime-action-matrix.mjs`
  - Success criteria:
    - Exports action classification metadata for all current MCP/dashboard shared actions.
    - Includes helper accessors used by dispatcher and tests.
  - Verification:
    - `node --test runtime/lib/runtime-action-dispatcher.test.mjs` (after T002/T003 exist)
  - Commit:
    - `feat(runtime): add runtime action matrix for convergence`

- [x] T002 Create shared runtime action dispatcher with typed validation errors
  - Target files:
    - `runtime/lib/runtime-action-dispatcher.mjs`
  - Success criteria:
    - Normalizes/validates action args and maps actions to script commands.
    - Returns normalized result shape and throws typed errors for unknown/invalid actions.
  - Verification:
    - `node --test runtime/lib/runtime-action-dispatcher.test.mjs`
  - Commit:
    - `feat(runtime): add shared action dispatcher for script wrappers`

- [x] T003 Add unit tests for matrix + dispatcher behavior
  - Target files:
    - `runtime/lib/runtime-action-dispatcher.test.mjs`
  - Success criteria:
    - Covers mapping resolution, default normalization, validation failures, and unknown action handling.
    - Fails before dispatcher implementation and passes after.
  - Verification:
    - `node --test runtime/lib/runtime-action-dispatcher.test.mjs`
  - Commit:
    - `test(runtime): cover action dispatcher mapping and validation`

- [x] [VERIFY] T004 Validate POC foundation before adapter migration
  - Target files:
    - none (verification task)
  - Success criteria:
    - Dispatcher and matrix tests pass reliably.
    - No task/control-plane service regressions introduced by new runtime modules.
  - Verification:
    - `node --test runtime/lib/runtime-action-dispatcher.test.mjs runtime/lib/task-control-plane-service.test.mjs`
  - Commit:
    - `chore(runtime): verify foundation before adapter migration`

## Phase 2: MCP and Dashboard Adapter Convergence

- [x] T005 Migrate MCP script-wrapper actions to shared dispatcher
  - Target files:
    - `runtime/mcp/handlers.mjs`
  - Success criteria:
    - Script-wrapper tool branches use dispatcher instead of duplicated command mapping.
    - Existing task-service and momentum tool flows remain unchanged.
    - MCP response shaping stays compatible.
  - Verification:
    - `node --test runtime/mcp/handlers.test.mjs`
  - Commit:
    - `refactor(mcp): route script-wrapper tools through dispatcher`

- [x] T006 Migrate dashboard API script-wrapper endpoints to shared dispatcher
  - Target files:
    - `runtime/mcp/dashboard-api.mjs`
  - Success criteria:
    - Dashboard script-backed endpoints call dispatcher for mapping/validation/defaults.
    - Existing endpoint paths and JSON envelope remain stable.
  - Verification:
    - `node --test runtime/mcp/dashboard-api.test.mjs`
  - Commit:
    - `refactor(dashboard): use shared dispatcher for runtime actions`

- [x] [P] T007 Extend dashboard adapter tests for dispatcher-backed behavior
  - Target files:
    - `runtime/mcp/dashboard-api.test.mjs`
  - Success criteria:
    - Tests assert argument normalization and invalid-input handling for dispatcher-backed endpoints.
    - Existing tunnel and route registration coverage remains intact.
  - Verification:
    - `node --test runtime/mcp/dashboard-api.test.mjs`
  - Commit:
    - `test(dashboard): cover dispatcher parity behaviors`

- [x] [P] T008 Extend MCP/dashboard parity tests to action-level equivalence
  - Target files:
    - `runtime/mcp/contract-parity.test.mjs`
  - Success criteria:
    - Table-driven tests cover all `script-wrapper` actions in the matrix.
    - Assertions include action identity, normalized args, success payload fields, and error semantics.
  - Verification:
    - `node --test runtime/mcp/contract-parity.test.mjs`
  - Commit:
    - `test(mcp): add action-level parity matrix checks`

- [x] [VERIFY] T009 Run full convergence verification and finalize cleanup
  - Target files:
    - `runtime/mcp/handlers.mjs`
    - `runtime/mcp/dashboard-api.mjs`
    - `runtime/mcp/dashboard-api.test.mjs`
    - `runtime/mcp/contract-parity.test.mjs`
    - `runtime/lib/runtime-action-matrix.mjs`
    - `runtime/lib/runtime-action-dispatcher.mjs`
    - `runtime/lib/runtime-action-dispatcher.test.mjs`
  - Success criteria:
    - All convergence and parity tests pass in one run.
    - Duplicated per-surface script mapping logic removed or minimized to thin adapters.
    - No contract regressions in task-service paths.
  - Verification:
    - `node --test runtime/lib/runtime-action-dispatcher.test.mjs runtime/lib/task-control-plane-service.test.mjs runtime/mcp/dashboard-api.test.mjs runtime/mcp/contract-parity.test.mjs runtime/mcp/handlers.test.mjs`
  - Commit:
    - `refactor(runtime): complete mcp-dashboard convergence with parity gates`

## VE Task (End-to-End Verification)

- [x] VE1 Execute targeted end-to-end smoke validation for representative actions
  - Target files:
    - none (verification task)
  - Success criteria:
    - At least one representative script-wrapper action works through MCP and dashboard with equivalent semantics.
    - One invalid-input case confirms aligned error handling across both surfaces.
  - Verification:
    - `node --test runtime/mcp/contract-parity.test.mjs runtime/mcp/dashboard-api.test.mjs`
  - Commit:
    - `chore(verification): validate end-to-end convergence smoke cases`
