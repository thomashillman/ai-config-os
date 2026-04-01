#!/usr/bin/env bash
# Syntax-check dashboard orchestrator scripts (no network, no servers).
# Currently only ops/dashboard-start.sh; add more bash -n targets if new ops/dashboard-*.sh scripts appear.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
bash -n ops/dashboard-start.sh
echo "  dashboard-ops: bash -n ops/dashboard-start.sh OK"
