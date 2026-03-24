#!/bin/bash
# PostToolUse hook: track whether a skill's output was acted on
#
# Records two outcomes per skill invocation:
#   output_used     -- skill output was followed by Edit/Write within 10 min
#   output_replaced -- another Skill was invoked before any edit
#
# Output: JSONL appended to ~/.claude/skill-analytics/skill-outcomes.jsonl

set -euo pipefail

# jq required -- exit silently to avoid interfering with normal tool flow
if ! command -v jq &>/dev/null; then
  exit 0
fi

INPUT=$(cat)

# Fast pre-check: bail early without a jq subprocess for unrelated tools.
# The JSON always contains "tool_name":"<name>" (with or without spaces).
# This grep covers both compact and space-padded JSON serialisation.
if ! printf '%s' "$INPUT" | grep -qE '"tool_name"\s*:\s*"(Skill|Edit|Write)"'; then
  exit 0
fi

# Single jq call extracts both tool name and skill name from INPUT.
# TSV is safe here: tool names and skill names are kebab-case with no tabs.
IFS=$'\t' read -r TOOL INVOKED_SKILL < <(
  printf '%s' "$INPUT" | jq -r '[
    .tool_name // "unknown",
    (.tool_input.skill // .tool_input.name // "unknown")
  ] | @tsv'
)

ANALYTICS_DIR="${HOME}/.claude/skill-analytics"
mkdir -p "$ANALYTICS_DIR"

OUTCOMES_FILE="${ANALYTICS_DIR}/skill-outcomes.jsonl"
TIMESTAMP=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
SESSION_ID="${CLAUDE_SESSION_ID:-pid-$$-$(date -u +'%Y%m%dT%H')}"

COUNTER_DIR="/tmp/claude-sessions"
mkdir -p "$COUNTER_DIR"
PENDING_FILE="${COUNTER_DIR}/${SESSION_ID}-skill-pending.json"

record_outcome() {
  local skill="$1" outcome="$2"
  # Use jq --arg to safely encode all fields; prevents JSON corruption if a skill name
  # contains quotes, backslashes, or control characters.
  jq -cn --arg ts "$TIMESTAMP" --arg sid "$SESSION_ID" --arg sk "$skill" --arg oc "$outcome" \
    '{timestamp:$ts,session_id:$sid,skill:$sk,outcome:$oc}' >> "$OUTCOMES_FILE"
  rm -f "$PENDING_FILE"
}

if [[ "$TOOL" == "Skill" ]]; then
  # Resolve any previous pending skill before recording the new one.
  if [[ -f "$PENDING_FILE" ]]; then
    PREV_SKILL=$(jq -r '.skill_name // "unknown"' "$PENDING_FILE" 2>/dev/null || echo "unknown")
    record_outcome "$PREV_SKILL" "output_replaced"
  fi

  TEMP_FILE=$(mktemp "${COUNTER_DIR}/tmp.XXXXXX")
  jq -cn --arg sn "$INVOKED_SKILL" --arg ts "$TIMESTAMP" \
    '{skill_name:$sn,invoked_at:$ts}' > "$TEMP_FILE"
  mv "$TEMP_FILE" "$PENDING_FILE"
  exit 0
fi

if [[ "$TOOL" == "Edit" || "$TOOL" == "Write" ]]; then
  if [[ -f "$PENDING_FILE" ]]; then
    # Single jq call to read both fields from the pending file.
    IFS=$'\t' read -r PENDING_SKILL INVOKED_AT < <(
      jq -r '[.skill_name // "unknown", .invoked_at // ""] | @tsv' "$PENDING_FILE" 2>/dev/null \
        || printf 'unknown\t'
    )

    if [[ -n "$INVOKED_AT" ]]; then
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
        rm -f "$PENDING_FILE"
      fi
    fi
  fi
  exit 0
fi

exit 0
