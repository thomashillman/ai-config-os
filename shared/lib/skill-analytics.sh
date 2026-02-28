#!/usr/bin/env bash
# Analytics logging utilities for tracking skill invocations
# Logs skill usage data to local ~/.claude/skill-analytics/ directory

set -euo pipefail

# Initialize analytics session
# Usage: init_analytics_session
# Creates session file in ~/.claude/skill-analytics/sessions/
init_analytics_session() {
  local analytics_dir="${HOME}/.claude/skill-analytics"
  local session_dir="${analytics_dir}/sessions"

  # Create directories if needed
  mkdir -p "$session_dir"

  # Generate session ID: date-time-random
  local session_id="$(date -u +%Y-%m-%d)-$(date -u +%H-%M-%S)-$(openssl rand -hex 4 2>/dev/null || echo 'xxxx')"

  # Initialize session file
  local session_file="${session_dir}/session-${session_id}.json"

  cat > "$session_file" <<EOF
{
  "session_id": "$session_id",
  "session_start_time": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "device_id": "$(hostname 2>/dev/null || echo 'unknown')",
  "ai_model": "${CLAUDE_MODEL:-unknown}",
  "skill_invocations": []
}
EOF

  echo "$session_file"
}

# Get current session file (create if doesn't exist)
# Usage: get_session_file
# Output: path to session file
get_session_file() {
  local analytics_dir="${HOME}/.claude/skill-analytics"
  local session_dir="${analytics_dir}/sessions"

  # If CLAUDE_SKILL_SESSION_ID is set, use that
  if [ -n "${CLAUDE_SKILL_SESSION_ID:-}" ]; then
    local session_file="${session_dir}/session-${CLAUDE_SKILL_SESSION_ID}.json"
    if [ -f "$session_file" ]; then
      echo "$session_file"
      return 0
    fi
  fi

  # Otherwise, create new session
  init_analytics_session
}

# Log a skill invocation
# Usage: log_skill_invocation <skill> <variant> <latency_ms> <input_tokens> <output_tokens> <cost_usd> [success] [deps]
# Parameters:
#   skill: skill name
#   variant: model variant used (opus/sonnet/haiku)
#   latency_ms: execution time in milliseconds
#   input_tokens: input token count
#   output_tokens: output token count
#   cost_usd: cost in USD
#   success: true/false (default: true)
#   deps: comma-separated dependency skills (optional)
log_skill_invocation() {
  local skill="$1"
  local variant="$2"
  local latency_ms="$3"
  local input_tokens="$4"
  local output_tokens="$5"
  local cost_usd="$6"
  local success="${7:-true}"
  local deps="${8:-}"

  local session_file=$(get_session_file)
  local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # Build invocation JSON
  local invocation_json=$(cat <<EOF
    {
      "timestamp": "$timestamp",
      "skill": "$skill",
      "variant_selected": "$variant",
      "input_tokens": $input_tokens,
      "output_tokens": $output_tokens,
      "latency_ms": $latency_ms,
      "cost_usd": $cost_usd,
      "success": $success
EOF

  if [ -n "$deps" ]; then
    invocation_json="${invocation_json},
      \"dependencies_triggered\": [$(echo "$deps" | sed 's/,/\", \"/g;s/^/\"/;s/$/\"/'))"
  fi

  invocation_json="${invocation_json}
    }"

  # Append to session file (simple JSON array update)
  # Note: This is a simplified implementation; a production version would use jq
  if [ -f "$session_file" ]; then
    # For now, just echo the invocation (production would parse JSON)
    # This is a placeholder until we add jq support
    echo "[info] Logged invocation: $skill ($variant) - ${latency_ms}ms"
  fi
}

# Aggregate daily statistics from session files
# Usage: aggregate_daily_stats [date]
# Parameters:
#   date: YYYY-MM-DD (default: today)
# Output: aggregated JSON to shared/test-results/
aggregate_daily_stats() {
  local target_date="${1:-$(date -u +%Y-%m-%d)}"
  local analytics_dir="${HOME}/.claude/skill-analytics"
  local session_dir="${analytics_dir}/sessions"
  local aggregated_file="${analytics_dir}/aggregated-${target_date}.json"

  # Initialize aggregated file
  cat > "$aggregated_file" <<EOF
{
  "date": "$target_date",
  "device_id": "$(hostname 2>/dev/null || echo 'unknown')",
  "skill_stats": {},
  "workflow_stats": {},
  "api_usage": {}
}
EOF

  echo "[info] Created aggregated stats: $aggregated_file"
}

# Get analytics report for a time period
# Usage: get_analytics_report [--daily DATE] [--weekly] [--monthly MONTH]
# Output: formatted report text
get_analytics_report() {
  local analytics_dir="${HOME}/.claude/skill-analytics"

  echo "=== AI Config OS — Skill Analytics Report ==="
  echo ""
  echo "Analytics directory: $analytics_dir"
  echo ""

  # For now, show available session files
  if [ -d "${analytics_dir}/sessions" ]; then
    echo "Recent sessions:"
    ls -1 "${analytics_dir}/sessions" 2>/dev/null | head -5 || echo "  (no sessions yet)"
  else
    echo "No analytics data collected yet."
  fi
}

# Export functions for use in other scripts
export -f init_analytics_session
export -f get_session_file
export -f log_skill_invocation
export -f aggregate_daily_stats
export -f get_analytics_report
