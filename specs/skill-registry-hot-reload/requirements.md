# Requirements: Track B Runtime Convergence

## Scope Statement

Converge duplicated runtime behavior across MCP and dashboard for non-task actions, preserve Worker-safe control-plane boundaries, and make parity verifiable through root CI and mergeability gates.

## User Stories

1. As a runtime maintainer, I want shared runtime actions to execute through one implementation path so behavior does not drift by surface.
2. As an operator using MCP and dashboard, I want equivalent actions to return consistent behavior and error semantics.
3. As a Worker/runtime maintainer, I want Worker-safe separation retained so Node-only runtime concerns do not leak into Worker code.
4. As a release engineer, I want root verification and mergeability checks to exercise dashboard behavior directly.

## Functional Requirements

### FR-1 Action Classification Matrix

- The system shall define one in-repo runtime action matrix with explicit classifications:
  - `shared-service`
  - `script-wrapper`
  - `surface-only`
- The matrix shall cover all current actions exposed by MCP and dashboard adapters.
- The matrix shall be the source of truth for parity tests.

### FR-2 Shared Dispatcher for Script-Wrapper Actions

- MCP and dashboard script-backed actions shall resolve through one shared dispatcher module.
- The dispatcher shall own:
  - action-to-command mapping
  - argument normalization/defaulting
  - base success/failure shaping
- MCP and dashboard adapters shall remain thin wrappers for surface-specific transport concerns.

### FR-3 Task Service Boundary Preservation

- Task lifecycle actions shall remain routed through shared control-plane services under `runtime/lib`.
- Worker-safe boundaries shall remain intact; Worker code shall not import Node-only journey/script dependencies.
- Existing task endpoints and tool names shall remain backward compatible in this phase.

### FR-4 Cross-Surface Parity Contract

- For all matrix actions classified as `shared-service` or `script-wrapper`, parity checks shall assert:
  - same logical action identity
  - equivalent normalized/defaulted arguments
  - equivalent success payload shape for shared fields
  - equivalent invalid-input and unknown-action semantics
- Intentional `surface-only` differences shall be explicitly documented and excluded from parity assertions.

### FR-5 Root CI/Mergeability Enforcement

- Root verification (`npm run verify`) shall execute dashboard checks directly.
- PR mergeability workflow shall provision dashboard dependencies and run verification that includes dashboard gates.
- A dashboard regression shall fail mergeability without relying on manual dashboard-only runs.

## Acceptance Criteria

1. Action matrix exists and is used by dispatcher/parity tests as authoritative action metadata.
2. MCP and dashboard script-wrapper actions use shared dispatcher execution path.
3. Worker-safe task service boundaries remain unchanged and compatible.
4. Automated parity tests fail when equivalent MCP/dashboard actions drift.
5. Root `verify` and mergeability gates directly exercise dashboard checks.

## Non-Functional Requirements

- Maintainability: reduce duplicated action wiring across MCP/dashboard adapters.
- Reliability: deterministic parity/verification tests detect drift before merge.
- Compatibility: preserve existing public API/tool contracts for this slice.
- Security: keep existing command-safety and tunnel policy enforcement.
- Performance: dispatcher abstraction must not materially worsen runtime command execution latency.

## Dependencies

- `runtime/lib/task-control-plane-service*.mjs`
- `runtime/lib/runtime-action-matrix.mjs`
- `runtime/lib/runtime-action-dispatcher.mjs`
- `runtime/mcp/handlers.mjs`
- `runtime/mcp/dashboard-api.mjs`
- `runtime/mcp/*.test.mjs`
- Root verification and PR mergeability workflows

## Exclusions

- No redesign of Worker HTTP API surface.
- No full migration of shell integrations to pure JS in this phase.
- No changes to findings provenance semantics or continuation token model.
- No unrelated platform-emitter expansion.

## Success Criteria

- Runtime drift risk between MCP and dashboard is reduced by shared dispatch logic and parity tests.
- Worker constraints remain respected while convergence advances.
- Dashboard health is a first-class root CI/mergeability signal.
