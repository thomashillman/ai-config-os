# Observability API migration to canonical v2 fields

As of canonical version `v2`, the observability endpoints now include a versioned canonical envelope while preserving legacy fields for compatibility.

## Affected endpoints

- `GET /v1/observability/runs`
- `GET /v1/observability/runs/:runId`
- `GET /v1/observability/settings`
- `PUT /v1/observability/settings`

## Run payload migration

Legacy run fields are unchanged. New canonical and mirrored fields are now present per run:

- `attention_required` (boolean)
- `failure_reason_summary` (non-expert wording)
- `next_actions` (string array)
- `locality` (string metadata)
- `capability` (string metadata)
- `canonical_v2.signals` (versioned canonical container for the same data)

### Migration guidance

1. Continue reading legacy run fields to avoid breaking existing clients.
2. Start reading `canonical_v2.signals` as the canonical source for shared action/signal data.
3. After all clients migrate, keep legacy reads as a defensive fallback.

## Settings payload migration

Settings responses now include:

- `settings` (legacy compatibility payload)
- `canonical_v2.payload.settings` (canonical versioned settings payload)
- `canonical_v2.payload.locality`
- `canonical_v2.payload.capability`

### Migration guidance

1. Keep existing `settings` parsing for compatibility.
2. Prefer `canonical_v2.payload.settings` for new integrations that need explicit schema versioning.
3. Use locality/capability metadata for routing and UI labeling where applicable.
