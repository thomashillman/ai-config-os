# Research: Track B Shared-Runtime Drift Removal

## Goal

Validate and operationalize the PLAN priority to remove shared-runtime drift between dashboard, MCP, Worker, and script-backed runtime paths.

## Context Summary

`PLAN.md` marks this as an explicit near-term priority:

- Track B exists to reduce the split between script-backed dashboard/runtime actions and the contract-driven control plane.
- The plan calls out split-brain risk specifically between `runtime/mcp/dashboard-api.mjs` and `runtime/lib/`.
- Milestone ordering places runtime convergence before additional Worker decomposition.

The current repository already moved core task flows to shared services, but non-task runtime actions still use parallel script adapters in MCP and dashboard.

## Existing Code Patterns

### Pattern A: Shared control-plane services (good baseline)

- `runtime/lib/task-control-plane-service.mjs` provides shared task operations for Node-facing surfaces.
- `runtime/lib/task-control-plane-service-worker.mjs` provides a Worker-safe variant with the same core interface minus Node-only journey methods.
- Worker task handlers call runtime services through `worker/src/task-runtime.ts` and `worker/src/handlers/tasks.ts`.
- MCP task tools call the same service family through `runtime/mcp/handlers.mjs`.
- Dashboard task endpoints also call injected `taskService` in `runtime/mcp/dashboard-api.mjs`.

Result: task-start, task-resume, and readiness behavior is mostly centralized.

### Pattern B: Parallel script invocations in MCP and dashboard (drift risk)

Both `runtime/mcp/handlers.mjs` and `runtime/mcp/dashboard-api.mjs` run shell scripts for non-task actions (`manifest`, `sync`, `config`, `skill stats`, `validate-all`, `context cost`) with similar but duplicated wiring.

Result: argument validation, response shaping, and failure behavior can drift across surfaces even when intent is the same.

### Pattern C: Parity tests exist but are narrow

- `runtime/mcp/contract-parity.test.mjs` checks route identity parity for contract resolution.
- `runtime/mcp/dashboard-api.test.mjs` checks route registration and basic failure handling.

Result: parity coverage exists, but broader behavior equivalence for script-backed actions across MCP/dashboard/Worker is not fully asserted.

## Constraints

- Worker runtime cannot import Node-only modules (`fs`, `import.meta.url` dependencies). This is why `task-control-plane-service-worker.mjs` omits journey methods.
- Some shell scripts are still necessary for environment integration and should remain thin wrappers.
- Runtime convergence must preserve existing public endpoints and MCP tool contracts.

## Related Specs and Inputs

- `PLAN.md` (Track B and milestone ordering)
- `README.md` (runtime/control-plane architecture claims)
- `specs/runtime-lib-control-plane-research.md`
- `specs/worker-endpoint-inventory.md`
- `runtime/lib/` shared services
- `runtime/mcp/dashboard-api.mjs`
- `runtime/mcp/handlers.mjs`
- `worker/src/task-runtime.ts`

## Risks

- Behavioral drift: MCP vs dashboard can diverge on validation defaults and error mapping for equivalent actions.
- Testing blind spots: current parity tests may pass while practical response semantics differ.
- Coupling risk: centralizing too aggressively into Node-only modules can break Worker compatibility.

## Recommended Direction

### 1. Classify each runtime action

Create a single mapping table for each action:

- `shared-service`: must execute through `runtime/lib` service modules.
- `script-wrapper`: remains shell-backed, but accessed via one shared adapter layer.
- `surface-only`: intentionally unique to a given surface.

### 2. Introduce a shared action dispatcher for MCP + dashboard

Add a narrow runtime module (adjacent to `runtime/lib`) that:

- owns action-to-command mapping for script-backed actions,
- applies common validation and defaults,
- returns normalized result objects used by both MCP and dashboard.

This removes duplicated per-surface wiring while preserving script execution where needed.

### 3. Keep Worker aligned through contract-level interfaces

Do not force Node-only code into Worker. Instead:

- define shared action contracts in runtime modules,
- keep Worker implementation-specific adapters when needed,
- preserve parity at the contract and fixture levels.

### 4. Expand parity verification

Add tests that assert equivalent behavior for the same action across MCP and dashboard on:

- resolved action identity,
- argument normalization,
- success payload shape,
- failure status and error codes.

## Verification Tooling

- Node tests under `runtime/mcp/*.test.mjs` and `runtime/lib/*.test.mjs`.
- Add table-driven parity fixtures used by both MCP and dashboard tests.
- Add a focused CI command for runtime parity checks as part of mergeability gates.

## Recommendation for Next Phase

Proceed to requirements with a constrained scope:

- define action classification matrix,
- define the shared dispatcher interface and expected payload contracts,
- define minimum parity test matrix required for Track B done criteria.

