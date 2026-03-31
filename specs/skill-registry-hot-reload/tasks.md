# Tasks: Track B Runtime Convergence

## Chosen Granularity

`fine`

## Phase 1: Shared Runtime Foundations (POC-first)

- [x] T001 Add runtime action matrix as source-of-truth
  - Target files:
    - `runtime/lib/runtime-action-matrix.mjs`
  - Success criteria:
    - Matrix includes all current MCP/dashboard runtime actions with `shared-service`, `script-wrapper`, or `surface-only` classification.
    - Helper accessors are exported for dispatcher and parity tests.
  - Verification:
    - `node --test runtime/lib/runtime-action-dispatcher.test.mjs`
  - Commit:
    - `feat(runtime): add runtime action matrix for mcp-dashboard convergence`

- [x] T002 Add shared runtime action dispatcher with typed errors
  - Target files:
    - `runtime/lib/runtime-action-dispatcher.mjs`
  - Success criteria:
    - Dispatcher resolves script-wrapper action mapping, argument normalization/defaults, and script execution.
    - Unknown action and invalid-argument paths return typed errors.
  - Verification:
    - `node --test runtime/lib/runtime-action-dispatcher.test.mjs`
  - Commit:
    - `feat(runtime): add shared dispatcher for script-wrapper actions`

- [x] T003 Add unit tests for matrix and dispatcher behavior
  - Target files:
    - `runtime/lib/runtime-action-dispatcher.test.mjs`
  - Success criteria:
    - Tests cover mapping resolution, defaults, unknown action, and validation failure behavior.
  - Verification:
    - `node --test runtime/lib/runtime-action-dispatcher.test.mjs`
  - Commit:
    - `test(runtime): cover runtime action dispatcher contracts`

- [x] [VERIFY] T004 Verify foundation before adapter migration
  - Target files:
    - none (verification task)
  - Success criteria:
    - Dispatcher tests pass.
    - Existing task control-plane tests remain green.
  - Verification:
    - `node --test runtime/lib/runtime-action-dispatcher.test.mjs runtime/lib/task-control-plane-service.test.mjs`
  - Commit:
    - `chore(runtime): verify shared dispatcher foundation`

## Phase 2: MCP and Dashboard Adapter Convergence

- [x] T005 Migrate MCP script-wrapper actions to dispatcher
  - Target files:
    - `runtime/mcp/handlers.mjs`
  - Success criteria:
    - Script-wrapper MCP tools route through dispatcher.
    - Task-service and momentum flows stay unchanged.
  - Verification:
    - `node --test runtime/mcp/handlers.test.mjs`
  - Commit:
    - `refactor(mcp): route script-wrapper actions through dispatcher`

- [x] T006 Migrate dashboard API script-wrapper routes to dispatcher
  - Target files:
    - `runtime/mcp/dashboard-api.mjs`
  - Success criteria:
    - Dashboard script-backed routes use shared dispatcher.
    - Existing route paths and response envelopes remain stable.
  - Verification:
    - `node --test runtime/mcp/dashboard-api.test.mjs`
  - Commit:
    - `refactor(dashboard): route script-backed actions through dispatcher`

- [x] [P] T007 Extend dashboard adapter tests for dispatcher-backed flows
  - Target files:
    - `runtime/mcp/dashboard-api.test.mjs`
  - Success criteria:
    - Tests assert normalized args/defaults and invalid-input semantics for migrated routes.
  - Verification:
    - `node --test runtime/mcp/dashboard-api.test.mjs`
  - Commit:
    - `test(dashboard): add dispatcher-backed route coverage`

- [x] [P] T008 Extend MCP/dashboard parity tests across matrix actions
  - Target files:
    - `runtime/mcp/contract-parity.test.mjs`
  - Success criteria:
    - Table-driven parity assertions cover all `script-wrapper` and relevant `shared-service` matrix actions.
    - Intentional `surface-only` actions are explicitly excluded.
  - Verification:
    - `node --test runtime/mcp/contract-parity.test.mjs`
  - Commit:
    - `test(mcp): enforce action-level parity matrix checks`

- [x] [VERIFY] T009 Run convergence verification suite
  - Target files:
    - `runtime/lib/runtime-action-matrix.mjs`
    - `runtime/lib/runtime-action-dispatcher.mjs`
    - `runtime/lib/runtime-action-dispatcher.test.mjs`
    - `runtime/mcp/handlers.mjs`
    - `runtime/mcp/dashboard-api.mjs`
    - `runtime/mcp/dashboard-api.test.mjs`
    - `runtime/mcp/contract-parity.test.mjs`
  - Success criteria:
    - Dispatcher and parity suites pass together.
    - No regressions in task service paths.
  - Verification:
    - `node --test runtime/lib/runtime-action-dispatcher.test.mjs runtime/lib/task-control-plane-service.test.mjs runtime/mcp/handlers.test.mjs runtime/mcp/dashboard-api.test.mjs runtime/mcp/contract-parity.test.mjs`
  - Commit:
    - `refactor(runtime): complete mcp-dashboard action convergence`

## Phase 3: Root CI and Mergeability Gate Wiring

- [x] T010 Add dashboard checks to root verifier
  - Target files:
    - `scripts/build/verify.mjs`
  - Success criteria:
    - Root `verify` runs dashboard tests and dashboard production build.
    - Dashboard command invocation is cross-platform reliable.
  - Verification:
    - `npm --prefix dashboard run --silent test`
    - `npm --prefix dashboard run --silent build`
    - `npm run -s verify`
  - Commit:
    - `feat(ci): include dashboard checks in root verifier`

- [x] T011 Ensure PR mergeability workflow provisions dashboard deps
  - Target files:
    - `.github/workflows/pr-mergeability-gate.yml`
  - Success criteria:
    - Workflow installs dashboard dependencies before running root `verify`.
    - Mergeability fails when dashboard gate fails.
  - Verification:
    - `npm --prefix dashboard install`
    - `npm run -s verify`
  - Commit:
    - `ci: install dashboard dependencies in mergeability gate`

- [x] [VERIFY] T012 Validate end-to-end branch gate behavior
  - Target files:
    - none (verification task)
  - Success criteria:
    - Root verification executes dashboard checks as part of normal flow.
    - Known baseline failures (if any) are reported separately from dashboard gate wiring.
  - Verification:
    - `npm run -s verify`
  - Commit:
    - `chore(verification): validate dashboard mergeability gate integration`

## VE Tasks (End-to-End Validation)

- [x] VE1 Validate representative MCP/dashboard action parity smoke path
  - Target files:
    - none (verification task)
  - Success criteria:
    - At least one representative shared action behaves consistently across MCP and dashboard.
    - One invalid-input scenario confirms aligned error semantics.
  - Verification:
    - `node --test runtime/mcp/contract-parity.test.mjs runtime/mcp/dashboard-api.test.mjs`
  - Commit:
    - `chore(verification): confirm parity smoke scenarios`

- [x] VE2 Validate dashboard is enforced by root pre-merge gate
  - Target files:
    - none (verification task)
  - Success criteria:
    - Branch readiness path includes dashboard test/build through root `verify` and mergeability workflow.
  - Verification:
    - `npm run -s verify`
  - Commit:
    - `chore(verification): confirm dashboard root gate enforcement`
