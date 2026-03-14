# Runtime Lib Control Plane Research

## Scope

- Focus: `runtime/lib/` task-control-plane modules and their adjacent definition files
- Related inputs:
  - `runtime/task-route-definitions.yaml`
  - `runtime/task-route-input-definitions.yaml`
  - `runtime/outcome-definitions.yaml`

## Executive Summary

`runtime/lib/` has evolved into a contract-driven task-control-plane. It is not just helper code for shell wrappers. It defines:

- how routes are selected based on capability profiles
- how portable task state is created and transitioned
- how findings provenance is recorded and downgraded across route upgrades
- how progress events and snapshots are persisted
- how handoff tokens support continuation across boundaries

This logic is reused by both the local runtime and the Cloudflare worker, which makes `runtime/lib/` the most important shared execution surface in the repository.

## Core Modules

### `task-route-resolver.mjs`

Role:

- Selects the best route for a task type using route definitions plus a capability profile.

Inputs:

- task type
- task route definitions from `runtime/task-route-definitions.yaml`
- capability profile from `capability-profile.mjs`

Behavior:

- assigns a weighted score based on:
  - capability coverage: `70%`
  - equivalence level: `30%`
- returns:
  - `selected_route`
  - sorted `candidates`

Notable detail:

- route selection is validated through the shared `taskRouteDefinition` contract before being returned.

### `portable-task-lifecycle.mjs`

Role:

- Defines valid task-state transitions and the canonical task object lifecycle.

Behavior:

- creates a new portable task with:
  - route history
  - next action
  - progress counters
  - empty findings, approvals, and questions
- supports:
  - route selection append
  - state transition
- enforces:
  - version matching
  - legal state transitions
  - monotonic progress

State machine:

- `pending -> active | failed`
- `active -> blocked | completed | failed`
- `blocked -> active | failed`
- terminal: `completed`, `failed`

### `task-store.mjs`

Role:

- In-memory control-plane store for tasks, snapshots, progress events, and continuation packages.

Main responsibilities:

- create and load tasks
- update or transition task state
- append findings
- transition findings on route upgrades
- append route selections
- store snapshots per version
- store progress events per task
- create continuation packages when a handoff token is provided

Important behavior:

- all mutating operations require optimistic concurrency via `expectedVersion`
- every mutation creates a new validated snapshot
- major transitions append progress events with typed metadata

This file is the orchestration hub. Most other modules provide the rules that `task-store.mjs` applies.

### `findings-ledger.mjs`

Role:

- Creates findings entries with provenance and handles route-upgrade carry-forward behavior.

Key idea:

- a finding is not just content; it carries provenance:
  - status
  - recorded time
  - recording route
  - optional note

Route-upgrade rule:

- when upgrading to an `equal` route, findings previously marked `verified` on a different route are downgraded to `reused`
- this preserves evidence while preventing stronger-route claims from inheriting weaker-route verification without annotation

This is one of the strongest signs that the repo is trying to model auditability, not just task completion.

### `progress-event-pipeline.mjs`

Role:

- Appends immutable, typed progress events per task.

Behavior:

- validates event structure with `progressEvent` contract
- rejects duplicate event IDs per task
- supports readback by task ID

Used for:

- state changes
- finding recording
- finding provenance transitions

### `handoff-token-service.mjs`

Role:

- Issues, verifies, and consumes signed handoff tokens.

Security properties:

- canonical payload for signing
- HMAC-SHA256 signature
- expiration window validation
- task ID binding
- replay protection via token ID and nonce consumption
- timing-safe signature comparison

This module is the continuation boundary between execution segments. It allows a task to move across contexts without losing integrity.

### `review-repository-route-runtime.mjs`

Role:

- Task-specific adapter for the `review_repository` task type.

Responsibilities:

- loads canonical route definitions for `review_repository`
- loads required-input definitions per route
- validates that a proposed route has the required inputs

This is a narrow module, but it shows the intended pattern for task-specific route runtimes.

## Supporting Definitions

### `runtime/task-route-definitions.yaml`

Defines route candidates for `review_repository`:

- `local_repo`
  - equivalence: `equal`
  - capabilities: `local_fs`, `local_shell`, `local_repo`
- `github_pr`
  - equivalence: `degraded`
  - capability: `network_http`
- `uploaded_bundle`
  - equivalence: `degraded`
  - capability: `local_fs`
- `pasted_diff`
  - equivalence: `degraded`
  - no required capabilities

Interpretation:

- the control plane is modeling quality degradation explicitly rather than treating all routes as interchangeable.

### `runtime/task-route-input-definitions.yaml`

Maps each route to required inputs:

- `local_repo` -> `repository_path`
- `github_pr` -> `repository_slug`, `pull_request_number`
- `uploaded_bundle` -> `bundle_path`
- `pasted_diff` -> `diff_text`

Interpretation:

- route selection and route execution are decoupled from route-input validation.

### `runtime/outcome-definitions.yaml`

Maps runtime tool names to outcome IDs and possible execution routes.

Example pattern:

- primary script route
- weaker or partial script route
- remote executor route

Interpretation:

- the repo now distinguishes "what outcome is desired" from "which route will satisfy it in this environment."

## End-To-End Control-Plane Flow

1. A task type is identified.
2. `task-route-resolver.mjs` scores route candidates against the capability profile.
3. `portable-task-lifecycle.mjs` creates a canonical task object.
4. `task-store.mjs` persists the task in memory and creates the first snapshot.
5. As work progresses:
   - route changes are appended
   - state transitions are validated
   - progress events are recorded
   - findings are appended with provenance
6. If execution upgrades to a stronger route:
   - findings provenance may be transitioned from `verified` to `reused`
7. If control needs to move to another environment:
   - `handoff-token-service.mjs` validates token continuity
   - `task-store.mjs` can create a continuation package

## Architectural Strengths

- explicit contracts at nearly every boundary
- optimistic concurrency instead of hidden mutation
- durable reasoning about degraded versus equal routes
- provenance-aware findings instead of flat issue lists
- task-specific runtimes can be added without rewriting the core control plane

## Risks And Constraints

### In-memory persistence

`task-store.mjs` is currently in-memory. That is acceptable for local flow control and tests, but it means task continuity is process-bound unless externalized.

### Shared-library blast radius

Because worker and local runtime both import these modules, any contract or lifecycle change here has cross-surface impact.

### Capability vocabulary drift

Route scoring depends on capability IDs aligning across:

- platform definitions
- route definitions
- runtime capability profiles

If those vocabularies drift, route selection degrades silently toward weaker matches.

## Best Next Code Reads

- `runtime/lib/capability-profile.mjs`
- `runtime/lib/outcome-resolver.mjs`
- `runtime/mcp/handlers.mjs`
- `worker/src/index.ts`
