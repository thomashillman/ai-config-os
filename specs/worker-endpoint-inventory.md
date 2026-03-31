# Worker Endpoint Inventory

## Scope

- File: `worker/src/index.ts`
- Adjacent integration surface:
  - `runtime/remote-executor/server.mjs`
  - `runtime/lib/task-store.mjs`

## Executive Summary

The Cloudflare worker has three major responsibilities:

1. Serve versioned artifact and manifest data.
2. Proxy approved tool execution to the remote executor.
3. Expose task-control-plane endpoints for task state, route selection, progress, snapshots, and continuation packages.

Every endpoint is protected by bearer-token auth. The worker therefore acts as both a distribution gateway and a stateful orchestration edge.

## Cross-Cutting Behavior

### Authentication

- All routes require `Authorization: Bearer <token>`.
- Valid tokens:
  - `AUTH_TOKEN`
  - optional `AUTH_TOKEN_NEXT` for staged rotation

Failure response:

- `401 Unauthorized`
- `WWW-Authenticate: Bearer realm="ai-config-os"`

### CORS

- `OPTIONS` is supported globally.
- Allowed methods: `GET, POST, PATCH, OPTIONS`
- Allowed headers include `Authorization`, `Content-Type`, `X-Request-Signature`

### Storage modes

Artifact reads have two modes:

- bundled fallback:
  - uses built-in imports from `dist/`
- remote storage:
  - `MANIFEST_KV` for latest version pointer
  - `ARTEFACTS_R2` for JSON artifact payloads

### Shared control-plane dependency

Task-oriented endpoints use `runtime/lib/task-store.mjs`, optionally with `createHandoffTokenService(...)` when `HANDOFF_TOKEN_SIGNING_KEY` is configured.

## Endpoint Inventory

### Health and artifact discovery

#### `GET /v1/health`

Returns:

- worker health status
- registry version
- build timestamp if present
- environment label

Source:

- bundled `dist/registry/index.json`

#### `GET /v1/manifest/latest`

Mode 1:

- if no KV or R2 is configured, returns bundled registry JSON directly

Mode 2:

- reads latest version from `MANIFEST_KV`
- loads `manifests/<version>/manifest.json` from `ARTEFACTS_R2`

Response includes:

- version
- artifact key
- manifest payload

#### `GET /v1/outcomes/latest`

#### `GET /v1/routes/latest`

#### `GET /v1/tools/latest`

Behavior:

- resolves latest version, then loads versioned JSON from R2

Artifacts:

- `outcomes.json`
- `routes.json`
- `tools.json`

#### `GET /v1/outcomes/:version`

#### `GET /v1/routes/:version`

#### `GET /v1/tools/:version`

Behavior:

- direct versioned artifact read from R2

#### `GET /v1/effective-contract/preview`

Loads:

- versioned outcomes
- versioned routes
- versioned tools

Returns:

- resolved version
- source keys
- combined `effective_contract` payload

This is a read-only aggregation route rather than a runtime contract solver.

### Client and skill distribution

#### `GET /v1/client/:client/latest`

Currently supported:

- `claude-code` only

Returns:

- version
- build timestamp
- embedded `plugin_json`
- skill list from registry
- note directing callers to fetch skill content separately

Unknown clients return `404`.

#### `GET /v1/skill/:skillId`

Returns:

- version
- skill metadata entry from registry

Note:

- despite the route name, this does not appear to return raw `SKILL.md` contents. It returns the registry’s structured skill entry.

### Remote execution proxy

#### `POST /v1/execute`

Purpose:

- proxy an allowed tool execution request to `runtime/remote-executor`

Required environment:

- `EXECUTOR_PROXY_URL`
- `EXECUTOR_SHARED_SECRET`

Request payload:

```json
{
  "request_id": "optional-string",
  "tool": "sync_tools",
  "args": ["--dry-run"],
  "timeout_ms": 5000,
  "metadata": {}
}
```

Validation:

- `tool` must be a non-empty string
- `args` must be string array when present
- `timeout_ms` must be a positive integer when present
- `metadata` must be an object when present

Forwarded headers:

- `X-Executor-Shared-Secret`
- `X-Request-Signature`

Proxy behavior:

- timeout uses `EXECUTOR_TIMEOUT_MS`, clamped to max `120000`
- upstream target is `${EXECUTOR_PROXY_URL}/v1/execute`

Success response:

- normalized worker response wrapping upstream result

Failure behavior:

- upstream error body is normalized
- timeout/fetch failure returns `504` with `UPSTREAM_TIMEOUT`

### Task-control-plane endpoints

#### `POST /v1/tasks`

Creates a task using the provided JSON object. The worker performs only object-shape validation here and delegates the actual contract validation to `TaskStore.create(...)`.

Response:

- `201` with `{ task }` on success

#### `GET /v1/tasks/:taskId`

Returns:

- current validated task object

Failure modes:

- `404` for missing task

#### `PATCH /v1/tasks/:taskId/state`

Purpose:

- transition task state

Payload:

- `expected_version`
- `next_state`
- `next_action`
- `updated_at`
- optional `progress`

Backed by:

- `TaskStore.transitionState(...)`

#### `POST /v1/tasks/:taskId/route-selection`

Purpose:

- append a route selection to task history and update current route

Payload:

- `expected_version`
- `route_id`
- `selected_at`

Backed by:

- `TaskStore.selectRoute(...)`

#### `GET /v1/tasks/:taskId/progress-events`

Returns:

- immutable per-task progress events from the in-memory store

#### `GET /v1/tasks/:taskId/snapshots`

Returns:

- all snapshots for the task

#### `GET /v1/tasks/:taskId/snapshots/:version`

Returns:

- one versioned snapshot

Validation:

- snapshot version must be a positive integer

#### `POST /v1/tasks/:taskId/continuation`

Purpose:

- create or replay a continuation package for a task

Payload:

- `handoff_token`
- `effective_execution_contract`
- optional `created_at`

Additional rules:

- requires `HANDOFF_TOKEN_SIGNING_KEY`
- tracks a replay fingerprint keyed by token ID
- returns `403` if the same token ID is reused with a different fingerprint
- returns `200` when a matching replay is detected
- returns `201` for the first accepted creation

This route is the strongest continuity boundary in the worker.

## Remote Executor Relationship

The worker only proxies to the remote executor for `/v1/execute`. The remote executor itself:

- validates shared-secret auth
- optionally verifies request signatures
- maps allowed tool names to local shell scripts
- executes those scripts with bounded timeout

Supported remote tools are narrower than the full runtime surface:

- `sync_tools`
- `list_tools`
- `get_config`
- `skill_stats`
- `context_cost`
- `validate_all`

## Risks And Design Tensions

### Mixed concerns in one file

`worker/src/index.ts` combines:

- auth
- artifact serving
- execution proxying
- task orchestration
- continuation replay protection

That is manageable now, but it increases the coupling between unrelated concerns.

### In-memory task state at the edge

Task state appears process-local unless a more durable store is added later. That may be sufficient for early flows, but it is a limitation if the worker is expected to survive restarts or scale horizontally.

### Route naming mismatch risk

The worker’s public routes, runtime outcome definitions, and remote-executor tool IDs all use different naming layers. The system works because adapters normalize between them, but that layering is a likely future bug source.

## Best Next Code Reads

- `runtime/lib/task-store.mjs`
- `runtime/lib/handoff-token-service.mjs`
- `runtime/remote-executor/server.mjs`
- `shared/contracts/schemas/v1/*.json`
