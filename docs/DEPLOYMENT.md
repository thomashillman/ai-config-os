# Cloudflare Worker Deployment Runbook

This guide explains how to deploy the ai-config-os Workers to Cloudflare staging and production environments.

## Architecture Overview

**Phase 1: Cloudflare-first execution (primary path)**

The deployment consists of **two Workers**:

1. **Main Worker** (`worker/`) — API gateway, serves artifacts, routes execution
2. **Executor Worker** (`worker/executor/`) — Executes Phase 1 tools (KV/R2 queries only)

The main Worker invokes the executor Worker via **service binding** (no external URL required). This is the default Phase 1 path.

**Legacy compatibility (Phase 0) / Future Phase 2 path**

For backward compatibility or future VPS executor, the main Worker can fall back to an HTTP proxy (`EXECUTOR_PROXY_URL`). This is **optional** for Phase 1.

## Deployment Overview

The deployment process has two parts:

1. **Repo-side:** Build artifacts, validate config, deploy both Workers to Cloudflare
2. **Cloudflare-side:** Create KV/R2 resources, set secrets (external to this repo)

This document covers the repo-side steps. Cloudflare resource setup is manual and one-time.

## What Gets Deployed (Two Workers)

**Executor Worker** (`worker/executor/`) — Deployed first

- TypeScript sources (`worker/executor/src/`) compiled by Wrangler
- Configuration (`worker/executor/wrangler.toml`) — KV/R2 bindings, secrets
- Handles Phase 1 tools (KV/R2 metadata queries only)
- Service name: `ai-config-os-executor` (production) or `ai-config-os-executor-staging` (staging)

**Main Worker** (`worker/`) — Deployed second

- TypeScript sources (`worker/src/`) compiled by Wrangler
- Bundled artifacts (`dist/`) — Skill registry and client plugin JSON
- Configuration (`worker/wrangler.toml`) — Service binding, KV/R2 bindings, secrets
- Routes requests to executor Worker via service binding
- Manages task state and orchestration

## Environment Structure

Both `worker/wrangler.toml` and `worker/executor/wrangler.toml` have two environment configurations:

**Main Worker (`worker/wrangler.toml`):**

- **Production (default)** — Root-level `[vars]`, `[[services]]`, `[[kv_namespaces]]`, `[[r2_buckets]]` sections
- **Staging** — Under `[env.staging]` with `[env.staging.vars]`, `[[env.staging.services]]`, etc.

**Executor Worker (`worker/executor/wrangler.toml`):**

- **Production (default)** — Root-level `[vars]`, `[[kv_namespaces]]`, `[[r2_buckets]]` sections
- **Staging** — Under `[env.staging]` with `[env.staging.vars]`, etc.

Deployment: `wrangler deploy` (production) or `wrangler deploy --env staging` from each Worker directory.

## Prerequisites

### On Your Machine

1. Node.js 18+ installed
2. npm dependencies installed:
   ```bash
   npm install
   cd worker && npm install
   ```
3. Cloudflare credentials configured (one-time):
   ```bash
   # Authenticate with Cloudflare (stored in ~/.wrangler/config.toml)
   npx wrangler login
   ```

### In Cloudflare (One-time Setup)

Create these resources **once** and keep the IDs/names for the steps below:

#### 1. KV Namespace for Manifest Storage

```bash
# Create staging namespace
npx wrangler kv:namespace create "manifest-kv" --preview false --env staging

# Create production namespace (optional)
npx wrangler kv:namespace create "manifest-kv" --preview false
```

Copy the namespace ID and update `worker/wrangler.toml`:

- **Staging:** Under `[[env.staging.kv_namespaces]]`: set `id = "your-staging-kv-id"`
- **Production:** Under `[[kv_namespaces]]` (root): set `id = "your-production-kv-id"` (if deploying to production)

#### 2. R2 Bucket for Artifacts

```bash
# Create staging bucket
npx wrangler r2 bucket create ai-config-os-artefacts-staging

# Create production bucket (optional)
npx wrangler r2 bucket create ai-config-os-artefacts
```

These bucket names are already referenced in `worker/wrangler.toml`:

- **Staging:** Under `[[env.staging.r2_buckets]]`: `bucket_name = "ai-config-os-artefacts-staging"`
- **Production:** Under `[[r2_buckets]]` (root): `bucket_name = "ai-config-os-artefacts"`

#### 3. Executor Worker (Phase 1 primary path)

The executor Worker is deployed **from `worker/executor/`** after the main Worker. No external service needed for Phase 1.

**Phase 0 compat (optional) / Phase 2 future:**
The external executor path is preserved for:

1. Backward compatibility with Phase 0 external executors
2. Future Phase 2 with a VPS-backed executor

If you need this path, set up a service outside Cloudflare:

- Listen on an HTTP endpoint (e.g., `https://executor-staging.example.com`)
- Support `POST /v1/execute` route
- Use the same `EXECUTOR_SHARED_SECRET` as the Workers

See:

- `runtime/remote-executor/` for the Phase 0 reference implementation
- `docs/PHASE2-SEAM.md` for how Phase 2 can reuse this path

#### 4. Worker Secrets

Set these via Wrangler CLI (values stored securely in Cloudflare). Secrets are environment-specific.

```bash
# For staging deployment
npx wrangler secret put AUTH_TOKEN --env staging
# Paste your staging bearer token

npx wrangler secret put EXECUTOR_SHARED_SECRET --env staging
# Paste your shared executor secret

# Optionally set rotation token
npx wrangler secret put AUTH_TOKEN_NEXT --env staging
```

For production, repeat without `--env` (which defaults to production):

```bash
npx wrangler secret put AUTH_TOKEN
# Paste your production bearer token

npx wrangler secret put EXECUTOR_SHARED_SECRET
# Paste your production executor secret
```

## Deploy to Staging

### Step 0: Build Artifacts (Root)

```bash
npm run build
# Or manually:
bash scripts/deploy/build-worker.sh
```

This generates `dist/` with:

- `dist/registry/index.json` — Skill registry with versions
- `dist/clients/claude-code/.claude-plugin/plugin.json` — Client metadata

### Step 1: Deploy Executor Worker First (Required)

**The executor Worker MUST be deployed before the main Worker.** This is required for Phase 1 service binding to resolve.

```bash
cd worker/executor
npx wrangler deploy --env staging
cd ../..
```

Note the executor Worker URL (e.g., `https://ai-config-os-executor-staging.your-domain.workers.dev`). The main Worker's wrangler.toml references this service by name.

### Step 2: Validate Configuration for Main Worker (Staging)

```bash
cd ../..  # Back to repo root
npm run deploy:validate
# Or manually:
node scripts/deploy/validate-config.mjs worker staging
```

This checks:

- Service binding configuration (`[[env.staging.services]]`)
- Staging-specific KV and R2 bindings
- Staging environment variables (no placeholder values)

Phase 1 validation prioritizes **service binding** as the primary path.

### Step 3: Deploy Main Worker (Staging)

```bash
npm run deploy:staging
# Or manually:
bash scripts/deploy/deploy-staging.sh
```

This script:

1. Validates staging configuration
2. Checks build artifacts
3. Runs `npx wrangler deploy --env staging` in the `worker/` directory (main Worker)
4. Reports main Worker URL

**Output:**

```
✓ Deployment successful!

Next steps:
  1. Note your Worker URL (e.g., https://ai-config-os.your-domain.workers.dev)
  2. Run smoke tests:
     export AI_CONFIG_WORKER_URL="https://your-worker-url/v1"
     export AI_CONFIG_WORKER_TOKEN="your-staging-token"
     node scripts/deploy/smoke-tests.mjs
```

### Step 4: Run Smoke Tests (Phase 1 Validation)

```bash
export AI_CONFIG_WORKER_URL="https://your-staging-worker.workers.dev/v1"
export AI_CONFIG_WORKER_TOKEN="your-staging-token"

npm run smoke:test
# Or manually:
node scripts/deploy/smoke-tests.mjs
```

Tests verify the Phase 1 architecture:

- ✓ `GET /health` — Main Worker responds
- ✓ `GET /manifest/latest` — Registry is accessible
- ✓ `GET /client/claude-code/latest` — Client plugin works
- ✓ `POST /tasks` — Task creation succeeds
- ✓ `POST /execute` — Executor Worker responds via service binding (Phase 1 primary path)
- ✓ Auth required — `401` when no token provided

The `/execute` test confirms service binding to executor Worker is working. If it fails, check:

1. Executor Worker was deployed successfully (Step 1)
2. Service binding is configured in main Worker's `wrangler.toml`
3. Both Workers are in the same Cloudflare account and region

**Success output:**

```
Smoke Tests — Deployment Readiness Check
------------------------------------------

GET /health ✓ 200 - OK
GET /manifest/latest ✓ 200 - OK
GET /client/claude-code/latest ✓ 200 - OK
POST /tasks ✓ 201 - OK
POST /execute ✓ 502 (executor unavailable but auth works)
Auth Requirement Tests
GET /health (no auth) ✓ 401 - Auth required

6 passed, 0 failed

✓ All smoke tests passed. Deployment is ready.
```

## Deploy to Production (Optional)

Once staging is validated, deploy to production following the same two-Worker pattern:

### Step 1: Set Production Secrets

```bash
# Executor Worker secrets
cd worker/executor
npx wrangler secret put EXECUTOR_SHARED_SECRET
# Paste your production executor secret

# Main Worker secrets
cd ../
npx wrangler secret put AUTH_TOKEN
# Paste your production token

npx wrangler secret put EXECUTOR_SHARED_SECRET
# Paste your production executor secret
```

### Step 2: Deploy Executor Worker First (Production)

```bash
cd worker/executor
npx wrangler deploy
```

### Step 3: Validate Production Configuration (Main Worker)

```bash
cd ../..  # Back to repo root
node scripts/deploy/validate-config.mjs worker production
```

**Note:** This validates the root-level `[vars]`, `[[services]]`, `[[kv_namespaces]]`, and `[[r2_buckets]]` sections.

### Step 4: Deploy Main Worker (Production)

```bash
npm run build
cd worker && npx wrangler deploy
```

**Note:** Omitting `--env` deploys to production (the default in `wrangler.toml`).

### Step 5: Smoke Test (Production)

```bash
export AI_CONFIG_WORKER_URL="https://your-production-worker.workers.dev/v1"
export AI_CONFIG_WORKER_TOKEN="your-production-token"
npm run smoke:test
```

## Local Development

### Phase 1: Run Both Workers Locally (Primary Path)

This is the recommended way to test the Phase 1 two-Worker architecture locally.

**Terminal 1: Start executor Worker first**

```bash
cd worker/executor
npx wrangler dev
# Executor available at http://localhost:8788
```

**Terminal 2: Start main Worker**

```bash
cd ../..  # Back to repo root
cd worker

# Create `.env.local` for main Worker
cat > .env.local << EOF
AUTH_TOKEN=local-test-token
EXECUTOR_SHARED_SECRET=local-test-secret
EOF

npx wrangler dev
# Main Worker available at http://localhost:8787
# Service binding will automatically resolve to the local executor Worker
```

**Terminal 3: Run smoke tests**

```bash
cd ../..  # Back to repo root
export AI_CONFIG_WORKER_URL="http://localhost:8787/v1"
export AI_CONFIG_WORKER_TOKEN="local-test-token"
npm run smoke:test
```

The `/execute` test confirms service binding to executor Worker is working.

### Phase 0 Compat: Local Executor with HTTP Proxy (Legacy)

To test the Phase 0 fallback path (not recommended for Phase 1):

```bash
# In main Worker .env.local:
EXECUTOR_PROXY_URL=http://localhost:8788

# In another terminal, start legacy executor:
export REMOTE_EXECUTOR_PORT=8788
export REMOTE_EXECUTOR_SHARED_SECRET="local-test-secret"
bash scripts/deploy/start-local-executor.sh
```

This is only for backward compatibility testing. Phase 1 uses service binding.

## Environment Variables Summary

### Worker Secrets (set via `wrangler secret put`)

| Name                        | Required | Purpose                                 |
| --------------------------- | -------- | --------------------------------------- |
| `AUTH_TOKEN`                | Yes      | Bearer token for API authentication     |
| `AUTH_TOKEN_NEXT`           | No       | Next token for rotation                 |
| `EXECUTOR_SHARED_SECRET`    | Yes      | Shared secret for executor verification |
| `HANDOFF_TOKEN_SIGNING_KEY` | No       | Private key for handoff token signing   |

### Worker Public Variables (in `wrangler.toml`)

| Name                  | Required     | Purpose                                                                                            |
| --------------------- | ------------ | -------------------------------------------------------------------------------------------------- |
| `ENVIRONMENT`         | Yes          | Environment label: `staging`, `production`                                                         |
| `EXECUTOR_PROXY_URL`  | No (Phase 1) | URL to remote executor; only for Phase 0 backward compat or Phase 2. Phase 1 uses service binding. |
| `EXECUTOR_TIMEOUT_MS` | No           | Executor timeout in ms (default: 10000)                                                            |

### Cloud Resources (in `wrangler.toml`)

| Binding        | Type         | Purpose                               |
| -------------- | ------------ | ------------------------------------- |
| `MANIFEST_KV`  | KV Namespace | Stores version pointers and manifests |
| `ARTEFACTS_R2` | R2 Bucket    | Stores skill artifacts (JSON files)   |

### Executor Environment (on executor service)

| Name                                       | Required | Purpose                                       |
| ------------------------------------------ | -------- | --------------------------------------------- |
| `REMOTE_EXECUTOR_PORT`                     | No       | Port to listen on (default: 8788)             |
| `REMOTE_EXECUTOR_SHARED_SECRET`            | Yes      | Must match worker's `EXECUTOR_SHARED_SECRET`  |
| `REMOTE_EXECUTOR_TIMEOUT_MS`               | No       | Tool execution timeout (default: 15000)       |
| `REMOTE_EXECUTOR_SIGNATURE_PUBLIC_KEY_PEM` | No       | Public key for request signature verification |
| `REMOTE_EXECUTOR_REQUIRE_SIGNATURE`        | No       | Require request signatures if set to `'true'` |

## Troubleshooting

### "Missing KV namespace ID" or "Missing R2 bucket"

**Problem:** Validation fails because `wrangler.toml` has placeholder values.

**Solution:**

1. Create KV namespace and R2 bucket in Cloudflare (see Prerequisites)
2. Update `wrangler.toml` with real IDs and bucket names
3. Rerun `npm run deploy:staging`

### "Unauthorized (401)" in Smoke Tests

**Problem:** Requests fail with 401 even with correct token.

**Solution:**

1. Check token matches what you set: `wrangler secret list --env staging`
2. Verify token is not expired or rotated
3. Check `Authorization: Bearer <token>` header in request

### "Executor unavailable (502/504)" in Smoke Tests

**Problem:** Executor connectivity fails.

**Solution:**

1. Verify `EXECUTOR_PROXY_URL` in `wrangler.toml` is correct and reachable
2. Check executor service is running: `bash scripts/deploy/start-local-executor.sh`
3. Verify `EXECUTOR_SHARED_SECRET` matches on both Worker and executor
4. Check executor logs for errors

### Build Fails: "dist/ not created"

**Problem:** `npm run build` completes but `dist/` is missing.

**Solution:**

1. Check for errors in build output
2. Verify skill files are valid: `npm run validate`
3. Run with verbose output: `node scripts/build/compile.mjs`
4. Check disk space and permissions

## What Remains Manual

The following **must** be done outside the repo:

1. ✓ Create Cloudflare KV and R2 resources (one-time)
2. ✓ Update both `worker/wrangler.toml` and `worker/executor/wrangler.toml` with resource IDs
3. ✓ Set secrets via `wrangler secret put` for both Workers (one-time per environment)
4. ✓ **Deploy executor Worker before main Worker** (ensures service binding resolves)
5. ✓ Set up custom domain (optional; Cloudflare provides default)
6. ✓ (Phase 0 compat only) Set up external executor service (not required for Phase 1)

Everything else — build, validation, and deployment — is automated.

## Quick Reference

### Phase 1 Staging Deployment (Two Workers)

```bash
# Build artifacts
npm run build

# 1. Deploy executor Worker first
cd worker/executor
npx wrangler deploy --env staging

# 2. Validate main Worker config
cd ../..
node scripts/deploy/validate-config.mjs worker staging

# 3. Deploy main Worker
cd worker && npx wrangler deploy --env staging

# 4. Smoke test
export AI_CONFIG_WORKER_URL="https://your-staging-worker.workers.dev/v1"
export AI_CONFIG_WORKER_TOKEN="your-staging-token"
npm run smoke:test
```

### Phase 1 Production Deployment (Two Workers)

```bash
# Build artifacts
npm run build

# 1. Deploy executor Worker first
cd worker/executor
npx wrangler deploy

# 2. Validate main Worker config
cd ../..
node scripts/deploy/validate-config.mjs worker production

# 3. Deploy main Worker
cd worker && npx wrangler deploy

# 4. Smoke test
export AI_CONFIG_WORKER_URL="https://your-production-worker.workers.dev/v1"
export AI_CONFIG_WORKER_TOKEN="your-production-token"
npm run smoke:test
```

## Durable Object Migrations

Cloudflare Workers Builds uses `wrangler versions upload`, which cannot apply
DO migrations or create bindings for unmigrated classes. This creates a
two-phase rollout requirement:

1. **Phase A (manual):** Apply the migration via `wrangler deploy`
2. **Phase B (automated):** Uncomment the binding in `wrangler.toml` and push

Until Phase A is complete, the DO binding must stay commented out in
`wrangler.toml` -- otherwise Workers Builds will reject the deploy because
the class is not yet registered as a Durable Object.

### Applying a DO Migration

```bash
# 1. Build artifacts first
npm run build

# 2. Apply migration (staging first, then production)
bash scripts/deploy/apply-do-migration.sh staging
bash scripts/deploy/apply-do-migration.sh production
```

The script temporarily injects both `[durable_objects]` binding and
`[[migrations]]` block into `wrangler.toml`, runs `wrangler deploy` to apply
the migration, then restores the original file.

### After Migration is Applied

1. Uncomment the `[durable_objects]` binding in `worker/wrangler.toml`
   (both production and staging sections)
2. Set `TASK_DO_DUAL_WRITE = "true"` in the target environment
3. Commit and push -- Workers Builds handles it from here

### When is a migration needed?

A migration is required when `wrangler.toml` adds a new DO class, renames an
existing class, or deletes a class. Ordinary code changes to an existing DO
class do **not** require a migration -- Workers Builds handles those normally.

### Current migrations

| Tag | Change                         | Applied |
| --- | ------------------------------ | ------- |
| v1  | `new_classes = ["TaskObject"]` | Pending |

### Local Development (Phase 1)

```bash
# Terminal 1: Executor Worker
cd worker/executor && npx wrangler dev

# Terminal 2: Main Worker
cd worker && npx wrangler dev

# Terminal 3: Smoke tests
export AI_CONFIG_WORKER_URL="http://localhost:8787/v1"
export AI_CONFIG_WORKER_TOKEN="local-test-token"
npm run smoke:test
```
