#!/usr/bin/env bash
set -euo pipefail

# Adds the ai-codex shell function to your profile.
# Usage: source adapters/codex/install.sh

FUNC='ai-codex() {
  (cd "${AI_CONFIG_HOME:-$HOME/ai-config}" && ops/sync/ai-sync.sh pull)
  echo "AI config synced. Shared manifest: ${AI_CONFIG_HOME:-$HOME/ai-config}/shared/manifest.md"
  codex "$@"
}'

SHELL_RC="${ZDOTDIR:-$HOME}/.zshrc"
if [ ! -f "$SHELL_RC" ]; then
  SHELL_RC="$HOME/.bashrc"
fi

if grep -q 'ai-codex()' "$SHELL_RC" 2>/dev/null; then
  echo "ai-codex function already exists in $SHELL_RC"
else
  echo "" >> "$SHELL_RC"
  echo "# AI Config OS — Codex wrapper" >> "$SHELL_RC"
  echo "$FUNC" >> "$SHELL_RC"
  echo "Added ai-codex function to $SHELL_RC"
  echo "Run 'source $SHELL_RC' or open a new terminal to use it."
fi
