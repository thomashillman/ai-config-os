#!/usr/bin/env bash
# Watch mode: trigger sync on config file changes with debounce
# Usage: bash runtime/watch.sh [--dry-run]
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
WATCH_DIR="$REPO_ROOT/runtime/config"
DRY_RUN="${1:-}"
DEBOUNCE_SECONDS=2
LAST_SYNC=0
SYNC_INTERVAL_MINUTES="${SYNC_INTERVAL_MINUTES:-5}"

if ! command -v fswatch &>/dev/null && ! command -v inotifywait &>/dev/null; then
  echo "[error] fswatch (macOS) or inotifywait (Linux) required for watch mode" >&2
  echo "  macOS: brew install fswatch" >&2
  echo "  Linux: apt-get install inotify-tools" >&2
  exit 1
fi

run_sync_subsystem_tick() {
  local snapshot_file
  snapshot_file=$(mktemp /tmp/ai-config-os-watch-snapshot.XXXXXX.yaml)
  if bash "$REPO_ROOT/shared/lib/config-merger.sh" > "$snapshot_file"; then
    bash "$REPO_ROOT/runtime/sync-subsystem.sh" run "$snapshot_file" --verbose || echo "[watch] Sync subsystem tick failed"
  else
    echo "[watch] Config merge failed during periodic sync-subsystem tick"
  fi
  rm -f "$snapshot_file"
}

start_periodic_sync_subsystem() {
  (
    while true; do
      sleep "$((SYNC_INTERVAL_MINUTES * 60))"
      run_sync_subsystem_tick
    done
  ) &
  PERIODIC_PID=$!
  trap 'kill "$PERIODIC_PID" >/dev/null 2>&1 || true' EXIT
}

trigger_sync() {
  local now
  now=$(date +%s)
  local since=$((now - LAST_SYNC))
  if [ $since -lt $DEBOUNCE_SECONDS ]; then
    echo "[watch] Debouncing (${since}s since last sync, need ${DEBOUNCE_SECONDS}s)"
    return
  fi
  LAST_SYNC=$now
  echo "[watch] Config changed, triggering sync..."
  bash "$REPO_ROOT/runtime/sync.sh" $DRY_RUN --verbose || echo "[watch] Sync failed (see above)"
}

echo "[watch] Watching $WATCH_DIR for changes..."
echo "[watch] Sync-subsystem check interval: ${SYNC_INTERVAL_MINUTES} minute(s)"
echo "[watch] Press Ctrl+C to stop"

run_sync_subsystem_tick
start_periodic_sync_subsystem

if command -v fswatch &>/dev/null; then
  fswatch -r "$WATCH_DIR" | while read -r _; do trigger_sync; done
else
  inotifywait -m -r -e modify,create,delete "$WATCH_DIR" | while read -r _ _ _; do trigger_sync; done
fi
