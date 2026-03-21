#!/bin/bash
# PreToolUse hook: log skill invocations for usage analytics
# Fires only when matched to the "Skill" tool via settings.json matcher
# Output: JSONL appended to ~/.claude/skill-analytics/skill-usage.jsonl

set -euo pipefail

# jq required — exit silently if absent to avoid blocking skill invocations
if ! command -v jq &>/dev/null; then
  exit 0
fi

INPUT=$(cat)

ANALYTICS_DIR="${HOME}/.claude/skill-analytics"
mkdir -p "$ANALYTICS_DIR"

LOG_FILE="${ANALYTICS_DIR}/skill-usage.jsonl"

TIMESTAMP=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
SESSION_ID="${CLAUDE_SESSION_ID:-unknown}"
SKILL=$(echo "$INPUT" | jq -r '.tool_input.skill // .tool_input.name // "unknown"' 2>/dev/null || echo "unknown")
ARGS=$(echo "$INPUT" | jq -r '.tool_input.args // "" | @json' 2>/dev/null || echo '""')

printf '{"timestamp":"%s","session_id":"%s","skill":"%s","args":%s}\n' \
  "$TIMESTAMP" "$SESSION_ID" "$SKILL" "$ARGS" \
  >> "$LOG_FILE"

exit 0
