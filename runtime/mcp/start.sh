#!/usr/bin/env bash
# Start the ai-config-os MCP server
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT/runtime/mcp"

if [ ! -d "node_modules" ]; then
  echo "Installing MCP server dependencies..."
  npm install --silent
fi

exec node server.js
