# Capability Discovery API

The capability discovery API exposes two lightweight endpoints on the Cloudflare Worker that allow any client — including browsers and mobile apps — to discover which skills are compatible with their runtime environment.

All responses are:
- **CORS-enabled** (works from any browser/iOS WebView)
- **Immutably cached** (`Cache-Control: max-age=31536000, immutable`)
- **ETag-bearing** (clients can use conditional requests)
- **Versioned** by manifest version and/or platform ID

---

## Authentication

All endpoints require a bearer token:

```
Authorization: Bearer <AI_CONFIG_TOKEN>
```

---

## Endpoints

### `GET /v1/capabilities/platform/:platform`

Returns the capability profile for a platform. Profile is derived from the compiled
platform YAML definitions and embedded in the Worker at build time — no runtime YAML
parsing, no hardcoded tables.

**Path parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `platform` | Yes | Platform ID. One of: `claude-code`, `claude-web`, `claude-ios`, `cursor`, `codex` |

**Response (200):**

```json
{
  "platform": "claude-web",
  "name": "Claude Web",
  "surface": "web-app",
  "manifest_version": "0.5.4",
  "capabilities": {
    "supported": ["network.http", "ui.prompt-only"],
    "unsupported": ["shell.exec", "shell.long-running", "secrets.inject"],
    "unknown": ["fs.read", "fs.write", "git.read", "git.write", "mcp.client", "env.read", "browser.fetch"]
  },
  "capability_detail": {
    "network.http": {
      "status": "supported",
      "confidence": "medium",
      "source": "vendor-doc",
      "verified_at": "2026-03-07"
    }
  },
  "notes": "Web interface. Most local capabilities unknown until probed. Prompt-only mode always available."
}
```

**Error responses:**

| Status | Error code | Meaning |
|--------|-----------|---------|
| 404 | `INVALID_PLATFORM` | Unknown platform identifier |

---

### `GET /v1/skills/compatible?caps=cap1,cap2,...`

Returns all skills from the manifest where every `capabilities.required` entry is
satisfied by the requested capability set. Skills with zero required capabilities are
always returned.

Each skill includes its full pre-computed `compatibility` matrix so clients can display
platform-specific status and notes without extra round trips.

**Query parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `caps` | Yes | Comma-separated capability IDs (e.g. `network.http,fs.read,shell.exec`) |

**Capability ID format:** `word.word[.word]*` — all lowercase, dot-separated segments.

**Response (200):**

```json
{
  "manifest_version": "0.5.4",
  "requested_capabilities": ["network.http"],
  "compatible_count": 18,
  "total_skills": 26,
  "skills": [
    {
      "id": "code-review",
      "version": "1.0.0",
      "description": "Structured code review with severity levels.",
      "type": "prompt",
      "status": "stable",
      "tags": ["review"],
      "capabilities": {
        "required": [],
        "optional": ["fs.read", "git.read"],
        "fallback_mode": "prompt-only"
      },
      "compatibility": {
        "claude-code": { "status": "supported", "mode": "native", "package": "skill" },
        "claude-web":  { "status": "supported", "mode": "native", "package": "api" },
        "claude-ios":  { "status": "supported", "mode": "native", "package": "api" }
      }
    }
  ]
}
```

**Error responses:**

| Status | Error code | Meaning |
|--------|-----------|---------|
| 400 | `MISSING_CAPS_PARAM` | `caps` query parameter not provided |
| 400 | `EMPTY_CAPS_PARAM` | `caps` is empty after parsing |
| 400 | `INVALID_CAPABILITY_FORMAT` | One or more capability IDs fail format check |

---

## Error response shape

All errors follow this consistent structure:

```json
{
  "error": {
    "code": "INVALID_PLATFORM",
    "message": "Unknown platform: 'my-platform'.",
    "hint": "Known platforms: claude-code, claude-web, claude-ios, cursor, codex"
  }
}
```

All error responses also include CORS headers.

---

## Common query patterns

**All skills available on Claude Code Web:**
```
GET /v1/skills/compatible?caps=network.http,ui.prompt-only
```

**All skills available on iOS:**
```
GET /v1/skills/compatible?caps=network.http
```

**All skills requiring no capabilities (always compatible):**
```
GET /v1/skills/compatible?caps=network.http
```
_(skills with `required: []` are always included)_

**Full CLI skill set:**
```
GET /v1/skills/compatible?caps=fs.read,fs.write,shell.exec,git.read,git.write,network.http,mcp.client,env.read
```

**Check a specific platform first, then filter:**
```
# 1. Get platform profile
GET /v1/capabilities/platform/claude-web

# 2. Use response.capabilities.supported as input
GET /v1/skills/compatible?caps=network.http,ui.prompt-only
```

---

## Caching strategy

Both endpoints use `Cache-Control: public, max-age=31536000, immutable` and an `ETag`
based on a stable cache key:

| Endpoint | Cache key | Changes when |
|----------|-----------|-------------|
| `/v1/capabilities/platform/:platform` | Platform ID | Platform YAML definition changes (requires new deploy) |
| `/v1/skills/compatible?caps=...` | `{manifest_version}:{sorted_caps}` | Manifest version bumped |

Clients should honour ETags for conditional requests to avoid re-downloading unchanged
responses. The reference client (`adapters/claude/capabilities-client.mjs`) handles
this automatically.

---

## Performance

- **Platform profile:** typically <5ms (edge cache hit: <1ms)
- **Compatible skills:** typically <50ms on first request; <1ms on edge cache hit
- **Worker CPU:** <10ms per request (no KV/R2 reads required for capability endpoints)
- **Response size:** platform profile ~1–3KB, compatible skills ~20–80KB (varies by filter)

---

## Troubleshooting

**"Unknown platform" (404):** The platform ID is not in the compiled registry.
Check `shared/targets/platforms/` for valid YAML files and rebuild.

**"Invalid capability format" (400):** Capability IDs must be lowercase dot-separated
(e.g. `fs.read`, not `FS_READ` or `filesystem`). Use `/v1/capabilities/platform/:platform`
to discover valid IDs for a platform.

**CORS errors in browser:** Ensure the `Authorization` header is allowed in the CORS
preflight. The Worker returns `Access-Control-Allow-Headers: Authorization` on all
OPTIONS requests. If using a proxy, ensure it passes CORS headers through.

**Empty compatible skills list:** Either no skills satisfy your capability set, or
all skills require capabilities you haven't provided. Try adding `network.http` —
most prompt-only skills have zero required capabilities and will always be included.
