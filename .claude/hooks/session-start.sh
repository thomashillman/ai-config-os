#!/bin/bash
set -euo pipefail

# Only run in remote Claude Code environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# --- Install dependencies ---
# jq is the only external dependency (used by ops/new-skill.sh for version bumping)
if ! command -v jq &>/dev/null; then
  echo "Installing jq..."
  if command -v apt-get &>/dev/null; then
    sudo apt-get update -qq && sudo apt-get install -y -qq jq
  elif command -v apk &>/dev/null; then
    apk add --no-cache jq
  else
    echo "WARNING: Cannot install jq — no supported package manager found" >&2
  fi
fi

# --- Validate skill structure ---
echo "Running skill validation suite..."
./ops/validate-all.sh
echo "Validation complete."
