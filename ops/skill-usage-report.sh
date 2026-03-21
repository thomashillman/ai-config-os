#!/bin/bash
# ops/skill-usage-report.sh — analytics report for skill usage and tool inefficiencies
#
# Usage:
#   bash ops/skill-usage-report.sh
#   bash ops/skill-usage-report.sh --since 2026-03-01
#
# Reads:
#   ~/.claude/skill-analytics/skill-usage.jsonl
#   ~/.claude/skill-analytics/inefficiencies.jsonl

set -euo pipefail

ANALYTICS_DIR="${HOME}/.claude/skill-analytics"
USAGE_LOG="${ANALYTICS_DIR}/skill-usage.jsonl"
INEFF_LOG="${ANALYTICS_DIR}/inefficiencies.jsonl"

# ── Argument parsing ────────────────────────────────────────────────────────
SINCE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --since)
      SINCE="$2"
      shift 2
      ;;
    *)
      echo "Usage: $0 [--since YYYY-MM-DD]" >&2
      exit 1
      ;;
  esac
done

# ── Helpers ─────────────────────────────────────────────────────────────────
require_jq() {
  if ! command -v jq &>/dev/null; then
    echo "Error: jq is required but not installed." >&2
    exit 1
  fi
}

filter_since() {
  local file="$1"
  if [[ -z "$SINCE" ]]; then
    cat "$file"
  else
    jq -c --arg since "${SINCE}T00:00:00Z" 'select(.timestamp >= $since)' "$file"
  fi
}

divider() { printf '%0.s─' {1..60}; echo; }

# ── Main ─────────────────────────────────────────────────────────────────────
require_jq

echo
echo "  Skill Usage Report"
[[ -n "$SINCE" ]] && echo "  Since: $SINCE"
divider

# ── 1. Skill invocation counts ───────────────────────────────────────────────
echo
echo "  SKILL INVOCATIONS"
divider

if [[ ! -f "$USAGE_LOG" ]]; then
  echo "  (no data yet — invoke a skill to start tracking)"
else
  FILTERED=$(filter_since "$USAGE_LOG")
  TOTAL=$(echo "$FILTERED" | grep -c . 2>/dev/null || echo "0")

  if [[ "$TOTAL" -eq 0 ]]; then
    echo "  (no invocations in selected range)"
  else
    echo "$FILTERED" \
      | jq -r '.skill' \
      | sort | uniq -c | sort -rn \
      | awk '{ printf "  %4d  %s\n", $1, $2 }'
    echo
    echo "  Total: $TOTAL invocations"
  fi
fi

# ── 2. Never-called skills ───────────────────────────────────────────────────
echo
echo "  SKILLS NEVER CALLED"
divider

SKILLS_DIR="${CLAUDE_PROJECT_DIR:-$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel 2>/dev/null || echo ".")}/shared/skills"

if [[ -d "$SKILLS_DIR" ]]; then
  ALL_SKILLS=$(ls -1 "$SKILLS_DIR" 2>/dev/null | grep -v '^_' | sort)

  if [[ -f "$USAGE_LOG" ]]; then
    USED_SKILLS=$(jq -r '.skill' "$USAGE_LOG" | sort -u)
  else
    USED_SKILLS=""
  fi

  NEVER_CALLED=""
  while IFS= read -r skill; do
    if ! echo "$USED_SKILLS" | grep -qx "$skill"; then
      NEVER_CALLED="${NEVER_CALLED}  ${skill}\n"
    fi
  done <<< "$ALL_SKILLS"

  if [[ -z "$NEVER_CALLED" ]]; then
    echo "  All known skills have been invoked at least once."
  else
    printf "%b" "$NEVER_CALLED"
  fi
else
  echo "  (could not locate shared/skills/ to compare)"
fi

# ── 3. Recent tool errors ────────────────────────────────────────────────────
echo
echo "  RECENT TOOL ERRORS (last 10)"
divider

if [[ ! -f "$INEFF_LOG" ]]; then
  echo "  (no data yet)"
else
  ERRORS=$(filter_since "$INEFF_LOG" | jq -c 'select(.type == "tool_error")' | tail -10)
  if [[ -z "$ERRORS" ]]; then
    echo "  (none in selected range)"
  else
    echo "$ERRORS" | jq -r '"  [\(.timestamp)] \(.tool): \(.snippet | .[0:80] | gsub("\n";" "))"'
  fi
fi

# ── 4. Loop events ───────────────────────────────────────────────────────────
echo
echo "  LOOP EVENTS BY TOOL"
divider

if [[ ! -f "$INEFF_LOG" ]]; then
  echo "  (no data yet)"
else
  LOOPS=$(filter_since "$INEFF_LOG" | jq -c 'select(.type == "loop_suspected")')
  if [[ -z "$LOOPS" ]]; then
    echo "  (none detected)"
  else
    echo "$LOOPS" \
      | jq -r '.tool' \
      | sort | uniq -c | sort -rn \
      | awk '{ printf "  %4d  %s\n", $1, $2 }'
    LOOP_SESSIONS=$(echo "$LOOPS" | jq -r '.session_id' | sort -u | wc -l | tr -d ' ')
    echo
    echo "  Across $LOOP_SESSIONS session(s)"
  fi
fi

# ── 5. Summary ───────────────────────────────────────────────────────────────
echo
divider

if [[ -f "$USAGE_LOG" ]]; then
  TOTAL_INVOCATIONS=$(jq -s 'length' "$USAGE_LOG" 2>/dev/null || echo "0")
  TOTAL_SESSIONS=$(jq -r '.session_id' "$USAGE_LOG" 2>/dev/null | sort -u | wc -l | tr -d ' ')
else
  TOTAL_INVOCATIONS=0
  TOTAL_SESSIONS=0
fi

if [[ -f "$INEFF_LOG" ]]; then
  TOTAL_ERRORS=$(jq -c 'select(.type=="tool_error")' "$INEFF_LOG" 2>/dev/null | grep -c . || echo "0")
  TOTAL_LOOPS=$(jq -c 'select(.type=="loop_suspected")' "$INEFF_LOG" 2>/dev/null | grep -c . || echo "0")
else
  TOTAL_ERRORS=0
  TOTAL_LOOPS=0
fi

printf "  All-time: %d invocations across %d sessions | %d errors | %d loop events\n" \
  "$TOTAL_INVOCATIONS" "$TOTAL_SESSIONS" "$TOTAL_ERRORS" "$TOTAL_LOOPS"
echo
