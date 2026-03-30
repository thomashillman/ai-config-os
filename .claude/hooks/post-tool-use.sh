#!/bin/bash
set -euo pipefail

# PostToolUse Hook Dispatcher
#
# Thin wrapper that pipes stdin to the Node dispatcher.
# The dispatcher handles JSON parsing, validation, and rule dispatch.

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# Pipe stdin to the Node dispatcher
exec node "${SCRIPT_DIR}/dispatch.mjs" 2>/dev/null
