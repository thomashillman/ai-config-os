#!/usr/bin/env bash
# materialise.sh - Fetch and materialize compiled skills packages.
#
# Usage:
#   bash adapters/claude/materialise.sh fetch      # fetch from Worker and cache metadata
#   bash adapters/claude/materialise.sh extract    # extract emitted package to cache
#   bash adapters/claude/materialise.sh bootstrap  # fetch complete package from Worker, extract, install (fast path)
#   bash adapters/claude/materialise.sh install    # install cached skills to ~/.claude/skills
#   bash adapters/claude/materialise.sh status     # show cache vs remote versions
#   bash adapters/claude/materialise.sh help       # show this help
#
# Environment variables:
#   AI_CONFIG_TOKEN   - Bearer token for the Worker API (required for fetch/bootstrap)
#   AI_CONFIG_WORKER  - Worker base URL (default: https://ai-config-os.workers.dev)
#   AI_CONFIG_PACKAGE - Package path for extract command (default: ./dist/clients/claude-code/)
#
# Cache location: ~/.ai-config-os/cache/claude-code/
#
# Commands:
#   fetch         Fetch skill metadata from remote Worker (requires AI_CONFIG_TOKEN)
#   extract       Extract/materialize local emitted package (Node.js API)
#   bootstrap     Fast path: fetch complete package from Worker, extract, install (requires AI_CONFIG_TOKEN)
#   install       Install cached skills to ~/.claude/skills (idempotent with version check)
#   status        Compare cached vs remote versions
#   help          Show this help text

set -euo pipefail

CACHE_DIR="${HOME}/.ai-config-os/cache/claude-code"
WORKER_URL="${AI_CONFIG_WORKER:-https://ai-config-os.workers.dev}"
CMD="${1:-fetch}"
ETAG_FILE="${CACHE_DIR}/latest.etag"
VERSION_FILE="${CACHE_DIR}/latest.version"

# ── Helpers ──────────────────────────────────────────────────────────────

declare -a _CLEANUP_FILES=()
_cleanup() {
  if [[ ${#_CLEANUP_FILES[@]} -gt 0 ]]; then
    rm -f "${_CLEANUP_FILES[@]}" 2>/dev/null || true
  fi
}
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
    jq -r '.version // "?"' "${CACHE_DIR}/latest.json" 2>/dev/null || echo "?"
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

  # Local cache — parse version + built_at in one jq call when possible
  local cached_version="(none)"
  local cached_at="(never)"
  if [[ -f "${CACHE_DIR}/latest.json" ]]; then
    if [[ -f "${VERSION_FILE}" ]]; then
      cached_version=$(cat "${VERSION_FILE}")
      cached_at=$(jq -r '.built_at // "?"' "${CACHE_DIR}/latest.json" 2>/dev/null || echo "?")
    else
      local _cache_fields
      _cache_fields=$(jq -r '[(.version // "?"), (.built_at // "?")] | @tsv' \
        "${CACHE_DIR}/latest.json" 2>/dev/null || echo "?	?")
      cached_version="${_cache_fields%%$'\t'*}"
      cached_at="${_cache_fields##*$'\t'}"
    fi
  fi
  echo "  Cached:  ${cached_version} (built ${cached_at})"

  # Remote
  local remote_json
  if remote_json=$(api_get /v1/health 2>/dev/null); then
    local remote_info remote_version remote_at
    remote_info=$(echo "${remote_json}" | jq -r '[(.version // "?"), (.built_at // "?")] | join("\t")' 2>/dev/null || echo "?\t?")
    remote_version="${remote_info%%$'\t'*}"
    remote_at="${remote_info##*$'\t'}"
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
      err_detail=$(jq -r '.hint // .error // ""' "${payload_file}" 2>/dev/null || true)
    fi
    die "Authentication failed (HTTP ${http_status}). AI_CONFIG_TOKEN is not accepted by the Worker.${err_detail:+ Detail: ${err_detail}}"
  fi

  if [[ "${http_status}" != "200" ]]; then
    die "Unexpected HTTP status: ${http_status}"
  fi

  local response_etag
  response_etag=$(awk '/^[Ee][Tt][Aa][Gg]:/{etag=$0; sub(/^[^:]+:[[:space:]]*/, "", etag); gsub(/\r$/, "", etag)} END{print etag}' "${headers_file}")
  [[ -n "${response_etag}" ]] || die "Response missing ETag header"

  # Extract version and skill count in one jq call before moving the payload
  local _payload_fields
  _payload_fields=$(jq -r '[(.version // "?"), (.skills | length | tostring)] | @tsv' \
    "${payload_file}" 2>/dev/null || echo "?	?")
  local version="${_payload_fields%%$'\t'*}"
  local skill_count="${_payload_fields##*$'\t'}"
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

cmd_bootstrap() {
  require_token

  mkdir -p "${CACHE_DIR}"

  # 1. Fetch full package from Worker (with all skill file contents embedded)
  local package_json
  local headers_file
  headers_file=$(mktemp /tmp/ai-config-bootstrap-headers.XXXXXX)
  local payload_file
  payload_file=$(mktemp /tmp/ai-config-bootstrap-payload.XXXXXX)
  _CLEANUP_FILES+=("${headers_file}" "${payload_file}")

  if ! curl -sS --fail-with-body \
    -H "Authorization: Bearer ${AI_CONFIG_TOKEN}" \
    -H "Accept: application/json" \
    -D "${headers_file}" \
    -o "${payload_file}" \
    "${WORKER_URL}/v1/client/claude-code/package"; then
    local fail_status=""
    if [[ -s "${headers_file}" ]]; then
      fail_status=$(awk '/^HTTP\/[0-9]/{code=$2} END{print code}' "${headers_file}")
    fi

    local err_detail=""
    if [[ -s "${payload_file}" ]]; then
      if command -v jq &>/dev/null; then
        err_detail=$(jq -r '.message // .hint // .error // ""' "${payload_file}" 2>/dev/null || true)
      elif command -v node &>/dev/null; then
        err_detail=$(node -e "
          const fs = require('fs');
          try {
            const body = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
            process.stdout.write(body.message || body.hint || body.error || '');
          } catch (_) {}
        " "${payload_file}" 2>/dev/null || true)
      fi
    fi

    if [[ "${fail_status}" == "401" || "${fail_status}" == "403" ]]; then
      die "Authentication failed (HTTP ${fail_status}). AI_CONFIG_TOKEN is not accepted by the Worker at ${WORKER_URL}.${err_detail:+ Detail: ${err_detail}}"
    fi

    if [[ "${fail_status}" == "404" ]]; then
      die "Worker package KV is unpopulated. The release build publication step is missing; publish claude-code-package:<version> and claude-code-package:latest to KV."
    fi

    die "Failed to fetch skills package from Worker. Check token and network."
  fi
  package_json=$(cat "${payload_file}")

  # 2. Extract version and validate
  local version
  version=$(echo "${package_json}" | node -e "
    let d=''; process.stdin.resume();
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{ try { console.log(JSON.parse(d).version||''); } catch(e){} });
  " <<< "${package_json}" 2>/dev/null) || true

  if [[ -z "${version}" ]]; then
    die "Invalid package response from Worker (no version field)"
  fi

  # 3. Check idempotence: if version already installed, skip extraction
  if [[ -f "${VERSION_FILE}" ]]; then
    local cached_version
    cached_version=$(cat "${VERSION_FILE}")
    if [[ "${cached_version}" == "${version}" ]]; then
      echo "Skills already up to date (version ${version})."
      # Still run install to ensure ~/.claude/skills is populated (in case it was deleted)
      # (install is idempotent, so this is safe)
    fi
  fi

  # 4. Extract skill files from JSON package
  if ! echo "${package_json}" | node "$(dirname "$0")/lib/extract-package.mjs" "${CACHE_DIR}"; then
    die "Failed to extract package from Worker response"
  fi

  # 5. Write version marker
  mkdir -p "${CACHE_DIR}"
  printf '%s' "${version}" > "${VERSION_FILE}"

  echo "Package extracted from Worker (version ${version})."

  # 6. Install to ~/.claude/skills for slash command discovery
  cmd_install
}

cmd_install() {
  local skills_dir="${HOME}/.claude/skills"
  local version_marker="${skills_dir}/.version"

  # Read cached version
  if [[ ! -f "${VERSION_FILE}" ]]; then
    die "No cached version found. Run 'bash adapters/claude/materialise.sh extract' first."
  fi
  local cached_version
  cached_version=$(cat "${VERSION_FILE}")

  # Check if installed version matches cached version (idempotent fast path)
  if [[ -f "${version_marker}" ]]; then
    local installed_version
    installed_version=$(cat "${version_marker}")
    if [[ "${installed_version}" == "${cached_version}" ]]; then
      echo "Skills already up to date (version ${cached_version})."
      return 0
    fi
  fi

  # Ensure destination directory exists
  mkdir -p "${skills_dir}"

  # Copy individual skill directories from cache to ~/.claude/skills
  # The materialiser extracts to ${CACHE_DIR}/skills/<skill-name>/.
  # We install each skill directly to ~/.claude/skills/<skill-name>/
  # so Claude Code discovers them as slash commands.
  local cache_skills_dir="${CACHE_DIR}/skills"
  if [[ ! -d "${cache_skills_dir}" ]]; then
    die "No skills directory found in cache. Run 'bash adapters/claude/materialise.sh extract' first."
  fi

  echo "Installing skills to ${skills_dir}..."
  for skill_dir in "${cache_skills_dir}"/*; do
    if [[ -d "${skill_dir}" ]]; then
      local skill_name
      skill_name=$(basename "${skill_dir}")
      echo "  Installing: ${skill_name}"
      rm -rf "${skills_dir:?}/${skill_name}"
      cp -r "${skill_dir}" "${skills_dir}/${skill_name}"
    fi
  done

  # Update version marker
  printf '%s' "${cached_version}" > "${version_marker}"

  echo "Installation complete (version ${cached_version})."
  echo "Skills available at: ${skills_dir}"
}

# ── Dispatch ──────────────────────────────────────────────────────────────

case "${CMD}" in
  fetch)      cmd_fetch ;;
  extract)    cmd_extract ;;
  bootstrap)  cmd_bootstrap ;;
  install)    cmd_install ;;
  status)     cmd_status ;;
  help|--help|-h) cmd_help ;;
  "")         cmd_fetch ;; # default: fetch
  *)          die "Unknown command: ${CMD}. Try: fetch, bootstrap, extract, install, status, help" ;;
esac
