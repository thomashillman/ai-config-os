#!/usr/bin/env bash
set -euo pipefail

# Validate a skill's frontmatter by name
# Usage: lint-skill.sh <skill-name>
# Exit 0: OK, Exit 1: errors found
#
# Thin wrapper around the Node-based linter at scripts/lint/skill.mjs.

SKILL_NAME="${1:?Usage: lint-skill.sh <skill-name>}"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)")"
SKILL_FILE="$REPO_ROOT/shared/skills/$SKILL_NAME/SKILL.md"

if [ ! -f "$SKILL_FILE" ]; then
  echo "ERROR: $SKILL_FILE not found" >&2
  exit 1
fi

exec node "$REPO_ROOT/scripts/lint/skill.mjs" "$SKILL_FILE"
