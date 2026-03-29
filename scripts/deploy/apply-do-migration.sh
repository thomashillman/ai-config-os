#!/usr/bin/env bash
# One-time Durable Object migration for the main Worker.
#
# Cloudflare Workers Builds uses `wrangler versions upload`, which cannot
# apply DO migrations. This script temporarily injects the [[migrations]]
# block, runs `wrangler deploy` to apply it, then removes the block.
#
# Usage:
#   bash scripts/deploy/apply-do-migration.sh [staging|production]
#
# Prerequisites:
#   - wrangler authenticated (`wrangler login` or CLOUDFLARE_API_TOKEN set)
#   - Build artifacts up to date (`npm run build`)

set -euo pipefail

ENV="${1:-production}"
WORKER_DIR="$(cd "$(dirname "$0")/../../worker" && pwd)"
TOML="$WORKER_DIR/wrangler.toml"
BACKUP="$TOML.pre-migration-backup"

if [[ "$ENV" != "production" && "$ENV" != "staging" ]]; then
  echo "Usage: $0 [staging|production]"
  exit 1
fi

echo "==> Applying Durable Object migration (env: $ENV)"
echo "    Worker dir: $WORKER_DIR"

# Back up the original wrangler.toml
cp "$TOML" "$BACKUP"

# Inject the migration block into wrangler.toml (before the first [[kv_namespaces]])
if [[ "$ENV" == "production" ]]; then
  # Inject into the default (production) environment
  sed -i.sed-bak '/^\[\[kv_namespaces\]\]$/i\
\[\[migrations\]\]\
tag = "v1"\
new_classes = ["TaskObject"]\
' "$TOML"
else
  # Inject into the staging environment (before [[env.staging.kv_namespaces]])
  sed -i.sed-bak '/^\[\[env\.staging\.kv_namespaces\]\]$/i\
\[\[env.staging.migrations\]\]\
tag = "v1"\
new_classes = ["TaskObject"]\
' "$TOML"
fi
rm -f "$TOML.sed-bak"

echo "==> Injected [[migrations]] block into wrangler.toml"

# Deploy with migration
cd "$WORKER_DIR"
if [[ "$ENV" == "production" ]]; then
  echo "==> Running: npx wrangler deploy"
  npx wrangler deploy
else
  echo "==> Running: npx wrangler deploy --env staging"
  npx wrangler deploy --env staging
fi

DEPLOY_EXIT=$?

# Restore original wrangler.toml (without migrations)
cp "$BACKUP" "$TOML"
rm -f "$BACKUP"

echo "==> Restored wrangler.toml (migrations block removed)"

if [[ $DEPLOY_EXIT -eq 0 ]]; then
  echo "==> Migration applied successfully (env: $ENV)"
  echo ""
  echo "    The TaskObject Durable Object class is now registered."
  echo "    Subsequent Workers Builds deploys will work normally."
else
  echo "==> Migration FAILED (exit $DEPLOY_EXIT)"
  exit $DEPLOY_EXIT
fi
