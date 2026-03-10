#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "$REPO_ROOT"

echo "==> Validating skill dependencies..."
bash "$REPO_ROOT/ops/validate-dependencies.sh"

echo ""
echo "==> Validating skill variants..."
bash "$REPO_ROOT/ops/validate-variants.sh"

echo ""
echo "==> Validating marketplace structure..."
claude plugin validate "$REPO_ROOT"

echo ""
echo "==> Testing core-skills plugin locally..."
# Note: Skipping interactive claude invocation in automated test environments
# To test locally, run: claude --plugin-dir ./plugins/core-skills -p "List available skills" --max-turns 1
if [ -t 0 ]; then
  # Only run if stdin is a terminal (interactive mode)
  claude --plugin-dir "$REPO_ROOT/plugins/core-skills" -p "List available skills" --max-turns 1
else
  echo "[skipped] Interactive test requires terminal input"
fi

echo ""
echo "==> Done."
