#!/bin/bash
set -euo pipefail
# Signal async mode — hook runs in background while session starts
echo '{"async": true, "asyncTimeout": 300000}'
# Only run in remote Claude Code environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi
# Validate plugin structure on session start
cd "$CLAUDE_PROJECT_DIR"
echo "Validating plugin structure..."
claude plugin validate .
echo "Plugin structure OK."
