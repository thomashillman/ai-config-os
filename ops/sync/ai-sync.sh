#!/usr/bin/env bash
set -euo pipefail
cd "${AI_CONFIG_HOME:-$HOME/ai-config}"

case "${1:-status}" in
  pull)
    git pull --rebase --autostash
    ;;
  push)
    git add -A shared/ plugins/ .claude-plugin/ adapters/ ops/ .github/
    git diff --cached --quiet && echo "Nothing to commit." && exit 0
    git commit -m "sync: $(date +%Y-%m-%d-%H%M)"
    git push
    ;;
  status)
    git fetch --quiet
    git status --short --branch
    ;;
  *)
    echo "Usage: ai-sync.sh [pull|push|status]"
    exit 1
    ;;
esac
