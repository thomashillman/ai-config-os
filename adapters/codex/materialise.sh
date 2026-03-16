#!/usr/bin/env bash
# materialise.sh - Fetch and materialise the Codex skills package (AGENTS.md).
#
# Usage:
#   bash adapters/codex/materialise.sh fetch      # fetch from Worker and cache
#   bash adapters/codex/materialise.sh extract    # extract local emitted package to cache
#   bash adapters/codex/materialise.sh install    # install AGENTS.md into ~/.codex/
#   bash adapters/codex/materialise.sh status     # show cache vs remote versions
#   bash adapters/codex/materialise.sh help       # show this help
#
# Environment variables:
#   AI_CONFIG_TOKEN   - Bearer token for the Worker API (optional for extract/install)
#   AI_CONFIG_WORKER  - Worker base URL (default: https://ai-config-os.workers.dev)
#   AI_CONFIG_PACKAGE - Package path for extract (default: ./dist/clients/codex/)
#
# Cache location: ~/.ai-config-os/cache/codex/
# Install location: ~/.codex/AGENTS.md

set -euo pipefail

CACHE_DIR="${HOME}/.ai-config-os/cache/codex"
WORKER_URL="${AI_CONFIG_WORKER:-https://ai-config-os.workers.dev}"
CMD="${1:-fetch}"
VERSION_FILE="${CACHE_DIR}/latest.version"
PACKAGE_DIR="${AI_CONFIG_PACKAGE:-./dist/clients/codex}"
INSTALL_DIR="${HOME}/.codex"

mkdir -p "$CACHE_DIR"

case "$CMD" in
  fetch)
    if [ -z "${AI_CONFIG_TOKEN:-}" ]; then
      echo "Error: AI_CONFIG_TOKEN is required for fetch" >&2
      exit 1
    fi
    echo "Fetching Codex package metadata from ${WORKER_URL}..."
    RESPONSE=$(curl -sf \
      -H "Authorization: Bearer ${AI_CONFIG_TOKEN}" \
      "${WORKER_URL}/v1/client/codex/latest" 2>/dev/null) || {
        echo "Error: Failed to fetch from Worker" >&2
        exit 1
      }

    VERSION=$(echo "$RESPONSE" | node -e "
      let d='';
      process.stdin.resume();
      process.stdin.on('data',c=>d+=c);
      process.stdin.on('end',()=>{
        try {
          const r = JSON.parse(d);
          process.stdout.write(r.version || r.release_version || '');
        } catch(e) {}
      });
    " 2>/dev/null) || true

    echo "$VERSION" > "$VERSION_FILE"
    echo "  Version: ${VERSION:-unknown}"
    echo "  Cached to: $CACHE_DIR"
    echo ""
    echo "Run 'bash adapters/codex/materialise.sh extract' to extract the local package."
    ;;

  extract)
    if [ ! -d "$PACKAGE_DIR" ]; then
      echo "Error: Package directory not found: $PACKAGE_DIR" >&2
      echo "Run 'node scripts/build/compile.mjs' first to build the package." >&2
      exit 1
    fi

    echo "Extracting Codex package from ${PACKAGE_DIR}..."
    node ./scripts/build/lib/materialise-client.mjs \
      --package "$PACKAGE_DIR" \
      --output "$CACHE_DIR" \
      --platform codex 2>/dev/null || {
        # Fallback: direct copy
        cp -r "${PACKAGE_DIR}/." "$CACHE_DIR/"
      }
    echo "  Extracted to: $CACHE_DIR"
    ;;

  install)
    AGENTS_SRC=""
    # Try cache first, then package dir
    if [ -f "${CACHE_DIR}/AGENTS.md" ]; then
      AGENTS_SRC="${CACHE_DIR}/AGENTS.md"
    elif [ -f "${PACKAGE_DIR}/AGENTS.md" ]; then
      AGENTS_SRC="${PACKAGE_DIR}/AGENTS.md"
    else
      echo "Error: AGENTS.md not found in cache or package dir." >&2
      echo "Run 'bash adapters/codex/materialise.sh extract' first." >&2
      exit 1
    fi

    mkdir -p "$INSTALL_DIR"
    cp "$AGENTS_SRC" "${INSTALL_DIR}/AGENTS.md"
    echo "Installed AGENTS.md to ${INSTALL_DIR}/AGENTS.md"
    echo ""
    echo "Codex will load these instructions automatically on next session."
    ;;

  status)
    echo "=== Codex Package Status ==="
    CACHED_VERSION=""
    [ -f "$VERSION_FILE" ] && CACHED_VERSION=$(cat "$VERSION_FILE")
    echo "  Cached version: ${CACHED_VERSION:-none}"
    echo "  Cache path: $CACHE_DIR"
    if [ -f "${INSTALL_DIR}/AGENTS.md" ]; then
      echo "  Installed: ${INSTALL_DIR}/AGENTS.md ✓"
    else
      echo "  Installed: not yet (run install)"
    fi
    ;;

  help|--help|-h)
    head -20 "$0" | grep '^#' | sed 's/^# *//'
    ;;

  *)
    echo "Unknown command: $CMD" >&2
    echo "Usage: bash adapters/codex/materialise.sh [fetch|extract|install|status|help]" >&2
    exit 1
    ;;
esac
