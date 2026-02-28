#!/bin/bash
set -euo pipefail

# PostToolUse hook: Living docs reminder
# Reminds user to run ops/check-docs.sh when skills or ops scripts are modified

INPUT=$(cat)

# Extract file_path from JSON input
FILE_PATH=$(echo "$INPUT" | grep -o '"file_path":"[^"]*"' | sed 's/"file_path":"//;s/"//' | head -1)

# Remind about living docs after writes to shared/skills/ or ops/
if [[ "${FILE_PATH:-}" == */shared/skills/* ]] || [[ "${FILE_PATH:-}" == */ops/* ]]; then
  echo ""
  echo "📝 Living docs reminder: Run 'ops/check-docs.sh' to verify manifest.md, README.md, CLAUDE.md are in sync."
fi

exit 0
