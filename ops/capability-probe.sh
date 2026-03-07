#!/usr/bin/env bash
set -euo pipefail

# capability-probe.sh — Runtime capability probe
#
# Tests each capability with a lightweight, non-destructive check.
# Outputs structured JSON to stdout matching schemas/probe-result.schema.json.
# Results are also cached to ~/.ai-config-os/probe-report.json.
#
# Usage: bash ops/capability-probe.sh
#        bash ops/capability-probe.sh --quiet   (suppress progress to stderr)
#
# Design constraints:
# - Must complete in <30 seconds total
# - All tests are non-destructive and idempotent
# - No network test hits user production services

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)")"
CACHE_DIR="${HOME}/.ai-config-os"
CACHE_FILE="${CACHE_DIR}/probe-report.json"
QUIET="${1:-}"

PROBE_VERSION="1.0.0"
HOSTNAME="$(hostname 2>/dev/null || echo 'unknown')"
PROBED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -Iseconds 2>/dev/null || echo '1970-01-01T00:00:00Z')"

log() {
  [ "$QUIET" = "--quiet" ] && return
  echo "$@" >&2
}

# Detect platform hint
detect_platform() {
  if [ -n "${CLAUDE_CODE_REMOTE:-}" ]; then
    echo "claude-code-remote"
  elif [ -n "${CLAUDE_CODE:-}" ] || command -v claude >/dev/null 2>&1; then
    echo "claude-code"
  elif [ -n "${CODEX_CLI:-}" ]; then
    echo "codex"
  elif [ -n "${CURSOR_SESSION:-}" ]; then
    echo "cursor"
  else
    echo "unknown"
  fi
}

# Detect surface hint
detect_surface() {
  local platform="$1"
  case "$platform" in
    claude-code*) echo "desktop-cli" ;;
    codex) echo "cloud-sandbox" ;;
    cursor) echo "desktop-ide" ;;
    *) echo "unknown" ;;
  esac
}

# Probe a single capability
# Usage: probe_capability <name> <timeout_secs> <command...>
# Returns: JSON object
probe_capability() {
  local name="$1"
  local timeout="$2"
  shift 2

  local start_ms
  start_ms=$(date +%s%N 2>/dev/null || echo "0")

  local output
  local exit_code
  if command -v timeout >/dev/null 2>&1; then
    output=$(timeout "$timeout" "$@" 2>&1) && exit_code=0 || exit_code=$?
  else
    output=$("$@" 2>&1) && exit_code=0 || exit_code=$?
  fi

  local end_ms
  end_ms=$(date +%s%N 2>/dev/null || echo "0")

  local latency_ms=0
  if [ "$start_ms" != "0" ] && [ "$end_ms" != "0" ]; then
    latency_ms=$(( (end_ms - start_ms) / 1000000 ))
  fi

  if [ $exit_code -eq 0 ]; then
    log "  ✓ $name (${latency_ms}ms)"
    echo "{\"status\":\"supported\",\"latency_ms\":$latency_ms}"
  elif [ $exit_code -eq 124 ]; then
    log "  ✗ $name (timeout)"
    echo "{\"status\":\"unsupported\",\"latency_ms\":$latency_ms,\"error\":\"timeout after ${timeout}s\"}"
  else
    local err_msg
    err_msg=$(echo "$output" | head -1 | tr '"' "'" | cut -c1-100)
    log "  ✗ $name (exit $exit_code)"
    echo "{\"status\":\"unsupported\",\"latency_ms\":$latency_ms,\"error\":\"$err_msg\"}"
  fi
}

START_TIME=$(date +%s%N 2>/dev/null || echo "0")
PLATFORM=$(detect_platform)
SURFACE=$(detect_surface "$PLATFORM")

log "Running capability probe..."
log "  platform: $PLATFORM"
log "  surface:  $SURFACE"
log ""

# Run all probes
fs_read=$(probe_capability "fs.read" 2 test -r "$REPO_ROOT/CLAUDE.md")
fs_write=$(probe_capability "fs.write" 2 bash -c "tmpf=\$(mktemp) && echo probe > \"\$tmpf\" && rm -f \"\$tmpf\"")
shell_exec=$(probe_capability "shell.exec" 2 echo "probe-test")
shell_long=$(probe_capability "shell.long-running" 3 sleep 0.1)
git_read=$(probe_capability "git.read" 3 git -C "$REPO_ROOT" status --short)
# git.write: create and immediately delete a lightweight tag (actual write, safe, idempotent)
git_write=$(probe_capability "git.write" 3 bash -c "cd \"$REPO_ROOT\" && git tag probe-test-$$ 2>/dev/null && git tag -d probe-test-$$ >/dev/null 2>&1")
network_http=$(probe_capability "network.http" 5 bash -c "curl -sf --max-time 4 -o /dev/null https://httpbin.org/get 2>/dev/null || wget -q --timeout=4 -O /dev/null https://httpbin.org/get 2>/dev/null")
env_read=$(probe_capability "env.read" 1 bash -c "test -n \"\$HOME\"")

# MCP probe: try claude mcp list (real invocation test), fall back to config presence check
# Note: config presence does not prove the platform can invoke MCP tools at runtime
mcp_result=$(probe_capability "mcp.client" 2 bash -c "claude mcp list >/dev/null 2>&1 || (test -f \"$REPO_ROOT/.claude/settings.json\" && grep -q mcpServers \"$REPO_ROOT/.claude/settings.json\" 2>/dev/null) || (test -f \"$HOME/.claude/settings.json\" && grep -q mcpServers \"$HOME/.claude/settings.json\" 2>/dev/null)")

END_TIME=$(date +%s%N 2>/dev/null || echo "0")
DURATION_MS=0
if [ "$START_TIME" != "0" ] && [ "$END_TIME" != "0" ]; then
  DURATION_MS=$(( (END_TIME - START_TIME) / 1000000 ))
fi

log ""
log "Probe complete in ${DURATION_MS}ms"

# Build JSON output
JSON=$(cat <<JSONEOF
{
  "probe_version": "$PROBE_VERSION",
  "probed_at": "$PROBED_AT",
  "platform_hint": "$PLATFORM",
  "surface_hint": "$SURFACE",
  "hostname": "$HOSTNAME",
  "results": {
    "fs.read": $fs_read,
    "fs.write": $fs_write,
    "shell.exec": $shell_exec,
    "shell.long-running": $shell_long,
    "git.read": $git_read,
    "git.write": $git_write,
    "network.http": $network_http,
    "mcp.client": $mcp_result,
    "env.read": $env_read
  },
  "duration_ms": $DURATION_MS
}
JSONEOF
)

# Cache result
mkdir -p "$CACHE_DIR"
echo "$JSON" > "$CACHE_FILE"
log "Cached to $CACHE_FILE"

# Output to stdout
echo "$JSON"
