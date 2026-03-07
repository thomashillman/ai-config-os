#!/usr/bin/env bash
# materialise.sh - Fetch compiled skills from the ai-config-os Worker and cache locally.
#
# Usage:
#   bash adapters/claude/materialise.sh            # fetch latest
#   bash adapters/claude/materialise.sh status     # show cache vs remote versions
#   bash adapters/claude/materialise.sh help       # show this help
#
# Environment variables:
#   AI_CONFIG_TOKEN   - Bearer token for the Worker API (required)
#   AI_CONFIG_WORKER  - Worker base URL (default: https://ai-config-os.workers.dev)
#
# Cache location: ~/.ai-config-os/cache/claude-code/

set -euo pipefail

CACHE_DIR="${HOME}/.ai-config-os/cache/claude-code"
WORKER_URL="${AI_CONFIG_WORKER:-https://ai-config-os.workers.dev}"
CMD="${1:-fetch}"

# ── Helpers ──────────────────────────────────────────────────────────────

die() { echo "ERROR: $*" >&2; exit 1; }

require_token() {
  if [[ -z "${AI_CONFIG_TOKEN:-}" ]]; then
    die "AI_CONFIG_TOKEN is not set. Export your Worker bearer token first."
  fi
}

api_get() {
  local path="$1"
  curl -sS --fail-with-body \
    -H "Authorization: Bearer ${AI_CONFIG_TOKEN}" \
    -H "Accept: application/json" \
    "${WORKER_URL}${path}"
}

# ── Commands ──────────────────────────────────────────────────────────────

cmd_help() {
  grep '^#' "$0" | sed 's/^# \?//' | head -20
}

cmd_status() {
  require_token

  echo "ai-config-os materialiser status"
  echo "  Worker: ${WORKER_URL}"
  echo ""

  # Local cache
  local cached_version="(none)"
  local cached_at="(never)"
  if [[ -f "${CACHE_DIR}/latest.json" ]]; then
    cached_version=$(python3 -c "import json; d=json.load(open('${CACHE_DIR}/latest.json')); print(d.get('version','?'))" 2>/dev/null || echo "?")
    cached_at=$(python3 -c "import json; d=json.load(open('${CACHE_DIR}/latest.json')); print(d.get('built_at','?'))" 2>/dev/null || echo "?")
  fi
  echo "  Cached:  ${cached_version} (built ${cached_at})"

  # Remote
  local remote_json
  if remote_json=$(api_get /v1/health 2>/dev/null); then
    local remote_version
    remote_version=$(echo "${remote_json}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('version','?'))" 2>/dev/null || echo "?")
    local remote_at
    remote_at=$(echo "${remote_json}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('built_at','?'))" 2>/dev/null || echo "?")
    echo "  Remote:  ${remote_version} (built ${remote_at})"

    if [[ "${cached_version}" == "${remote_version}" ]]; then
      echo ""
      echo "  Up to date."
    else
      echo ""
      echo "  Update available: run 'bash adapters/claude/materialise.sh' to fetch."
    fi
  else
    echo "  Remote:  (unreachable)"
  fi
}

cmd_fetch() {
  require_token

  mkdir -p "${CACHE_DIR}"

  echo "Fetching from ${WORKER_URL}..."

  # Try remote; fall back to cache on failure
  local payload
  if ! payload=$(api_get /v1/client/claude-code/latest 2>&1); then
    if [[ -f "${CACHE_DIR}/latest.json" ]]; then
      echo "WARN: Worker unreachable. Using last-known-good cached version."
      local cached_version
      cached_version=$(python3 -c "import json; d=json.load(open('${CACHE_DIR}/latest.json')); print(d.get('version','?'))" 2>/dev/null || echo "?")
      echo "  Cached version: ${cached_version}"
      exit 0
    else
      die "Worker unreachable and no local cache found. Check AI_CONFIG_TOKEN and AI_CONFIG_WORKER."
    fi
  fi

  # Write to cache
  echo "${payload}" > "${CACHE_DIR}/latest.json"

  local version
  version=$(echo "${payload}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('version','?'))" 2>/dev/null || echo "?")

  local skill_count
  skill_count=$(echo "${payload}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('skills',[])))" 2>/dev/null || echo "?")

  echo "Cached version: ${version}"
  echo "Skills available: ${skill_count}"
  echo "Location: ${CACHE_DIR}/latest.json"
  echo ""
  echo "Done. To apply skills locally, see adapters/claude/dev-test.sh or runtime/sync.sh."
}

# ── Dispatch ──────────────────────────────────────────────────────────────

case "${CMD}" in
  fetch|"")   cmd_fetch ;;
  status)     cmd_status ;;
  help|--help|-h) cmd_help ;;
  *)          die "Unknown command: ${CMD}. Try: fetch, status, help" ;;
esac
