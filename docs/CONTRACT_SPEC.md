# Contract Spec — Canonical Response Envelope

Every response from a contract surface (Worker, dashboard API, or MCP tool) must conform to the canonical envelope defined here. This document is the single source of truth for field names and semantics.

## Required fields

| Field               | Type      | Description                                                                                                               |
| ------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------- |
| `contract_version`  | `"1.0.0"` | Fixed constant. Bump only when the envelope shape changes in a breaking way.                                              |
| `resource`          | `string`  | Dot-separated resource name, e.g. `tasks.list`, `runtime.capabilities`. Pattern: `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$`. |
| `data`              | `any`     | The primary payload. `null` on error responses. Never omit.                                                               |
| `summary`           | `string`  | One human-readable sentence describing the result. Must be useful on its own to an LLM or a card render.                  |
| `capability`        | `object`  | Locality and safety flags (see Capability object).                                                                        |
| `suggested_actions` | `array`   | Ordered list of next actions. May be empty.                                                                               |

## Optional fields

| Field   | Type     | Description                                                                                                     |
| ------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `meta`  | `object` | Structured interpretation for agents and card UIs (urgency, blocker counts, best route, etc.). Omit when empty. |
| `error` | `object` | Present only on error responses (see Error object).                                                             |

## Capability object

All five boolean fields are required.

| Field                    | Meaning                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| `worker_backed`          | Response comes from the Cloudflare Worker (durable, remotely accessible). |
| `local_only`             | Response can only be produced in a local runtime environment.             |
| `remote_safe`            | Safe to call over the public internet without a tunnel.                   |
| `tunnel_required`        | Requires a tunnel (e.g. Cloudflare Tunnel) to reach the backing service.  |
| `unavailable_on_surface` | This resource cannot be served on the current surface at all.             |

## Suggested actions array

Each element must have these fields:

| Field             | Type     | Description                                                       |
| ----------------- | -------- | ----------------------------------------------------------------- |
| `id`              | `string` | Stable machine identifier, e.g. `list_tasks`.                     |
| `label`           | `string` | Short human label, e.g. `List tasks`.                             |
| `reason`          | `string` | Why this action is suggested in this context.                     |
| `runnable_target` | `string` | How to invoke: HTTP method + path, MCP tool name, or CLI command. |

## Error object (error responses only)

| Field     | Type     | Description                                                         |
| --------- | -------- | ------------------------------------------------------------------- |
| `code`    | `string` | Snake_case stable error code, e.g. `not_found`, `version_conflict`. |
| `message` | `string` | Human-readable description of what went wrong.                      |
| `hint`    | `string` | Concrete recovery guidance for the caller.                          |

### Canonical error codes

| Code                          | HTTP status | When to use                                            |
| ----------------------------- | ----------- | ------------------------------------------------------ |
| `auth_required`               | 401         | Missing or invalid bearer token.                       |
| `validation_error`            | 400         | Request body failed schema validation.                 |
| `not_found`                   | 404         | The requested resource does not exist.                 |
| `version_conflict`            | 409         | Optimistic-concurrency mismatch on `expected_version`. |
| `handoff_token_forbidden`     | 403         | Token is expired or replay nonce mismatch.             |
| `handoff_token_invalid`       | 401         | Token structure or signature is invalid.               |
| `handoff_signing_key_missing` | 500         | `HANDOFF_TOKEN_SIGNING_KEY` is not configured.         |
| `internal_error`              | 500         | Unexpected server-side failure.                        |

## Rules

1. **No ad-hoc top-level keys.** Do not add `task`, `tasks`, `events`, `message`, or any other bespoke key at the top level of a response. Put all primary data inside `data`.
2. **`data` is never absent.** It must be present and `null` on error responses.
3. **`summary` must be a useful sentence.** It should be something an LLM can quote verbatim in an answer or a UI can show on a card. Avoid internal jargon.
4. **`capability` must be truthful.** Never set `worker_backed: true` for a local-only resource. Never set `remote_safe: true` if the resource requires a tunnel.
5. **`error` is only present on error responses.** Do not include the `error` field in success responses.
6. **Source of truth.** The envelope factory lives in `runtime/lib/contracts/envelope.mjs` (JS) and `worker/src/contracts.ts` (TS). Do not duplicate the factory logic.

## Schemas

Machine-readable JSON Schema files live in `shared/contracts/`:

- `capability.schema.json` — the capability object
- `response-envelope.schema.json` — the success envelope
- `response-envelope-error.schema.json` — the error envelope (extends success)

## Example: success response

```json
{
  "contract_version": "1.0.0",
  "resource": "tasks.list",
  "data": { "tasks": [] },
  "summary": "0 task(s) found.",
  "capability": {
    "worker_backed": true,
    "local_only": false,
    "remote_safe": true,
    "tunnel_required": false,
    "unavailable_on_surface": false
  },
  "suggested_actions": [
    {
      "id": "create_task",
      "label": "Create a task",
      "reason": "No tasks exist yet.",
      "runnable_target": "POST /v1/tasks"
    }
  ]
}
```

## Example: error response

```json
{
  "contract_version": "1.0.0",
  "resource": "tasks.error",
  "data": null,
  "summary": "Task not found.",
  "capability": {
    "worker_backed": true,
    "local_only": false,
    "remote_safe": true,
    "tunnel_required": false,
    "unavailable_on_surface": false
  },
  "suggested_actions": [],
  "error": {
    "code": "not_found",
    "message": "No task with id 'abc123' exists.",
    "hint": "Check the task ID and try again."
  }
}
```
