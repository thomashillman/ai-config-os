#!/usr/bin/env bash
# Start the local dashboard stack.
#
# Usage:
#   bash ops/dashboard-start.sh
#
# Requires: bash, curl, git, lsof — curl and lsof are checked at startup; install on minimal images (e.g. apt install curl lsof).
#
# What it does:
#   1. Frees ports 4242 and 5173 (IPv4 and IPv6 listeners).
#   2. Loads VITE_WORKER_URL and VITE_AUTH_TOKEN from dashboard/.env.local.
#   3. Starts the MCP + dashboard API server (port 4242).
#   4. Publishes dashboard state snapshots to Worker KV if yq is installed (optional).
#   5. Starts Vite on 127.0.0.1:5173 and waits until HTTP responds before reporting success.
#   6. Opens the browser automatically.
#   7. On Ctrl+C (or script exit) stops child processes and frees ports.
#
# Port safety: ANY process listening on 4242 or 5173 is stopped — not only this stack.
# Do not share those ports with unrelated apps while using this script.

set -euo pipefail
REPO_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if ! command -v curl >/dev/null 2>&1; then
  echo "[dashboard] ERROR: curl is required for readiness checks (install: apt install curl, apk add curl, or use a full macOS/Linux image)." >&2
  exit 1
fi

if ! command -v lsof >/dev/null 2>&1; then
  echo "[dashboard] ERROR: lsof is required for port cleanup (install: apt install lsof, apk add lsof; macOS usually includes it)." >&2
  exit 1
fi

ENV_FILE="dashboard/.env.local"
MCP_PORT=4242
VITE_PORT=5173
MCP_PID=""
VITE_PID=""

# ── Helpers ────────────────────────────────────────────────────────────────────

# Strip CRLF and optional matching outer quotes from a dotenv value (bash 3.2+).
normalize_env_value() {
  local v="$1"
  local len first last
  v="${v%%$'\r'}"
  len=${#v}
  if [ "$len" -ge 2 ]; then
    first="${v:0:1}"
    last="${v:$(($len - 1)):1}"
    if { [ "$first" = '"' ] && [ "$last" = '"' ]; } || { [ "$first" = "'" ] && [ "$last" = "'" ]; }; then
      v="${v:1:$(($len - 2))}"
    fi
  fi
  printf '%s' "$v"
}

# Kill any process listening on TCP port (IPv4 or IPv6). Stops ALL listeners on that port.
free_port() {
  local port="$1"
  local pids
  pids=$(lsof -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "[dashboard] Freeing port $port (pid(s): $pids)..."
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 0.4
    pids=$(lsof -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
    if [ -n "$pids" ]; then
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
    fi
  fi
}

open_browser() {
  local url="$1"
  sleep 1.5
  if command -v open &>/dev/null; then
    open "$url"
  elif command -v xdg-open &>/dev/null; then
    xdg-open "$url"
  fi
}

cleanup() {
  trap - EXIT INT TERM
  local ec=$?
  echo ""
  echo "[dashboard] Shutting down..."
  if [ -n "${VITE_PID:-}" ]; then
    # Pipeline subshell may leave a Node child; free_port below clears the listener.
    kill "$VITE_PID" 2>/dev/null || true
  fi
  if [ -n "${MCP_PID:-}" ]; then
    kill "$MCP_PID" 2>/dev/null || true
  fi
  free_port "$MCP_PORT"
  free_port "$VITE_PORT"
  echo "[dashboard] Done."
  exit "$ec"
}
trap cleanup EXIT INT TERM

# ── Load env ───────────────────────────────────────────────────────────────────

VITE_WORKER_URL=""
VITE_AUTH_TOKEN=""

if [ -f "$ENV_FILE" ]; then
  # Values may contain '='; take first line match per key
  line=$(grep -E '^[[:space:]]*VITE_WORKER_URL=' "$ENV_FILE" 2>/dev/null | head -1) || true
  if [ -n "$line" ]; then
    VITE_WORKER_URL="$(normalize_env_value "${line#*=}")"
  fi
  line=$(grep -E '^[[:space:]]*VITE_AUTH_TOKEN=' "$ENV_FILE" 2>/dev/null | head -1) || true
  if [ -n "$line" ]; then
    VITE_AUTH_TOKEN="$(normalize_env_value "${line#*=}")"
  fi
fi

if [ -z "$VITE_WORKER_URL" ] || [ -z "$VITE_AUTH_TOKEN" ]; then
  echo "[dashboard] WARNING: VITE_WORKER_URL or VITE_AUTH_TOKEN missing in $ENV_FILE"
  echo "[dashboard] Worker-backed tabs will not authenticate. Add both, then re-run."
fi

# ── Free ports ─────────────────────────────────────────────────────────────────

free_port "$MCP_PORT"
free_port "$VITE_PORT"

# ── Start MCP + dashboard API ────────────────────────────────────────────────

echo "[dashboard] Starting MCP server on port $MCP_PORT..."
AI_CONFIG_OS_WORKER_URL="$VITE_WORKER_URL" \
  AI_CONFIG_OS_WORKER_TOKEN="$VITE_AUTH_TOKEN" \
  bash runtime/mcp/start.sh &
MCP_PID=$!

# Wait for dashboard API (up to ~15 s)
MCP_READY=0
for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:$MCP_PORT/api/manifest" >/dev/null 2>&1; then
    echo "[dashboard] MCP API ready."
    MCP_READY=1
    break
  fi
  sleep 0.5
done
if [ "$MCP_READY" -ne 1 ]; then
  echo "[dashboard] ERROR: MCP API did not respond on port $MCP_PORT."
  exit 1
fi

# ── Publish dashboard state (requires yq for local snapshot builders) ─────────

if [ -n "$VITE_WORKER_URL" ] && [ -n "$VITE_AUTH_TOKEN" ]; then
  if command -v yq >/dev/null 2>&1; then
    echo "[dashboard] Publishing dashboard state snapshots..."
    set +e
    set -o pipefail
    AI_CONFIG_OS_WORKER_URL="$VITE_WORKER_URL" \
      AI_CONFIG_OS_WORKER_TOKEN="$VITE_AUTH_TOKEN" \
      node runtime/publish-dashboard-state.mjs 2>&1 | sed 's/^/[publish] /'
    pub="${PIPESTATUS[0]}"
    set +o pipefail
    set -e
    if [ "$pub" -ne 0 ]; then
      echo "[dashboard] WARNING: snapshot publish had failures — some tabs may show stale data."
    fi
  else
    echo "[dashboard] Skipping snapshot publish: yq not in PATH."
    echo "[dashboard] Install: brew install yq   (then re-run this script or: node runtime/publish-dashboard-state.mjs)"
    echo "[dashboard] Skill Library and other snapshot tabs may show stale until publish succeeds."
  fi
fi

# ── Start Vite (bind IPv4 so health checks and free_port stay consistent) ───

echo "[dashboard] Starting Vite dev server on http://127.0.0.1:$VITE_PORT ..."
(cd dashboard && npm run dev -- --port "$VITE_PORT" --strictPort --host 127.0.0.1 2>&1 | sed 's/^/[vite] /') &
VITE_PID=$!

VITE_READY=0
for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:$VITE_PORT/" >/dev/null 2>&1; then
    VITE_READY=1
    break
  fi
  sleep 0.5
done

if [ "$VITE_READY" -ne 1 ]; then
  echo "[dashboard] ERROR: Vite did not respond on http://127.0.0.1:$VITE_PORT within ~20s."
  echo "[dashboard] Is another process using that port? Run: lsof -nP -iTCP:$VITE_PORT -sTCP:LISTEN"
  exit 1
fi

DASHBOARD_URL="http://localhost:$VITE_PORT"

echo ""
echo "[dashboard] Stack is ready."
echo "[dashboard] URL:  $DASHBOARD_URL"
echo "[dashboard] Press Ctrl+C in this terminal to stop MCP, Vite, and free ports."
echo ""

open_browser "$DASHBOARD_URL"

# ── Wait (keep script alive until user hits Ctrl+C) ──────────────────────────

wait
