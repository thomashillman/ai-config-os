#!/usr/bin/env bash
# Generate local analytics reports for skill usage and performance
# Reads from ~/.claude/skill-analytics/ and generates human-readable reports

set -euo pipefail

ANALYTICS_DIR="${HOME}/.claude/skill-analytics"
TARGET_DATE="${1:-$(date -u +%Y-%m-%d)}"
FORMAT="${2:-txt}"

echo "=== AI Config OS — Skill Analytics Report ==="
echo ""
echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Period: $TARGET_DATE"
echo ""

if [ ! -d "$ANALYTICS_DIR" ]; then
  echo "[info] No analytics data collected yet (first session)"
  echo "Analytics will be available at: $ANALYTICS_DIR/sessions/"
  exit 0
fi

# Check for session files
SESSION_DIR="${ANALYTICS_DIR}/sessions"
if [ ! -d "$SESSION_DIR" ] || [ -z "$(ls -A "$SESSION_DIR" 2>/dev/null)" ]; then
  echo "[info] No session data available"
  echo "Sessions will be stored in: $SESSION_DIR"
  exit 0
fi

# Count sessions and skills
SESSION_COUNT=$(ls -1 "$SESSION_DIR" 2>/dev/null | wc -l)
echo "Sessions recorded: $SESSION_COUNT"
echo ""

# Check for aggregated daily file
AGGREGATED_FILE="${ANALYTICS_DIR}/aggregated-${TARGET_DATE}.json"
if [ -f "$AGGREGATED_FILE" ]; then
  echo "[ok] Aggregated data available for $TARGET_DATE"
  # In Phase 2d, parse and display JSON metrics
else
  echo "[info] No aggregated data for $TARGET_DATE"
fi

echo ""
echo "Phase 2d enhancements will include:"
echo "  - Skill invocation counts and timing"
echo "  - Cost breakdown by skill and model variant"
echo "  - Latency distribution (p50, p95, p99)"
echo "  - Variant usage distribution"
echo "  - Recommended variant optimizations"
echo ""
echo "To enable analytics:"
echo "  1. Source .claude/hooks/session-start.sh in your shell"
echo "  2. Use \`invoke-skill\` wrapper to log invocations"
echo "  3. Run this script daily to see patterns"

exit 0
