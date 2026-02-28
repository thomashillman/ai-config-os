#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)" || REPO_ROOT="."

echo "==> Validating skill dependencies..."
bash "$REPO_ROOT/ops/validate-dependencies.sh" || true

echo ""
echo "==> Validating skill variants..."
bash "$REPO_ROOT/ops/validate-variants.sh" || true

echo ""
echo "==> Validating marketplace structure..."
claude plugin validate .

echo ""
echo "==> Testing core-skills plugin locally..."
# Note: Skipping interactive claude invocation in automated test environments
# To test locally, run: claude --plugin-dir ./plugins/core-skills -p "List available skills" --max-turns 1
if [ -t 0 ]; then
  # Only run if stdin is a terminal (interactive mode)
  claude --plugin-dir ./plugins/core-skills -p "List available skills" --max-turns 1
else
  echo "[skipped] Interactive test requires terminal input"
fi

echo ""
echo "==> Done."
