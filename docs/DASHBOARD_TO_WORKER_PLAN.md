# Dashboard → Worker Migration Spec

Every dashboard tab must read from Worker-backed canonical envelopes.
The local runtime computes state and publishes snapshots to the Worker;
the Worker stores and serves them. The dashboard is a pure consumer.

## Hard rule

"Worker-backed" means: **local-runtime-computes → publishes → Worker stores and serves.**
The Worker does not compute local-derived data itself.

## Target canonical resources per tab

| Tab | Resource(s) | Worker endpoint(s) |
|-----|-------------|-------------------|
| Tools | `tooling.status` | `GET /v1/tooling/status` |
| Skills | `skills.list` | `GET /v1/skills` |
| Context | `runtime.context_cost` | `GET /v1/runtime/context-cost` |
| Config | `config.summary` | `GET /v1/config/summary` |
| Audit | `audit.validate_all` | `GET /v1/audit/validate-all` |
| Analytics | `analytics.tool_usage` | `GET /v1/analytics/tool-usage` |
|           | `analytics.skill_effectiveness` | `GET /v1/analytics/skill-effectiveness` |
|           | `analytics.autoresearch_runs` | `GET /v1/analytics/autoresearch-runs` |
|           | `analytics.friction_signals` | `GET /v1/analytics/friction-signals` |
| Observability | `observability.runs.list` | `GET /v1/observability/runs` |
|               | `observability.runs.get` | `GET /v1/observability/runs/:runId` |
|               | `observability.settings.get` | `GET /v1/observability/settings` |
|               | `observability.settings.put` | `PUT /v1/observability/settings` |
| Hub (Tasks) | Already Worker-backed | No change |

## Publish endpoints (local runtime → Worker)

Each locally-derived resource has a corresponding publish route:

| Resource | Publish route |
|----------|--------------|
| `skills.list` | `POST /v1/skills/publish` |
| `tooling.status` | `POST /v1/tooling/status/publish` |
| `config.summary` | `POST /v1/config/summary/publish` |
| `runtime.context_cost` | `POST /v1/runtime/context-cost/publish` |
| `audit.validate_all` | `POST /v1/audit/validate-all/publish` |
| `analytics.tool_usage` | `POST /v1/analytics/tool-usage/publish` |
| `analytics.skill_effectiveness` | `POST /v1/analytics/skill-effectiveness/publish` |
| `analytics.autoresearch_runs` | `POST /v1/analytics/autoresearch-runs/publish` |
| `analytics.friction_signals` | `POST /v1/analytics/friction-signals/publish` |

## Action routes (dashboard → Worker → local runtime)

Dashboard action buttons do not shell out locally. Instead:
1. Dashboard POSTs a request to Worker
2. Local runtime performs the job
3. Runtime publishes result back to Worker
4. Dashboard re-reads the Worker contract

| Action | Route |
|--------|-------|
| Tools sync | `POST /v1/tooling/sync-request` |
| Audit validate-all | `POST /v1/audit/validate-all/request` |
| Context cost refresh | `POST /v1/runtime/context-cost/request` |

## Required freshness metadata

Every published resource must include in `meta`:

```json
{
  "generated_at": "<ISO 8601>",
  "publisher_surface": "<surface identifier>",
  "freshness_state": "fresh | stale | missing | pending",
  "scope": {
    "repo_id": "<repo>",
    "machine_id": "<machine>"
  }
}
```

## KV key shape

```
dashboard:{resource}:{repo_id}:{machine_id}
```

Example: `dashboard:skills.list:thomashillman/ai-config-os:vm`

## Required interpretation shape (meta.interpretation)

All contract builders must emit this block inside `meta`:

```json
{
  "why_it_matters_now": "...",
  "attention_required": true,
  "top_opportunity": "...",
  "empty_state_reason": "...",
  "best_next_action": "...",
  "severity": "warning | info | ok"
}
```

The UI must never derive these values itself.

## Migration checklist

Track status as each resource moves from local-only to Worker-backed.

| Resource | Status |
|----------|--------|
| `runtime.capabilities` | Worker-backed ✓ |
| `tasks.*` | Worker-backed ✓ |
| `observability.*` | In progress — on main envelope, removing `canonical_v2` |
| `skills.list` | Pending migration |
| `tooling.status` | Pending migration |
| `config.summary` | Pending migration |
| `runtime.context_cost` | Pending migration |
| `audit.validate_all` | Pending migration |
| `analytics.tool_usage` | Pending migration |
| `analytics.skill_effectiveness` | Pending migration |
| `analytics.autoresearch_runs` | Pending migration |
| `analytics.friction_signals` | Pending migration |

## Definition of done

- Every tab in `dashboard/src/App.jsx` reads Worker-backed contracts
- `runtime/mcp/dashboard-api.mjs` is no longer the source of truth for any dashboard contract
- Every dashboarded contract includes contract-owned interpretation in `summary`, `meta`, `suggested_actions`
- Observability uses the same main envelope as tasks — no `canonical_v2`
- `docs/CONTRACTS.md` no longer marks any dashboard-target resource as local-only
- Tests prove the dashboard is a contract consumer, not a semantic co-author
