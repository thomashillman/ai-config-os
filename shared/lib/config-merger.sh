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

merged=$(cat "$GLOBAL")
log "Loaded global config"

# Merge machine config if present
if [ -f "$MACHINE" ]; then
  log "Merging machine config: $MACHINE"
  # Field-level merge for mcps; last-writer-wins for everything else
  merged=$(echo "$merged" | yq eval-all '. as $base | load("'"$MACHINE"'") as $override |
    $base * $override |
    .mcps = ($base.mcps // {} | . * ($override.mcps // {}))
  ' -)
fi

# Merge project config if present
if [ -f "$PROJECT" ]; then
  log "Merging project config: $PROJECT"
  merged=$(echo "$merged" | yq eval-all '. as $base | load("'"$PROJECT"'") as $override |
    $base * $override |
    .mcps = ($base.mcps // {} | . * ($override.mcps // {}))
  ' -)
fi

echo "$merged"
