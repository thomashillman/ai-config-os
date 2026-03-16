# Executor Worker (Phase 1)

Cloudflare Worker implementing Phase 1 executor functionality. All operations use pre-computed data from KV/R2 only (no shell, no filesystem, no subprocess execution).

## Supported Tools

- **`health_check`** — Worker health/status
- **`list_phase1_tools`** — Available Phase 1 tools
- **`get_skill_metadata`** — Fetch skill metadata from KV
- **`get_artifact`** — Fetch versioned manifests from R2
- **`skill_stats_cached`** — Pre-computed statistics from KV

## Unsupported Tools (Phase 0, Not Available)

- `sync_tools` → returns 403 TOOL_NOT_SUPPORTED
- `list_tools` → returns 403 TOOL_NOT_SUPPORTED
- `get_config` → returns 403 TOOL_NOT_SUPPORTED
- `context_cost` → returns 403 TOOL_NOT_SUPPORTED
- `validate_all` → returns 403 TOOL_NOT_SUPPORTED

Phase 0 tools require shell script execution and file system access, which are not available in Cloudflare Workers.

## Configuration

### Secrets

```bash
# Set shared secret for request authentication
wrangler secret put EXECUTOR_SHARED_SECRET --env production
wrangler secret put EXECUTOR_SHARED_SECRET --env staging
```

### Bindings

- **`MANIFEST_KV`** — Shared with main Worker, contains skill metadata and stats
- **`ARTEFACTS_R2`** — Shared with main Worker, contains versioned artifacts

### Timeout

Maximum **15 seconds** for Phase 1. Requests with `timeout_ms > 15000` are clamped to 15000.

## Local Development

```bash
wrangler dev
```

Test with curl:

```bash
curl -X POST http://localhost:8787/v1/execute \
  -H "X-Executor-Shared-Secret: test" \
  -H "Content-Type: application/json" \
  -d '{"tool":"health_check"}'
```

## Deployment

```bash
# Production
wrangler deploy

# Staging
wrangler deploy --env staging
```

## Request/Response Format

### Request

```json
{
  "tool": "string (required)",
  "args": ["string array (optional)"],
  "timeout_ms": "number (optional, clamped to 15000)",
  "request_id": "string (optional)",
  "metadata": "object (optional)"
}
```

### Response

**Success:**
```json
{
  "ok": true,
  "status": 200,
  "result": {},
  "request_id": "string (if provided)"
}
```

**Error:**
```json
{
  "ok": false,
  "status": "number",
  "error": {
    "code": "string",
    "message": "string"
  },
  "request_id": "string (if provided)"
}
```

## Architecture

- Invoked via service binding from main Worker (no HTTP overhead)
- All data pre-computed and stored in KV/R2
- No shell execution, filesystem access, or process spawning
- Timeout clamped to 15s (Worker isolation constraint)
- Phase 0 tools explicitly rejected with 403

## Phase 2+ Future

Phase 2 will add support for shell-based tools via a VPS/Node executor. The Phase 1 Cloudflare-only path will remain as the primary, fast path for KV/R2 queries.
