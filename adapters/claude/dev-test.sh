#!/usr/bin/env bash
set -euo pipefail
echo "==> Validating marketplace structure..."
claude plugin validate .
echo "==> Testing core-skills plugin locally..."
claude --plugin-dir ./plugins/core-skills -p "List available skills" --max-turns 1
echo "==> Done."
