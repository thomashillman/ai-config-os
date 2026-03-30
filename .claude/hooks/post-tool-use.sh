#!/bin/bash
set -euo pipefail

# PostToolUse Hook Dispatcher
#
# Thin wrapper that pipes stdin to the Node dispatcher.
# The dispatcher handles JSON parsing, validation, and rule dispatch.
#
# Environment:
#   DEBUG_HOOKS=0: Suppress dispatcher stderr (use with caution)
#   DEBUG_HOOKS=1 (default): Show all diagnostics

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# Pipe stdin to the Node dispatcher
# Errors are visible by default; set DEBUG_HOOKS=0 to suppress stderr
if [[ "${DEBUG_HOOKS:-1}" == "0" ]]; then
  exec node "${SCRIPT_DIR}/dispatch.mjs" 2>/dev/null
else
  exec node "${SCRIPT_DIR}/dispatch.mjs"
fi
