#!/bin/bash
set -euo pipefail

# Only run in remote Claude Code environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# --- Install dependencies ---
for dep in jq yq; do
  if ! command -v $dep &>/dev/null; then
    echo "Installing $dep..."
    if command -v apt-get &>/dev/null; then
      sudo apt-get update -qq && sudo apt-get install -y -qq $dep 2>/dev/null || \
        echo "WARNING: Could not install $dep via apt-get" >&2
    elif command -v apk &>/dev/null; then
      apk add --no-cache $dep 2>/dev/null || echo "WARNING: Could not install $dep via apk" >&2
    elif command -v brew &>/dev/null; then
      brew install $dep 2>/dev/null || echo "WARNING: Could not install $dep via brew" >&2
    else
      echo "WARNING: Cannot install $dep — no supported package manager found" >&2
    fi
  fi
done

# --- Validate skill structure ---
echo "Running skill validation suite..."
./ops/validate-all.sh
echo "Validation complete."
echo ""

# --- Runtime sync ---
echo "Running runtime sync..."
if bash ./runtime/sync.sh --dry-run 2>/dev/null; then
  echo "Runtime config valid."
else
  echo "WARNING: Runtime sync dry-run produced warnings. Run 'bash runtime/sync.sh' to inspect." >&2
fi
echo ""

# --- Manifest status ---
bash ./runtime/manifest.sh status 2>/dev/null || true
