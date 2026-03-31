# Portable Contracts Reference

This document defines versioning, schemas, locality rules, rendering shapes, and migration guidance for portable resources exposed by AI Config OS surfaces.

## Scope and goals

- Make contracts explicit across **Worker**, **MCP local runtime**, and **dashboard** surfaces.
- Keep payloads forward-compatible for LLM and UI consumers.
- Provide strict minimum fields so partial implementations can still interoperate.

## 1) Contract versioning policy

### 1.1 Version key

All portable resources MUST include `contract_version` using semantic versioning (`MAJOR.MINOR.PATCH`).

- `MAJOR`: breaking schema change (field removal, type change, meaning change).
- `MINOR`: backward-compatible field additions and optional behavior expansion.
- `PATCH`: clarification-only updates, examples, or bug-fix semantics with no shape change.

### 1.2 Compatibility rules

- Producers MUST preserve all fields marked **Required** for the active major version.
- Consumers MUST ignore unknown fields.
- Producers MAY add optional fields in minor releases.
- Any breaking change MUST ship under a new major versioned path or explicit version selector.

### 1.3 Path/version policy

- Worker HTTP APIs are versioned at path-level (`/v1/...`).
- Local MCP responses use body-level `contract_version` and `resource_family`.
- Dashboard API can proxy/reshape data but MUST preserve upstream `contract_version` when present.

## 2) Resource families and canonical schema

> Notation: `?` means optional.

### 2.1 `manifest` family

Canonical purpose: stable index of released skills/artifacts.

| Field              | Type             | Req | Notes                       |
| ------------------ | ---------------- | --: | --------------------------- |
| `resource_family`  | string           | Yes | Must be `manifest`.         |
| `contract_version` | string           | Yes | Semver contract version.    |
| `manifest_version` | string           | Yes | Published release version.  |
| `generated_at`     | string (ISO8601) | Yes | Build/emission timestamp.   |
| `skills`           | array<object>    | Yes | Skill descriptors.          |
| `meta?`            | object           |  No | Build metadata / trace IDs. |

`skills[]` minimum:

- Required: `id`, `version`, `description`, `capabilities.required`.
- Optional: `tags`, `status`, `compatibility`, `capabilities.optional`, `capabilities.fallback_mode`.

### 2.2 `capability_profile` family

Canonical purpose: runtime surface capability truth for a specific platform.

| Field                       | Type          | Req | Notes                                      |
| --------------------------- | ------------- | --: | ------------------------------------------ |
| `resource_family`           | string        | Yes | `capability_profile`.                      |
| `contract_version`          | string        | Yes | Semver contract version.                   |
| `platform`                  | string        | Yes | e.g. `claude-code`, `claude-web`.          |
| `surface`                   | string        | Yes | e.g. `cli`, `web-app`, `mobile-app`.       |
| `manifest_version`          | string        | Yes | Registry version used for resolution.      |
| `capabilities.supported`    | array<string> | Yes | Positive support set.                      |
| `capabilities.unsupported?` | array<string> |  No | Explicitly unavailable capabilities.       |
| `capabilities.unknown?`     | array<string> |  No | Unknown/unprobed capabilities.             |
| `capability_detail?`        | object        |  No | Per-capability confidence/source metadata. |

### 2.3 `compatibility_result` family

Canonical purpose: skills compatible with requested capability set.

| Field                    | Type          | Req | Notes                      |
| ------------------------ | ------------- | --: | -------------------------- |
| `resource_family`        | string        | Yes | `compatibility_result`.    |
| `contract_version`       | string        | Yes | Semver contract version.   |
| `manifest_version`       | string        | Yes | Resolver basis.            |
| `requested_capabilities` | array<string> | Yes | Filter input.              |
| `compatible_count`       | number        | Yes | Result size.               |
| `total_skills`           | number        | Yes | Full manifest denominator. |
| `skills`                 | array<object> | Yes | Compatible skills.         |

`skills[]` minimum:

- Required: `id`, `version`, `capabilities.required`.
- Optional: `description`, `status`, `tags`, `compatibility`, `capabilities.optional`, `capabilities.fallback_mode`.

### 2.4 `task` family

Canonical purpose: durable task lifecycle state and progression.

| Field              | Type             | Req | Notes                                                 |
| ------------------ | ---------------- | --: | ----------------------------------------------------- |
| `resource_family`  | string           | Yes | `task`.                                               |
| `contract_version` | string           | Yes | Semver contract version.                              |
| `task_id`          | string           | Yes | Stable unique ID.                                     |
| `task_code?`       | string           |  No | Friendly code (if allocated).                         |
| `name`             | string           | Yes | Human-readable task name.                             |
| `state`            | string           | Yes | Lifecycle state (`queued`, `active`, `paused`, etc.). |
| `created_at`       | string (ISO8601) | Yes | Creation timestamp.                                   |
| `updated_at`       | string (ISO8601) | Yes | Last state mutation timestamp.                        |
| `route?`           | object           |  No | Route selection details.                              |
| `readiness?`       | object           |  No | Readiness probe output.                               |
| `findings?`        | array<object>    |  No | Accumulated findings/events.                          |

### 2.5 `outcome_contract` family

Canonical purpose: effective execution policy/honesty contract for a tool and channel.

| Field               | Type          | Req | Notes                              |
| ------------------- | ------------- | --: | ---------------------------------- |
| `resource_family`   | string        | Yes | `outcome_contract`.                |
| `contract_version`  | string        | Yes | Semver contract version.           |
| `tool_name`         | string        | Yes | Tool identifier.                   |
| `execution_channel` | string        | Yes | `worker`, `mcp`, `dashboard`, etc. |
| `mode`              | string        | Yes | e.g. `strict`, `advisory`.         |
| `requirements`      | object        | Yes | Required outcome guarantees.       |
| `fallbacks?`        | array<object> |  No | Allowed fallback behavior.         |

## 3) Locality truth matrix

| Resource family        | Worker                                                                 | MCP local runtime                                                 | Dashboard                                          | Source of truth / conflict rule                                                                   |
| ---------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `manifest`             | **Authoritative for distributed clients** (`/v1/manifest/latest`)      | Cached/materialized copy for local operation                      | Read-only projection via runtime action            | Worker wins for published release; MCP cache wins during offline mode.                            |
| `capability_profile`   | Authoritative platform profile (`/v1/capabilities/platform/:platform`) | Authoritative for _current machine_ probe cache                   | Projection of runtime/worker data                  | For local execution decisions, MCP probe truth wins over static Worker platform profile.          |
| `compatibility_result` | Authoritative remote resolver (`/v1/skills/compatible`)                | Deterministic local recompute possible from cached manifest+probe | Projection optimized for UI                        | Use resolver nearest execution surface; ties broken by latest `manifest_version`.                 |
| `task`                 | Authoritative global task lifecycle (`/v1/tasks...`)                   | Local continuation context and transient execution state          | Task-control UX surface (`/api/tasks/...`)         | Worker canonical for durable state IDs/transitions; dashboard mirrors Worker semantics.           |
| `outcome_contract`     | Versioned artifact preview endpoint                                    | Effective contract computed at runtime per channel                | Dashboard includes effective contract in responses | Channel-specific computed contract is canonical for that channel; artifact is reference baseline. |

## 4) Request/response examples

### 4.1 Capability profile lookup (Worker)

Request:

```http
GET /v1/capabilities/platform/claude-web HTTP/1.1
Authorization: Bearer <token>
```

Response:

```json
{
  "resource_family": "capability_profile",
  "contract_version": "1.0.0",
  "platform": "claude-web",
  "surface": "web-app",
  "manifest_version": "0.5.4",
  "capabilities": {
    "supported": ["network.http", "ui.prompt-only"],
    "unsupported": ["shell.exec"],
    "unknown": ["fs.read", "fs.write"]
  }
}
```

### 4.2 Compatible skills query (Worker)

Request:

```http
GET /v1/skills/compatible?caps=network.http,ui.prompt-only HTTP/1.1
Authorization: Bearer <token>
```

Response:

```json
{
  "resource_family": "compatibility_result",
  "contract_version": "1.0.0",
  "manifest_version": "0.5.4",
  "requested_capabilities": ["network.http", "ui.prompt-only"],
  "compatible_count": 18,
  "total_skills": 26,
  "skills": [
    {
      "id": "code-review",
      "version": "1.0.0",
      "capabilities": { "required": [], "optional": ["fs.read"] }
    }
  ]
}
```

### 4.3 Task create (Worker)

Request:

```http
POST /v1/tasks HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "review-repository",
  "goal": "baseline quality and migration readiness"
}
```

Response:

```json
{
  "resource_family": "task",
  "contract_version": "1.0.0",
  "task_id": "task_01JXYZ...",
  "task_code": "T-0042",
  "name": "review-repository",
  "state": "queued",
  "created_at": "2026-03-26T12:10:00.000Z",
  "updated_at": "2026-03-26T12:10:00.000Z"
}
```

### 4.4 Outcome contract preview (dashboard)

Request:

```http
GET /api/outcome-contract?tool_name=skill_stats HTTP/1.1
```

Response:

```json
{
  "success": true,
  "effectiveOutcomeContract": {
    "resource_family": "outcome_contract",
    "contract_version": "1.0.0",
    "tool_name": "skill_stats",
    "execution_channel": "dashboard",
    "mode": "strict",
    "requirements": {
      "honesty": "must-report-unexecuted-work"
    }
  }
}
```

## 5) Render examples by major resource

### 5.1 `manifest`

1. **Concise LLM answer**

```json
{
  "answer": "Manifest 0.5.4 exposes 26 skills; 18 are web-compatible for network-only surfaces."
}
```

2. **Compact human card**

```json
{
  "title": "Manifest v0.5.4",
  "badges": ["26 skills", "generated 2026-03-26"],
  "meta": { "contract": "1.0.0" }
}
```

3. **Richer UI panel shape**

```json
{
  "panel": "manifest_overview",
  "summary": {
    "manifest_version": "0.5.4",
    "contract_version": "1.0.0",
    "skill_count": 26
  },
  "sections": [
    { "id": "stable", "label": "Stable", "count": 22 },
    { "id": "beta", "label": "Beta", "count": 4 }
  ],
  "actions": [{ "id": "download", "label": "Download artifact" }]
}
```

### 5.2 `capability_profile`

1. **Concise LLM answer**

```json
{
  "answer": "claude-web supports network.http and ui.prompt-only; shell and fs access are unavailable or unknown."
}
```

2. **Compact human card**

```json
{
  "title": "claude-web",
  "chips": ["2 supported", "1 unsupported", "2 unknown"],
  "meta": { "surface": "web-app" }
}
```

3. **Richer UI panel shape**

```json
{
  "panel": "capability_profile",
  "platform": "claude-web",
  "columns": {
    "supported": ["network.http", "ui.prompt-only"],
    "unsupported": ["shell.exec"],
    "unknown": ["fs.read", "fs.write"]
  },
  "diagnostics": [
    {
      "capability": "network.http",
      "confidence": "medium",
      "source": "vendor-doc"
    }
  ]
}
```

### 5.3 `compatibility_result`

1. **Concise LLM answer**

```json
{
  "answer": "18 of 26 skills match your requested capabilities; high-fit examples include code-review and explain-code."
}
```

2. **Compact human card**

```json
{
  "title": "Compatible skills",
  "badges": ["18 matched", "8 excluded"],
  "meta": { "caps": ["network.http", "ui.prompt-only"] }
}
```

3. **Richer UI panel shape**

```json
{
  "panel": "compatibility_results",
  "filters": {
    "requested_capabilities": ["network.http", "ui.prompt-only"]
  },
  "totals": {
    "compatible_count": 18,
    "total_skills": 26
  },
  "items": [
    {
      "id": "code-review",
      "version": "1.0.0",
      "required_caps": [],
      "optional_caps": ["fs.read"],
      "status": "stable"
    }
  ]
}
```

### 5.4 `task`

1. **Concise LLM answer**

```json
{
  "answer": "Task T-0042 is queued and ready for route selection; last update at 12:10 UTC."
}
```

2. **Compact human card**

```json
{
  "title": "T-0042 review-repository",
  "status": "queued",
  "meta": { "updated_at": "2026-03-26T12:10:00.000Z" }
}
```

3. **Richer UI panel shape**

```json
{
  "panel": "task_detail",
  "identity": {
    "task_id": "task_01JXYZ...",
    "task_code": "T-0042",
    "name": "review-repository"
  },
  "state": {
    "current": "queued",
    "timeline": [{ "state": "queued", "at": "2026-03-26T12:10:00.000Z" }]
  },
  "route": {
    "selected": null,
    "candidates": []
  }
}
```

### 5.5 `outcome_contract`

1. **Concise LLM answer**

```json
{
  "answer": "Dashboard runs skill_stats in strict honesty mode and must disclose unexecuted actions."
}
```

2. **Compact human card**

```json
{
  "title": "Outcome contract",
  "badges": ["dashboard", "strict"],
  "meta": { "tool": "skill_stats", "contract": "1.0.0" }
}
```

3. **Richer UI panel shape**

```json
{
  "panel": "outcome_contract",
  "tool": "skill_stats",
  "channel": "dashboard",
  "mode": "strict",
  "requirements": [
    { "key": "honesty", "value": "must-report-unexecuted-work" }
  ],
  "fallbacks": []
}
```

## 6) Migration notes from legacy endpoints

### 6.1 Legacy-to-portable mapping

| Legacy surface                 | Legacy path                | Portable path                                | Migration action                                                                          |
| ------------------------------ | -------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Dashboard API                  | `/api/manifest`            | `/v1/manifest/latest` (Worker)               | Keep `/api/manifest` as UI facade; attach `resource_family` + `contract_version`.         |
| Dashboard API                  | `/api/outcome-contract`    | `/v1/effective-contract/preview` (Worker)    | Align payload naming to `outcome_contract` family while preserving UI helper field names. |
| Unversioned/implicit responses | n/a                        | `/v1/...` + body-level `contract_version`    | Introduce explicit version values; reject shape-breaking changes without major bump.      |
| Ad-hoc local objects           | local-only runtime outputs | MCP response envelope with `resource_family` | Wrap existing payloads in portable envelope before cross-surface sharing.                 |

### 6.2 Breaking-change migration checklist

When moving from legacy shape to contract v1 envelope:

1. Add `resource_family` and `contract_version` at top-level.
2. Preserve legacy fields during one deprecation window (MINOR release).
3. Emit deprecation metadata (`meta.deprecated_fields[]`) where practical.
4. Remove legacy aliases only on next MAJOR contract.

### 6.3 Consumer hardening notes

- Treat unknown fields as non-fatal.
- Prefer feature detection (`if field exists`) over strict field-count checks.
- Pin by major contract (`1.x`) and monitor minor changes automatically.
