# Repository Research

## Scope

- Repository: `C:/Projects/ai-config-os`
- Basis: full file index in `specs/.index/`
- Research date: `2026-03-14`

## Executive Summary

`ai-config-os` is organized around a clear source-to-runtime pipeline:

1. Canonical skill and platform definitions live in `shared/`.
2. The compiler in `scripts/build/` validates those definitions and emits distributable artifacts to `dist/`.
3. The local runtime in `runtime/` exposes management operations over MCP and an Express dashboard API.
4. The Cloudflare Worker in `worker/` publishes compiled artifacts and brokers remote execution flows.
5. The React dashboard in `dashboard/` is a thin operator UI over the runtime API.

The recent evolution of the repository adds a stronger task-control-plane layer inside `runtime/lib/`, with explicit outcome resolution, route selection, portable task state, handoff tokens, findings provenance, and progress-event tracking.

## High-Confidence Architecture Map

### 1. Canonical authoring surface

- `shared/skills/` is the source of truth for authored skills.
- `shared/targets/` holds platform capability definitions.
- `shared/contracts/` and `shared/contracts/schemas/v1/` define reusable runtime and worker contracts.
- `shared/routes/` and `shared/outcomes/` define execution route and outcome abstractions consumed by the runtime.

This is reinforced directly by `scripts/build/compile.mjs`, which states that the compiler reads only from `shared/skills/` and treats emitted packages as source-independent.

### 2. Build and validation pipeline

- `scripts/build/compile.mjs` is the primary compiler entry point.
- It validates skills, platforms, routes, and outcomes before emission.
- It emits platform packages, a registry, and runtime artifacts.
- `scripts/build/test/` contains contract-style tests that guard repository invariants, reproducibility, route compatibility, and artifact presence.

The build layer is defensive and schema-driven. This repo prefers deterministic generation over permissive best-effort emission.

### 3. Local runtime control plane

- `runtime/mcp/server.js` boots the stdio MCP server and separately starts the dashboard API.
- `runtime/mcp/handlers.mjs` and related MCP modules expose runtime operations.
- `runtime/lib/outcome-resolver.mjs` computes an `EffectiveOutcomeContract` for a tool before execution.
- `runtime/lib/task-store.mjs` manages portable task state, snapshots, route history, findings, and progress events.

This runtime is no longer just a shell-script wrapper. It is becoming a stateful orchestration layer with explicit contracts between UI, tools, and execution routes.

### 4. Remote execution and distribution

- `worker/src/index.ts` serves manifest, routes, outcomes, tools, and client artifacts.
- The worker also exposes `/v1/execute` and task-oriented state endpoints.
- It imports runtime task-store and handoff-token logic from `runtime/lib/`, which means worker and local runtime share the same control-plane primitives.
- `runtime/remote-executor/server.mjs` appears to be the server-side counterpart for proxied execution from the worker.

This shared-library approach is a notable design choice: execution semantics are centralized in `runtime/lib/`, while delivery surfaces vary by environment.

### 5. Dashboard UI

- `dashboard/src/App.jsx` is intentionally thin and tab-driven.
- `runtime/mcp/dashboard-api.mjs` is the real dashboard backend and currently shells out to repo scripts for most actions.
- The dashboard is an operator console, not a business-logic host. Most logic stays in shell scripts and runtime modules.

## End-To-End Flow

### Authoring and build

1. Skills and targets are authored in `shared/`.
2. `scripts/build/compile.mjs` scans source definitions.
3. JSON Schema and policy checks validate skills, platforms, routes, and outcomes.
4. Dist artifacts are emitted for clients and registry consumers.

### Local operator flow

1. `runtime/mcp/server.js` starts the MCP server and dashboard API.
2. Dashboard requests hit `runtime/mcp/dashboard-api.mjs`.
3. The API resolves an effective outcome contract for the requested tool.
4. Most endpoints still execute shell scripts such as `runtime/manifest.sh` or `ops/validate-all.sh`.
5. Results are returned with outcome-contract metadata.

### Remote execution flow

1. Clients authenticate to the Cloudflare Worker.
2. The worker serves versioned artifacts or execution endpoints.
3. Shared task-control primitives manage route selection, progress, continuation state, and provenance.
4. Execution may be delegated to the remote executor depending on route and environment.

## Important Design Patterns

### Contracts-first implementation

The repo repeatedly validates structured payloads against shared schemas. This appears in:

- build-time schema validation
- runtime contract validation
- task snapshot generation
- handoff-token and findings-ledger logic

This reduces ambiguity when flows cross boundaries between build, runtime, worker, and UI.

### Deterministic artifacts

Determinism is a recurring concern:

- sorted skill scanning in the compiler
- explicit artifact tests in `scripts/build/test/`
- generated index artifact ordering in `specs/.index/`

That matters because this repo is acting as a distribution system, not just an application.

### Shared orchestration core

`runtime/lib/` is the architectural center of gravity. The MCP server, worker, and tests all depend on it. That makes it the highest-leverage area for understanding behavior and the highest-risk area for regressions.

## Highest-Value Components For Further Research

### `runtime/lib/`

Why it matters:

- centralizes outcome resolution
- owns portable task lifecycle
- defines findings provenance and handoff behavior
- is shared by both local and remote execution surfaces

Research next:

- trace `task-route-resolver.mjs`
- trace `portable-task-lifecycle.mjs`
- trace `handoff-token-service.mjs`
- trace `review-repository-route-runtime.mjs`

### `worker/src/index.ts`

Why it matters:

- largest remote surface
- couples auth, artifact delivery, task APIs, and executor proxy behavior
- likely the most externally sensitive component

Research next:

- enumerate every endpoint and its contract
- map which endpoints are bundle-backed versus runtime-backed
- inspect remote executor call paths and timeout behavior

### `scripts/build/`

Why it matters:

- enforces the portability contract
- defines what can be published
- failure here blocks the rest of the system

Research next:

- trace emitters and compatibility resolution
- inspect manifest generation and release-version handling
- inspect source-vs-emitted contract tests

## Likely Change Hotspots

- `runtime/lib/`: most architectural churn and the densest new surface area
- `worker/src/index.ts`: broad responsibility and many endpoints in one file
- `scripts/build/test/`: strong safety net, but likely to require updates whenever contracts evolve
- `PLAN.md` and `docs/autospec/review-repository/`: active planning and autospec coordination surfaces

## Risks And Tensions

### Runtime split-brain risk

The dashboard backend still shells out to scripts for many actions, while newer task and outcome logic lives in `runtime/lib/`. If those paths evolve separately, behavior could drift between script-driven flows and contract-driven flows.

### Worker surface concentration

`worker/src/index.ts` appears to aggregate a lot of behavior in one place. That is practical for now, but it increases the chance that auth, task semantics, and artifact serving become tightly coupled.

### Cross-boundary contract churn

Because the same concepts appear in build output, local runtime, and remote execution, schema changes have a wide blast radius. The strong test suite helps, but the cost of interface changes is still high.

## Suggested Next Research Passes

1. Produce a task-control-plane deep dive centered on `runtime/lib/`.
2. Produce an endpoint inventory for `worker/src/index.ts`.
3. Produce a build pipeline map from `shared/` inputs to emitted `dist/` outputs.
