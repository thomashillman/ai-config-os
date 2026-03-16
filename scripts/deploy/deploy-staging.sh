#!/bin/bash

# Deploy Main Worker to staging environment
#
# PREREQUISITE: Executor Worker must be deployed first (Phase 1 two-Worker model).
# Deploy executor Worker from worker/executor/ directory:
#   cd worker/executor && npx wrangler deploy --env staging
#
# This script (main Worker):
# 1. Validates wrangler.toml configuration
# 2. Verifies required dist/ artifacts exist
# 3. Deploys to Cloudflare staging environment
#
# Prerequisites:
# 1. npm run build (or bash scripts/deploy/build-worker.sh)
# 2. Executor Worker deployed to staging (see above)
# 3. wrangler installed (npm install in worker/)
# 4. Cloudflare credentials configured (wrangler auth)
# 5. Secrets set via wrangler: wrangler secret put AUTH_TOKEN --env staging
#
# Usage:
#   bash scripts/deploy/deploy-staging.sh

set -eu

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORKER_DIR="$REPO_ROOT/worker"

echo "Deploying to Staging"
echo

# Step 1: Validate config for staging environment
echo "Step 1: Validating configuration for staging..."
node "$REPO_ROOT/scripts/deploy/validate-config.mjs" "$WORKER_DIR" staging

if [ $? -ne 0 ]; then
  echo "✗ Configuration validation failed"
  exit 1
fi

echo

# Step 2: Check dist/ artifacts
echo "Step 2: Checking build artifacts..."
required_files=(
  "$REPO_ROOT/dist/registry/index.json"
  "$REPO_ROOT/dist/clients/claude-code/.claude-plugin/plugin.json"
)

missing=0
for file in "${required_files[@]}"; do
  if [ ! -f "$file" ]; then
    echo "✗ Missing: $file"
    echo "  Run: npm run build"
    missing=$((missing + 1))
  fi
done

if [ $missing -gt 0 ]; then
  exit 1
fi

echo "✓ All required artifacts found"
echo

# Step 3: Deploy to staging
echo "Step 3: Deploying to staging environment..."
cd "$WORKER_DIR"

# Deploy using npx wrangler for better portability
npx wrangler deploy --env staging

if [ $? -eq 0 ]; then
  echo
  echo "✓ Deployment successful!"
  echo
  echo "Next steps:"
  echo "  1. Note your Worker URL (e.g., https://ai-config-os.your-domain.workers.dev)"
  echo "  2. Run smoke tests:"
  echo "     export AI_CONFIG_WORKER_URL=\"https://your-worker-url/v1\""
  echo "     export AI_CONFIG_WORKER_TOKEN=\"your-staging-token\""
  echo "     node scripts/deploy/smoke-tests.mjs"
  exit 0
else
  echo "✗ Deployment failed"
  exit 1
fi
