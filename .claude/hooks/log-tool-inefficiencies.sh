#!/bin/bash
# PostToolUse hook: detect tool errors and repeated-call loops
# Appends events to ~/.claude/skill-analytics/inefficiencies.jsonl
#
# Detects two patterns:
#   tool_error   — tool_response.is_error was true
#   loop_suspected — same tool called more than threshold times in a session

set -euo pipefail

# jq required — exit silently to avoid interfering with normal tool flow
if ! command -v jq &>/dev/null; then
  exit 0
fi

INPUT=$(cat)

ANALYTICS_DIR="${HOME}/.claude/skill-analytics"
mkdir -p "$ANALYTICS_DIR"

LOG_FILE="${ANALYTICS_DIR}/inefficiencies.jsonl"
TIMESTAMP=$(date -u +'%Y-%m-%dT%H:%M:%SZ')

# Derive a stable session key. CLAUDE_SESSION_ID is provided by Claude Code.
# Fall back to a hash of PID + start time so each new shell process is distinct.
if [[ -n "${CLAUDE_SESSION_ID:-}" ]]; then
  SESSION_ID="$CLAUDE_SESSION_ID"
else
  SESSION_ID="pid-$$-$(date -u +'%Y%m%dT%H')"
fi

TOOL=$(echo "$INPUT" | jq -r '.tool_name // "unknown"' 2>/dev/null || echo "unknown")

# ── 1. Error detection ──────────────────────────────────────────────────────
IS_ERROR=$(echo "$INPUT" | jq -r '.tool_response.is_error // false' 2>/dev/null || echo "false")
if [[ "$IS_ERROR" == "true" ]]; then
  SNIPPET=$(echo "$INPUT" | jq -r '
    (.tool_response.content // []) |
    if type == "array" then .[0].text // "" else . end |
    .[0:300]
  ' 2>/dev/null || echo "")
  printf '{"timestamp":"%s","session_id":"%s","type":"tool_error","tool":"%s","snippet":%s}\n' \
    "$TIMESTAMP" "$SESSION_ID" "$TOOL" "$(printf '%s' "$SNIPPET" | jq -Rs .)" \
    >> "$LOG_FILE"
fi

# ── 2. Loop detection ───────────────────────────────────────────────────────
# Per-session call counters stored in /tmp so they reset each time the shell exits.
COUNTER_DIR="/tmp/claude-sessions"
mkdir -p "$COUNTER_DIR"
COUNTER_FILE="${COUNTER_DIR}/${SESSION_ID}.json"

# Thresholds: chosen to exceed realistic single-task usage without false positives
declare -A THRESHOLDS=(
  ["Bash"]=6
  ["Edit"]=10
  ["Write"]=10
  ["Read"]=15
  ["Grep"]=12
  ["Glob"]=12
)
DEFAULT_THRESHOLD=8

# Read current count for this tool
if [[ -f "$COUNTER_FILE" ]]; then
  CURRENT=$(jq -r --arg tool "$TOOL" '.[$tool] // 0' "$COUNTER_FILE" 2>/dev/null || echo "0")
else
  CURRENT=0
fi

NEW_COUNT=$((CURRENT + 1))

# Update counter file atomically via temp file
TEMP_FILE=$(mktemp "${COUNTER_DIR}/tmp.XXXXXX")
if [[ -f "$COUNTER_FILE" ]]; then
  jq --arg tool "$TOOL" --argjson count "$NEW_COUNT" '.[$tool] = $count' "$COUNTER_FILE" > "$TEMP_FILE" 2>/dev/null \
    || echo "{\"$TOOL\": $NEW_COUNT}" > "$TEMP_FILE"
else
  echo "{\"$TOOL\": $NEW_COUNT}" > "$TEMP_FILE"
fi
mv "$TEMP_FILE" "$COUNTER_FILE"

# Determine threshold for this tool
THRESHOLD="${THRESHOLDS[$TOOL]:-$DEFAULT_THRESHOLD}"

# Emit a single warning exactly at threshold (not on every subsequent call)
if [[ "$NEW_COUNT" -eq "$THRESHOLD" ]]; then
  printf '{"timestamp":"%s","session_id":"%s","type":"loop_suspected","tool":"%s","call_count":%d}\n' \
    "$TIMESTAMP" "$SESSION_ID" "$TOOL" "$NEW_COUNT" \
    >> "$LOG_FILE"
fi

exit 0
