#!/bin/bash
# Post-tool-use hook: collect analytics metrics

set -e

METRICS_FILE="${CLAUDE_PROJECT_DIR:-.}/.claude/metrics.jsonl"

# Append metric if tool was successfully executed
if [[ "$TOOL_STATUS" == "success" ]]; then
    timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
    cat >> "$METRICS_FILE" << JSONEOF
{"timestamp": "$timestamp", "tool": "$TOOL_NAME", "status": "success", "duration_ms": 0}
JSONEOF
fi
