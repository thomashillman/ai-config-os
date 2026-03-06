#!/usr/bin/env bash
# Print runtime status: tool registry, manifest, sync readiness
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"

echo "==> Runtime Status"
echo ""

echo "Tool registry:"
bash "$REPO_ROOT/runtime/validate-registry.sh"
echo ""

echo "Manifest:"
bash "$REPO_ROOT/runtime/manifest.sh" status
echo ""

echo "Config merge:"
bash "$REPO_ROOT/shared/lib/config-merger.sh" --debug > /dev/null && echo "  OK"
echo ""

echo "MCP servers:"
bash "$REPO_ROOT/runtime/adapters/mcp-adapter.sh" list
