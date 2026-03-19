#!/usr/bin/env bash
# Merge three-tier config: global < machine < project
# Outputs merged YAML to stdout
# Usage: bash shared/lib/config-merger.sh [--debug]
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
CONFIG_DIR="$REPO_ROOT/runtime/config"
HOSTNAME="$(hostname 2>/dev/null || echo 'unknown')"

DEBUG="${1:-}"

log() { [ "$DEBUG" = "--debug" ] && echo "[config-merger] $1" >&2 || true; }

# Validate yq is available
if ! command -v yq &>/dev/null; then
  echo "[error] yq is required. Install: brew install yq (macOS) or snap install yq (Linux)" >&2
  exit 1
fi

GLOBAL="$CONFIG_DIR/global.yaml"
MACHINE="$CONFIG_DIR/machines/${HOSTNAME}.yaml"
PROJECT="$CONFIG_DIR/project.yaml"

# Start with global as base
if [ ! -f "$GLOBAL" ]; then
  echo "[error] global.yaml not found at $GLOBAL" >&2
  exit 1
fi

# Collect files to merge (order matters: global < machine < project)
files_to_merge=("$GLOBAL")
log "Loaded global config"

if [ -f "$MACHINE" ]; then
  log "Merging machine config: $MACHINE"
  files_to_merge+=("$MACHINE")
fi

if [ -f "$PROJECT" ]; then
  log "Merging project config: $PROJECT"
  files_to_merge+=("$PROJECT")
fi

# Single yq invocation: merge all files with field-level merge for mcps
if [ ${#files_to_merge[@]} -eq 1 ]; then
  cat "$GLOBAL"
else
  yq eval-all '
    def merge_pair(a; b): a * b | .mcps = ((a.mcps // {}) * (b.mcps // {}));
    reduce .[] as $item ({}; merge_pair(.; $item))
  ' "${files_to_merge[@]}"
fi
