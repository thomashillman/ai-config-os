#!/usr/bin/env bash
# materialise.sh - Fetch and materialize compiled skills packages.
#
# Usage:
#   bash adapters/claude/materialise.sh fetch      # fetch from Worker and cache metadata
#   bash adapters/claude/materialise.sh extract    # extract emitted package to cache
#   bash adapters/claude/materialise.sh status     # show cache vs remote versions
#   bash adapters/claude/materialise.sh help       # show this help
#
# Environment variables:
#   AI_CONFIG_TOKEN   - Bearer token for the Worker API (optional for extract command)
#   AI_CONFIG_WORKER  - Worker base URL (default: https://ai-config-os.workers.dev)
#   AI_CONFIG_PACKAGE - Package path for extract command (default: ./dist/clients/claude-code/)
#
# Cache location: ~/.ai-config-os/cache/claude-code/
#
# Commands:
#   fetch         Fetch skill metadata from remote Worker (requires AI_CONFIG_TOKEN)
#   extract       Extract/materialize local emitted package (Node.js API)
#   status        Compare cached vs remote versions
#   help          Show this help text

set -euo pipefail

CACHE_DIR="${HOME}/.ai-config-os/cache/claude-code"
WORKER_URL="${AI_CONFIG_WORKER:-https://ai-config-os.workers.dev}"
CMD="${1:-fetch}"
ETAG_FILE="${CACHE_DIR}/latest.etag"
VERSION_FILE="${CACHE_DIR}/latest.version"

# ── Helpers ──────────────────────────────────────────────────────────────

_CLEANUP_FILES=()
_cleanup() { rm -f "${_CLEANUP_FILES[@]}" 2>/dev/null || true; }
trap '_cleanup' EXIT

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

read_cached_version() {
  if [[ -f "${VERSION_FILE}" ]]; then
    cat "${VERSION_FILE}"
    return
  fi

  if [[ -f "${CACHE_DIR}/latest.json" ]]; then
    python3 -c "import json; d=json.load(open('${CACHE_DIR}/latest.json')); print(d.get('version','?'))" 2>/dev/null || echo "?"
    return
  fi

  echo "(none)"
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
    cached_version=$(read_cached_version)
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

  local curl_args=(
    -s
    --fail-with-body
    -H "Authorization: Bearer ${AI_CONFIG_TOKEN}"
    -H "Accept: application/json"
  )

  if [[ -f "${ETAG_FILE}" ]]; then
    curl_args+=(-H "If-None-Match: $(cat "${ETAG_FILE}")")
  fi

  local headers_file
  headers_file=$(mktemp /tmp/ai-config-headers.XXXXXX)
  local payload_file
  payload_file=$(mktemp /tmp/ai-config-payload.XXXXXX)
  _CLEANUP_FILES+=("${headers_file}" "${payload_file}")

  if ! curl \
    "${curl_args[@]}" \
    -D "${headers_file}" \
    -o "${payload_file}" \
    "${WORKER_URL}/v1/client/claude-code/latest"; then
    # Distinguish auth failure from network failure using response headers
    local fail_status=""
    if [[ -s "${headers_file}" ]]; then
      fail_status=$(awk '/^HTTP\/[0-9]/{code=$2} END{print code}' "${headers_file}")
    fi

    if [[ "${fail_status}" == "401" || "${fail_status}" == "403" ]]; then
      die "Authentication failed (HTTP ${fail_status}). AI_CONFIG_TOKEN is not accepted by the Worker at ${WORKER_URL}."
    fi

    if [[ -f "${CACHE_DIR}/latest.json" ]]; then
      echo "WARN: Worker unreachable. Using last-known-good cached version."
      local cached_version
      cached_version=$(read_cached_version)
      echo "  Cached version: ${cached_version}"
      exit 0
    else
      die "Worker unreachable and no local cache found. Check AI_CONFIG_TOKEN and AI_CONFIG_WORKER."
    fi
  fi

  # Extract the final HTTP status (proxy may prepend its own status line)
  local http_status
  http_status=$(awk '/^HTTP\/[0-9]/{code=$2} END{print code}' "${headers_file}")

  if [[ "${http_status}" == "304" ]]; then
    if [[ ! -f "${CACHE_DIR}/latest.json" ]]; then
      die "Received 304 Not Modified but no cached payload exists."
    fi

    echo "Not modified (304)."
    echo "Cached version: $(read_cached_version)"
    return
  fi

  if [[ "${http_status}" == "401" || "${http_status}" == "403" ]]; then
    local err_detail=""
    if [[ -s "${payload_file}" ]]; then
      err_detail=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('hint', d.get('error','')))" "${payload_file}" 2>/dev/null || true)
    fi
    die "Authentication failed (HTTP ${http_status}). AI_CONFIG_TOKEN is not accepted by the Worker.${err_detail:+ Detail: ${err_detail}}"
  fi

  if [[ "${http_status}" != "200" ]]; then
    die "Unexpected HTTP status: ${http_status}"
  fi

  local response_etag
  response_etag=$(awk '/^[Ee][Tt][Aa][Gg]:/{etag=$0; sub(/^[^:]+:[[:space:]]*/, "", etag); gsub(/\r$/, "", etag)} END{print etag}' "${headers_file}")
  [[ -n "${response_etag}" ]] || die "Response missing ETag header"

  local version
  version=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('version','?'))" "${payload_file}" 2>/dev/null || echo "?")
  [[ "${version}" != "?" ]] || die "Payload missing version field"

  local latest_tmp="${CACHE_DIR}/latest.json.tmp"
  local etag_tmp="${ETAG_FILE}.tmp"
  local version_tmp="${VERSION_FILE}.tmp"

  cp "${payload_file}" "${latest_tmp}"
  printf '%s' "${response_etag}" > "${etag_tmp}"
  printf '%s' "${version}" > "${version_tmp}"

  mv "${latest_tmp}" "${CACHE_DIR}/latest.json"
  mv "${version_tmp}" "${VERSION_FILE}"
  mv "${etag_tmp}" "${ETAG_FILE}"

  local skill_count
  skill_count=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(len(d.get('skills',[])))" "${CACHE_DIR}/latest.json" 2>/dev/null || echo "?")

  echo "Cached version: ${version}"
  echo "Skills available: ${skill_count}"
  echo "Location: ${CACHE_DIR}/latest.json"
  echo ""
  echo "Done. To materialize skills locally, run: bash adapters/claude/materialise.sh extract"
}

cmd_extract() {
  local package_path="${AI_CONFIG_PACKAGE:-./dist/clients/claude-code/}"

  # Find the repo root
  local repo_root
  repo_root=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")

  # Resolve package path relative to repo root
  local resolved_package
  if [[ "${package_path}" == /* ]]; then
    resolved_package="${package_path}"
  else
    resolved_package="${repo_root}/${package_path}"
  fi

  if [[ ! -d "${resolved_package}" ]]; then
    die "Package not found: ${resolved_package}"
  fi

  # Delegate to Node materialiser CLI
  local materialiser_cli="${repo_root}/scripts/build/materialise.mjs"
  if [[ ! -f "${materialiser_cli}" ]]; then
    die "Materialiser CLI not found: ${materialiser_cli}"
  fi

  # Materialize with verbose output
  node "${materialiser_cli}" "${resolved_package}" --dest "${CACHE_DIR}" --verbose
}

# ── Dispatch ──────────────────────────────────────────────────────────────

case "${CMD}" in
  fetch)      cmd_fetch ;;
  extract)    cmd_extract ;;
  status)     cmd_status ;;
  help|--help|-h) cmd_help ;;
  "")         cmd_fetch ;; # default: fetch
  *)          die "Unknown command: ${CMD}. Try: fetch, extract, status, help" ;;
esac
