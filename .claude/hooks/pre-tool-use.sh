#!/bin/bash
set -euo pipefail

# PreToolUse hook: Guard against direct edits to plugins/core-skills/skills/
# Ensures all skill authoring happens in shared/skills/, with symlinks handled automatically

INPUT=$(cat)

# Extract tool_name and file_path from JSON input
TOOL=$(echo "$INPUT" | grep -o '"tool_name":"[^"]*"' | sed 's/"tool_name":"//;s/"//' | head -1)
FILE_PATH=$(echo "$INPUT" | grep -o '"file_path":"[^"]*"' | sed 's/"file_path":"//;s/"//' | head -1)

# Guard: block direct edits to plugins/core-skills/skills/
if [[ "${FILE_PATH:-}" == *"/plugins/core-skills/skills/"* ]] && \
   { [[ "${TOOL:-}" == "Write" ]] || [[ "${TOOL:-}" == "Edit" ]] || [[ "${TOOL:-}" == "NotebookEdit" ]]; }; then
  printf '{"decision":"block","reason":"Author skills in shared/skills/ not plugins/ directly. Symlinks handle plugin wiring automatically."}\n'
  exit 0
fi

# Allow the tool to proceed
exit 0
