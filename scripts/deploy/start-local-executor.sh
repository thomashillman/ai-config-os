#!/bin/bash

# Start local remote executor for integration testing
#
# This script starts the remote executor service locally, which is useful for:
# 1. Testing Worker-to-executor communication before deploying
# 2. Running smoke tests with a real executor backend
# 3. Local development and debugging
#
# Prerequisites:
# 1. Node.js installed
# 2. Environment variables set (or loaded from .env.local)
#
# Usage:
#   bash scripts/deploy/start-local-executor.sh
#   # Or with custom port:
#   REMOTE_EXECUTOR_PORT=9000 bash scripts/deploy/start-local-executor.sh

set -eu

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EXECUTOR_DIR="$REPO_ROOT/runtime/remote-executor"

# Default port if not set
REMOTE_EXECUTOR_PORT="${REMOTE_EXECUTOR_PORT:-8788}"

echo "Starting Remote Executor"
echo "======================="
echo
echo "Executor will listen on: http://localhost:$REMOTE_EXECUTOR_PORT"
echo

# Check if executor server exists
if [ ! -f "$EXECUTOR_DIR/server.mjs" ]; then
  echo "✗ Executor code not found at $EXECUTOR_DIR/server.mjs"
  exit 1
fi

# Check for required env vars
if [ -z "${REMOTE_EXECUTOR_SHARED_SECRET:-}" ]; then
  echo "⚠ Warning: REMOTE_EXECUTOR_SHARED_SECRET not set"
  echo "   Set it before deploying to production:"
  echo "   export REMOTE_EXECUTOR_SHARED_SECRET=\"your-secret\""
  echo
fi

# Export port for the executor
export REMOTE_EXECUTOR_PORT

# Start the executor
echo "Starting server..."
cd "$EXECUTOR_DIR"
node server.mjs

# The script below will not be reached since server runs indefinitely
echo
echo "Executor stopped"
