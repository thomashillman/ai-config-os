#!/bin/bash
# PostToolUse hook: track whether a skill's output was acted on
#
# Maintains a "pending skill" in /tmp so we can detect the pattern:
#   Skill invoked -> Edit or Write in same session -> outcome "output_used"
#   Skill invoked -> another Skill before any edit -> outcome "output_replaced"
#
# Output: JSONL appended to ~/.claude/skill-analytics/skill-outcomes.jsonl

set -euo pipefail

# jq required -- exit silently to avoid interfering with normal tool flow
if ! command -v jq &>/dev/null; then
  exit 0
fi

INPUT=$(cat)

ANALYTICS_DIR="${HOME}/.claude/skill-analytics"
mkdir -p "$ANALYTICS_DIR"

OUTCOMES_FILE="${ANALYTICS_DIR}/skill-outcomes.jsonl"
TIMESTAMP=$(date -u +'%Y-%m-%dT%H:%M:%SZ')

SESSION_ID="${CLAUDE_SESSION_ID:-pid-$$-$(date -u +'%Y%m%dT%H')}"

COUNTER_DIR="/tmp/claude-sessions"
mkdir -p "$COUNTER_DIR"
PENDING_FILE="${COUNTER_DIR}/${SESSION_ID}-skill-pending.json"

TOOL=$(echo "$INPUT" | jq -r '.tool_name // "unknown"' 2>/dev/null || echo "unknown")

# Helper: record an outcome and clear pending
record_outcome() {
  local skill="$1"
  local outcome="$2"
  printf '{"timestamp":"%s","session_id":"%s","skill":"%s","outcome":"%s"}\n' \
    "$TIMESTAMP" "$SESSION_ID" "$skill" "$outcome" \
    >> "$OUTCOMES_FILE"
  rm -f "$PENDING_FILE"
}

# 1. Another Skill call -- resolve any previous pending first
if [[ "$TOOL" == "Skill" ]]; then
  INVOKED_SKILL=$(echo "$INPUT" | jq -r '.tool_input.skill // .tool_input.name // "unknown"' 2>/dev/null || echo "unknown")

  # If a prior skill is pending without an edit, record it as replaced
  if [[ -f "$PENDING_FILE" ]]; then
    PREV_SKILL=$(jq -r '.skill_name // "unknown"' "$PENDING_FILE" 2>/dev/null || echo "unknown")
    record_outcome "$PREV_SKILL" "output_replaced"
  fi

  # Write new pending state
  TEMP_FILE=$(mktemp "${COUNTER_DIR}/tmp.XXXXXX")
  printf '{"skill_name":"%s","invoked_at":"%s"}\n' "$INVOKED_SKILL" "$TIMESTAMP" > "$TEMP_FILE"
  mv "$TEMP_FILE" "$PENDING_FILE"
  exit 0
fi

# 2. Edit or Write -- mark pending skill as output_used
if [[ "$TOOL" == "Edit" || "$TOOL" == "Write" ]]; then
  if [[ -f "$PENDING_FILE" ]]; then
    # Guard: only count if the skill was invoked within the last 10 minutes
    INVOKED_AT=$(jq -r '.invoked_at // ""' "$PENDING_FILE" 2>/dev/null || echo "")
    PENDING_SKILL=$(jq -r '.skill_name // "unknown"' "$PENDING_FILE" 2>/dev/null || echo "unknown")

    if [[ -n "$INVOKED_AT" ]]; then
      # Convert to epoch seconds for comparison (portable: date -d on Linux, date -j on macOS)
      NOW_EPOCH=$(date -u +'%s' 2>/dev/null || echo "0")
      if command -v gdate &>/dev/null; then
        INVOKED_EPOCH=$(gdate -d "$INVOKED_AT" +'%s' 2>/dev/null || echo "0")
      else
        INVOKED_EPOCH=$(date -d "$INVOKED_AT" +'%s' 2>/dev/null || echo "0")
      fi
      ELAPSED=$(( NOW_EPOCH - INVOKED_EPOCH ))

      if [[ "$ELAPSED" -le 600 ]]; then
        record_outcome "$PENDING_SKILL" "output_used"
      else
        # Stale pending (>10 min) -- discard silently
        rm -f "$PENDING_FILE"
      fi
    fi
  fi
  exit 0
fi

exit 0
