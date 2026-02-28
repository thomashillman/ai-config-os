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
claude --plugin-dir ./plugins/core-skills -p "List available skills" --max-turns 1

echo ""
echo "==> Done."
