#!/usr/bin/env bash
# filter-skills-by-capability.sh — Filter skills by runtime capabilities
#
# Delegates to the Node.js classifier (filter-skills-cli.mjs).
#
# Usage:
#   bash adapters/claude/filter-skills-by-capability.sh              # grouped human-readable
#   bash adapters/claude/filter-skills-by-capability.sh --json        # structured JSON
#   bash adapters/claude/filter-skills-by-capability.sh --summary     # one-line summary
#
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "${SCRIPT_DIR}/filter-skills-cli.mjs" "$@"
