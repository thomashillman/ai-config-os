#!/usr/bin/env bash
# Sync engine: reconcile desired state config with live tool configuration
# Usage: bash runtime/sync.sh [--dry-run] [--verbose]
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
DRY_RUN=false
VERBOSE=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --verbose) VERBOSE=true ;;
  esac
done

log() { [ "$VERBOSE" = true ] && echo "[sync] $1" || true; }
info() { echo "[sync] $1"; }

info "Starting sync (dry-run: $DRY_RUN)"

# Step 1: Produce immutable merged config snapshot
SNAPSHOT_FILE=$(mktemp /tmp/ai-config-os-snapshot.XXXXXX.yaml)
trap "rm -f $SNAPSHOT_FILE" EXIT

log "Producing config snapshot..."
if ! bash "$REPO_ROOT/shared/lib/config-merger.sh" > "$SNAPSHOT_FILE"; then
  echo "[error] Config merge failed. Check runtime/config/ files." >&2
  exit 1
fi
log "Snapshot written to $SNAPSHOT_FILE"

# Step 2: Initialise manifest if needed
bash "$REPO_ROOT/runtime/manifest.sh" init 2>/dev/null || true

# Step 3: Sync subsystem phase (manifest/docs/bundles cache)
info "Running sync subsystem phase..."
SYNC_SUBSYSTEM_ARGS=(run "$SNAPSHOT_FILE")
[ "$VERBOSE" = true ] && SYNC_SUBSYSTEM_ARGS+=(--verbose)
if bash "$REPO_ROOT/runtime/sync-subsystem.sh" "${SYNC_SUBSYSTEM_ARGS[@]}"; then
  bash "$REPO_ROOT/runtime/manifest.sh" update "sync-subsystem" "synced"
else
  echo "[warn] Sync subsystem phase failed; continuing with config sync" >&2
  bash "$REPO_ROOT/runtime/manifest.sh" update "sync-subsystem" "error"
fi

# Step 4: Show diff
info "Config diff:"
bash "$REPO_ROOT/runtime/manifest.sh" diff "$SNAPSHOT_FILE"

if [ "$DRY_RUN" = true ]; then
  info "Dry run complete. No changes applied."
  exit 0
fi

# Step 5: Apply MCP sync
info "Syncing MCP servers..."
if bash "$REPO_ROOT/runtime/adapters/mcp-adapter.sh" sync "$SNAPSHOT_FILE"; then
  bash "$REPO_ROOT/runtime/manifest.sh" update "mcp-config" "synced"
else
  echo "[error] MCP sync failed" >&2
  bash "$REPO_ROOT/runtime/manifest.sh" update "mcp-config" "error"
  exit 1
fi

# Step 6: CLI adapter check
info "Checking CLI tool presence..."
bash "$REPO_ROOT/runtime/adapters/cli-adapter.sh" sync "$SNAPSHOT_FILE"

# Step 7: Update manifest last_synced
yq -i ".last_synced = \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"" "$REPO_ROOT/runtime/manifest.yaml" 2>/dev/null || true

info "Sync complete."
bash "$REPO_ROOT/runtime/manifest.sh" status
