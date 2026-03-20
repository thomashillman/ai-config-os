# Requirements: Track B Runtime Convergence

## Scope Statement

Define and implement the requirements needed to remove shared-runtime drift between MCP, dashboard API, and Worker/runtime control-plane surfaces, with primary focus on converging duplicated non-task action behavior while preserving existing task-service boundaries.

## User Stories

1. As a runtime maintainer, I want equivalent runtime actions to execute through one shared logic path so behavior does not drift by surface.
2. As an operator using MCP and dashboard, I want equivalent actions to return consistent semantics so tool behavior is predictable.
3. As a Worker/runtime maintainer, I want Node-only dependencies kept out of Worker-compatible paths so deployment constraints remain satisfied.
4. As a release engineer, I want parity checks in CI so regressions in cross-surface behavior are detected before merge.

## Functional Requirements

### FR-1 Action Classification Matrix

- The system shall define a single action classification matrix for runtime actions with categories:
  - `shared-service`
  - `script-wrapper`
  - `surface-only`
- The matrix shall list each currently supported MCP/dashboard action and its category.
- The matrix shall be versioned in-repo and used as the source of truth for implementation and tests.

### FR-2 Shared Dispatcher for MCP + Dashboard

- The system shall provide a shared dispatcher module used by both `runtime/mcp/handlers.mjs` and `runtime/mcp/dashboard-api.mjs` for script-backed actions.
- The dispatcher shall own:
  - action-to-command mapping
  - argument normalization and defaults
  - normalized success/failure payload shape
- MCP and dashboard surfaces shall call this dispatcher instead of maintaining duplicate per-action script wiring.

### FR-3 Task Service Boundary Preservation

- The system shall keep task-control-plane operations on existing shared service modules under `runtime/lib/`.
- The system shall preserve Worker-safe separation where Node-only journey behavior cannot execute in Worker runtime.
- Any convergence change shall not require Worker to import Node-only modules.

### FR-4 Contract and Response Parity

- The system shall define parity expectations for equivalent MCP and dashboard actions:
  - resolved action identity
  - normalized arguments/defaults
  - success payload fields
  - failure status and error codes/messages
- The system shall preserve current public endpoint names and MCP tool names unless explicitly approved for change.

### FR-5 Verification Integration

- The system shall add or extend tests to assert parity for all actions in the classification matrix that are `shared-service` or `script-wrapper`.
- The system shall include these parity tests in a repeatable CI validation command used for mergeability checks.

## Acceptance Criteria

1. A committed action classification matrix exists and covers all current runtime actions shared between MCP and dashboard.
2. `runtime/mcp/handlers.mjs` and `runtime/mcp/dashboard-api.mjs` use shared dispatcher logic for all matrix actions marked `script-wrapper`.
3. Existing task-service behavior remains centralized in `runtime/lib` and Worker compatibility remains intact.
4. Automated parity tests fail when MCP/dashboard equivalent actions diverge in action identity, argument normalization, or response/error semantics.
5. CI includes parity verification and passes on the updated branch.

## Non-Functional Requirements

- Maintainability: remove duplicated action wiring to reduce change surface area.
- Reliability: parity regressions must be detectable via deterministic tests.
- Compatibility: no breaking changes to external API/tool contracts in this phase.
- Performance: added dispatch abstraction must not introduce material latency relative to current shell invocation overhead.
- Security: existing tunnel policy and command safety constraints remain enforced.

## Dependencies

- Existing runtime service modules in `runtime/lib/`.
- Existing MCP and dashboard test suites in `runtime/mcp/*.test.mjs`.
- Existing script entrypoints used by runtime actions (`runtime/manifest.sh`, `runtime/sync.sh`, `shared/lib/config-merger.sh`, `ops/*.sh`).
- PLAN milestone ordering for Track A then Track B then Track C.

## Exclusions

- No redesign of Worker public HTTP endpoints.
- No expansion of platform-emitter coverage in this requirement set.
- No migration of all shell-backed integration to pure JS in this phase.
- No behavioral changes to task lifecycle, findings provenance, or handoff token semantics.

## Success Criteria

- Drift-prone duplicated action logic between MCP and dashboard is replaced by shared dispatcher behavior.
- Task-facing control-plane convergence remains intact and Worker constraints remain respected.
- Cross-surface parity is objectively enforced by tests and CI, not by manual spot checks.
- The repository can continue Track B work without reopening split-brain ambiguity between runtime surfaces.

