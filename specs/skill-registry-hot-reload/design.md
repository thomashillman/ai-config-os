# Design: Track B Runtime Convergence

## Architecture Overview

Converge duplicated MCP/dashboard script-backed actions behind a shared runtime action dispatcher while preserving existing task-control-plane service usage and Worker-safe boundaries.

### Current vs Target

- Current:
  - Task-centric operations are mostly shared through `runtime/lib/task-control-plane-service*.mjs`.
  - Non-task actions are duplicated in `runtime/mcp/handlers.mjs` and `runtime/mcp/dashboard-api.mjs`.
- Target:
  - One shared action registry + dispatcher handles non-task action mapping, argument normalization, and base result semantics.
  - MCP and dashboard become thin adapters over that dispatcher.
  - Worker stays isolated from Node-only integrations.

## Proposed Modules and Interfaces

### 1) Action Matrix Source of Truth

Add:

- `runtime/lib/runtime-action-matrix.mjs`

Responsibility:

- Export classification metadata for each action (`shared-service`, `script-wrapper`, `surface-only`).
- Provide lookup helpers used by dispatcher and parity tests.

Interface sketch:

```js
export const RUNTIME_ACTION_MATRIX = {
  list_tools: { classification: 'script-wrapper' },
  sync_tools: { classification: 'script-wrapper' },
  get_config: { classification: 'script-wrapper' },
  skill_stats: { classification: 'script-wrapper' },
  context_cost: { classification: 'script-wrapper' },
  validate_all: { classification: 'script-wrapper' },
  resolve_outcome_contract: { classification: 'shared-service' },
  task_start_review_repository: { classification: 'shared-service' },
  task_resume_review_repository: { classification: 'shared-service' },
  task_get_readiness: { classification: 'shared-service' },
};
```

### 2) Shared Dispatcher for Script-Wrapper Actions

Add:

- `runtime/lib/runtime-action-dispatcher.mjs`

Responsibility:

- Normalize args/defaults for script-wrapper actions.
- Resolve script command + args.
- Execute via injected `runScript`.
- Return normalized base result object.

Interface sketch:

```js
export function createRuntimeActionDispatcher({ runScript, validateNumber }) {
  return {
    dispatch(actionName, actionArgs = {}) {
      // throws ActionValidationError | UnknownActionError
      // returns { success, output, actionName, normalizedArgs }
    },
  };
}
```

Error classes:

- `UnknownActionError`
- `ActionValidationError`

These map to existing surface-specific error contracts.

### 3) MCP Adapter Integration

Change:

- `runtime/mcp/handlers.mjs`

Design:

- Replace per-action script-case branches with dispatcher calls for script-wrapper actions.
- Keep existing task-service and momentum-engine branches unchanged.
- Continue wrapping results with `toToolResponse` and capability profile attachments.

### 4) Dashboard Adapter Integration

Change:

- `runtime/mcp/dashboard-api.mjs`

Design:

- Replace duplicated script route handlers with small endpoint wrappers that call the dispatcher.
- Keep dashboard HTTP-specific status mapping and JSON envelope shape stable.
- Keep task endpoints unchanged.

### 5) Worker Boundary Preservation

No direct worker refactor in this design.

- Worker continues using `task-control-plane-service-worker.mjs`.
- Dispatcher is Node-runtime oriented for MCP/dashboard script-backed actions.
- If Worker later needs similar non-task behavior, define a Worker-specific adapter to shared contracts, not direct Node script execution.

## Data Flow

### Script-wrapper action (MCP)

1. MCP handler receives tool call.
2. Handler resolves effective outcome contract (existing behavior).
3. Handler calls dispatcher `dispatch(name, args)`.
4. Dispatcher validates/normalizes and executes script.
5. Handler maps dispatcher result through existing `toToolResponse`.

### Script-wrapper action (Dashboard)

1. Dashboard endpoint receives HTTP request.
2. Endpoint resolves outcome contract (existing behavior).
3. Endpoint calls dispatcher `dispatch(actionName, requestArgs)`.
4. Dispatcher validates/normalizes and executes script.
5. Endpoint returns existing JSON envelope with normalized result fields.

## Technical Decisions

1. Keep scripts as integration boundary where currently required.
2. Centralize action mapping and argument defaults once.
3. Preserve existing public contracts in MCP and dashboard responses.
4. Keep convergence focused on non-task actions to avoid reopening stable task-service flow.

## Error Handling Strategy

- Dispatcher throws typed errors:
  - unknown action
  - invalid arguments
- MCP mapping:
  - invalid/unknown -> existing `toolError(...)` behavior
- Dashboard mapping:
  - invalid/unknown -> `400` with stable `{ success: false, error }`
  - execution/runtime issues -> preserve current success/output semantics from script invocation contract

No silent fallback paths; all invalid input failures remain explicit.

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

Optional CI wiring update (if needed for mergeability):

- project validation command definitions to ensure parity test suite is part of required checks.

## Migration Plan

1. Introduce matrix and dispatcher with unit tests.
2. Migrate one low-risk script-wrapper action end-to-end (`list_tools`) in both MCP and dashboard.
3. Expand migration to remaining script-wrapper actions.
4. Add full parity coverage table for all migrated actions.
5. Remove obsolete duplicated mapping code.

This phased migration reduces blast radius and keeps rollback simple.

## Test Strategy

### Unit Tests

- `runtime-action-dispatcher.test.mjs`
  - mapping resolution
  - argument normalization defaults
  - validation failures
  - unknown action failures

### Integration/Adapter Tests

- MCP handler tests:
  - dispatcher-backed actions return expected response shapes.
- Dashboard API tests:
  - dispatcher-backed endpoints preserve route registration and response envelope.

### Parity Tests

- Table-driven parity suite for each script-wrapper action across MCP/dashboard:
  - action identity
  - normalized argument behavior
  - success output envelope fields
  - invalid input error semantics

## Open Risks

- Response envelope mismatch if MCP and dashboard wrappers apply inconsistent post-processing after dispatcher integration.
- Hidden script-side behavior differences that dispatcher normalization alone cannot remove.
- Risk of over-centralizing action semantics that are intentionally surface-specific.

Mitigation:

- Matrix includes `surface-only` category to preserve explicit divergence.
- Parity tests only assert equivalence for actions classified as shared.

## Definition of Done Alignment

This design satisfies Track B done criteria by:

- implementing task-adjacent behavior once in shared runtime modules,
- turning MCP/dashboard into adapters for converged behavior,
- and enforcing equivalence via automated parity testing.

