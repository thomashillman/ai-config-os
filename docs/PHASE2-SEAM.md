# Phase 2 External Executor Seam

This document preserves the execution seam for a future Phase 2 VPS-backed executor.

## Current State (Phase 1)

Phase 1 uses Cloudflare Workers exclusively:
- Main Worker invokes executor Worker via **service binding** (primary path)
- No external executor host required
- No shell, filesystem, or long-lived process support

## Preserved Seam for Phase 2

The following code and configuration preserve the path for adding a VPS executor in Phase 2:

### 1. Fallback Execution Path

**Location:** `worker/src/handlers/executor.ts:195`

The main Worker checks `env.EXECUTOR` (service binding) first, then falls back to `env.EXECUTOR_PROXY_URL` (HTTP proxy).

```typescript
if (env.EXECUTOR) {
  return invokeExecutorServiceBinding(env, ...);  // Phase 1: Cloudflare
}

if (env.EXECUTOR_PROXY_URL) {
  return invokeExecutorProxy(env, ...);            // Phase 2 seam: External VPS
}
```

No changes needed here — a future Phase 2 can simply set `EXECUTOR_PROXY_URL` to point to a VPS executor.

### 2. Configuration for External Executor

**Location:** `worker/wrangler.toml`

```toml
[vars]
EXECUTOR_PROXY_URL = "https://remote-executor.example.com"  # Optional in Phase 1, Phase 2 future
```

This variable is optional for Phase 1 but can be used for Phase 2 without code changes.

### 3. Reference Phase 0 Executor Implementation

**Location:** `runtime/remote-executor/server.mjs`

A reference implementation exists for how an external executor would handle Phase 0 (and potentially Phase 2) tools:
- Shell execution
- Filesystem access
- Git operations
- Runtime sync

This can be used as a template for implementing Phase 2.

## What a Future Phase 2 Implementation Should Do

1. Implement the HTTP executor interface (POST /v1/execute)
2. Support shell execution, filesystem access, git, and long-lived processes
3. Set `EXECUTOR_PROXY_URL` in main Worker config
4. Phase 1 code needs **no changes** — the fallback path already exists

## Testing the Seam

To verify the seam is ready:
- Deploy main Worker with service binding (Phase 1, default)
- Optionally set `EXECUTOR_PROXY_URL` to test fallback without changing code
- Phase 0 and Phase 2 can both use the same proxy path
