#!/usr/bin/env bash
# One-time Durable Object migration for the main Worker.
#
# Cloudflare Workers Builds uses `wrangler versions upload`, which cannot
# apply DO migrations or create bindings for unmigrated classes. This script:
#   1. Injects the [durable_objects] binding AND [[migrations]] block
#   2. Runs `wrangler deploy` to apply the migration
#   3. Restores wrangler.toml to its original state
#
# After the migration is applied, uncomment the [durable_objects] binding
# in wrangler.toml and commit. Workers Builds will then handle subsequent
# deploys normally (the class is already migrated).
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

if [[ "$ENV" == "production" ]]; then
  # Inject binding + migration into the default (production) environment
  # Place them before the first [[kv_namespaces]] block
  sed -i.sed-bak '/^\[\[kv_namespaces\]\]$/i\
[durable_objects]\
bindings = [\
  { name = "TASK_OBJECT", class_name = "TaskObject" }\
]\
\
[[migrations]]\
tag = "v1"\
new_classes = ["TaskObject"]\
' "$TOML"
else
  # Inject binding + migration into the staging environment
  # Place them before [[env.staging.services]]
  sed -i.sed-bak '/^# PHASE 1: Service binding to staging executor Worker/i\
[env.staging.durable_objects]\
bindings = [\
  { name = "TASK_OBJECT", class_name = "TaskObject" }\
]\
\
[[env.staging.migrations]]\
tag = "v1"\
new_classes = ["TaskObject"]\
' "$TOML"
fi
rm -f "$TOML.sed-bak"

echo "==> Injected [durable_objects] binding and [[migrations]] block"

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

# Restore original wrangler.toml (without binding or migration)
cp "$BACKUP" "$TOML"
rm -f "$BACKUP"

echo "==> Restored wrangler.toml to pre-migration state"

if [[ $DEPLOY_EXIT -eq 0 ]]; then
  echo ""
  echo "==> Migration applied successfully (env: $ENV)"
  echo ""
  echo "    The TaskObject Durable Object class is now registered."
  echo ""
  echo "    Next steps:"
  echo "    1. Uncomment the [durable_objects] binding in worker/wrangler.toml"
  echo "    2. Set TASK_DO_DUAL_WRITE = \"true\" in the target environment"
  echo "    3. Commit and push -- Workers Builds will handle it from here"
else
  echo "==> Migration FAILED (exit $DEPLOY_EXIT)"
  exit $DEPLOY_EXIT
fi
