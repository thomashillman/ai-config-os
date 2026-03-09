#!/usr/bin/env bash
# Sync subsystem: cache remote/local manifest and changed docs/bundles.
# Usage: bash runtime/sync-subsystem.sh run <merged-config-file> [--force] [--verbose]
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
COMMAND="${1:-run}"
MERGED_CONFIG="${2:-}"
FORCE=false
VERBOSE=false

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
    --verbose) VERBOSE=true ;;
  esac
done

log() { [ "$VERBOSE" = true ] && echo "[sync-subsystem] $1" || true; }
info() { echo "[sync-subsystem] $1"; }

require_yq() {
  if ! command -v yq >/dev/null 2>&1; then
    echo "[error] yq is required for sync subsystem" >&2
    exit 1
  fi
}

read_sync_value() {
  local expr="$1"
  local fallback="$2"
  local value
  value=$(yq -r "$expr // \"$fallback\"" "$MERGED_CONFIG" 2>/dev/null || echo "$fallback")
  printf '%s' "$value"
}

fetch_http_manifest() {
  local manifest_url="$1"
  local previous_etag="$2"
  local body_file="$3"
  local headers_file="$4"

  if [ -n "$previous_etag" ] && [ "$previous_etag" != "null" ]; then
    curl -sSL -D "$headers_file" -H "If-None-Match: $previous_etag" -w "%{http_code}" "$manifest_url" -o "$body_file"
  else
    curl -sSL -D "$headers_file" -w "%{http_code}" "$manifest_url" -o "$body_file"
  fi
}

fetch_local_manifest() {
  local manifest_source="$1"
  local output_file="$2"
  if [[ "$manifest_source" =~ ^file:// ]]; then
    cp "${manifest_source#file://}" "$output_file"
  elif [ -f "$manifest_source" ]; then
    cp "$manifest_source" "$output_file"
  elif [ -f "$REPO_ROOT/$manifest_source" ]; then
    cp "$REPO_ROOT/$manifest_source" "$output_file"
  else
    echo "[error] Local manifest not found: $manifest_source" >&2
    exit 1
  fi
}

sync_entry_content() {
  local source="$1"
  local target="$2"

  mkdir -p "$(dirname "$target")"
  if [[ "$source" =~ ^https?:// ]]; then
    curl -fsSL "$source" -o "$target"
  elif [[ "$source" =~ ^file:// ]]; then
    cp "${source#file://}" "$target"
  elif [ -f "$source" ]; then
    cp "$source" "$target"
  elif [ -f "$REPO_ROOT/$source" ]; then
    cp "$REPO_ROOT/$source" "$target"
  else
    echo "[error] Sync source not found: $source" >&2
    exit 1
  fi
}

recompute_artifacts() {
  local cache_dir="$1"
  local merged_config="$2"

  if bash "$REPO_ROOT/ops/capability-probe.sh" --quiet >"$cache_dir/capability-profile.json" 2>/dev/null; then
    log "Capability profile refreshed"
  else
    echo "{\"status\":\"error\",\"message\":\"capability probe failed\"}" >"$cache_dir/capability-profile.json"
  fi

  cp "$merged_config" "$cache_dir/effective-contracts.yaml"
}

run_sync() {
  if [ -z "$MERGED_CONFIG" ] || [ ! -f "$MERGED_CONFIG" ]; then
    echo "[error] run requires merged config file" >&2
    exit 1
  fi

  require_yq

  local enabled manifest_source interval_minutes cache_dir outcome_file state_file
  enabled=$(read_sync_value '.sync.enabled' 'false')
  if [ "$enabled" != "true" ]; then
    log "Sync subsystem disabled in merged config (.sync.enabled != true)"
    exit 0
  fi

  manifest_source=$(read_sync_value '.sync.manifest' '')
  if [ -z "$manifest_source" ]; then
    echo "[error] sync.manifest is required when sync subsystem is enabled" >&2
    exit 1
  fi

  interval_minutes=$(read_sync_value '.sync.interval_minutes' '5')
  cache_dir=$(read_sync_value '.sync.cache_dir' "$REPO_ROOT/runtime/cache/sync")
  outcome_file="$cache_dir/outcome.yaml"
  state_file="$cache_dir/state.yaml"

  mkdir -p "$cache_dir/docs" "$cache_dir/bundles"
  [ -f "$state_file" ] || echo '{}' > "$state_file"

  local now_epoch last_checked elapsed required_seconds
  now_epoch=$(date +%s)
  last_checked=$(yq -r '.last_checked // 0' "$state_file" 2>/dev/null || echo 0)
  elapsed=$((now_epoch - last_checked))
  required_seconds=$((interval_minutes * 60))

  if [ "$FORCE" != true ] && [ "$elapsed" -lt "$required_seconds" ]; then
    log "Skipping check (elapsed ${elapsed}s < ${required_seconds}s interval)"
    exit 0
  fi

  local prev_etag manifest_tmp headers_tmp manifest_changed=false
  prev_etag=$(yq -r '.manifest.etag // ""' "$state_file" 2>/dev/null || echo "")
  manifest_tmp=$(mktemp /tmp/ai-config-os-remote-manifest.XXXXXX.yaml)
  headers_tmp=$(mktemp /tmp/ai-config-os-remote-manifest.XXXXXX.headers)
  trap 'rm -f "$manifest_tmp" "$headers_tmp"' RETURN

  if [[ "$manifest_source" =~ ^https?:// ]]; then
    local http_code
    http_code=$(fetch_http_manifest "$manifest_source" "$prev_etag" "$manifest_tmp" "$headers_tmp")
    if [ "$http_code" = "304" ]; then
      log "Manifest unchanged via ETag"
      yq -i ".last_checked = $now_epoch" "$state_file"
      exit 0
    fi
    if [ "$http_code" != "200" ]; then
      echo "[error] Failed to fetch remote manifest from $manifest_source (HTTP $http_code)" >&2
      exit 1
    fi
  else
    fetch_local_manifest "$manifest_source" "$manifest_tmp"
  fi

  local manifest_version manifest_etag
  manifest_version=$(yq -r '.version // ""' "$manifest_tmp" 2>/dev/null || echo "")
  manifest_etag=$(awk 'BEGIN{IGNORECASE=1} /^etag:/{gsub("\r","",$2); print $2}' "$headers_tmp" | tail -n1)
  if [ -z "$manifest_etag" ]; then
    manifest_etag=$(sha256sum "$manifest_tmp" | awk '{print $1}')
  fi

  local prev_version
  prev_version=$(yq -r '.manifest.version // ""' "$state_file" 2>/dev/null || echo "")
  if [ "$manifest_etag" != "$prev_etag" ] || [ "$manifest_version" != "$prev_version" ]; then
    manifest_changed=true
  fi

  cp "$manifest_tmp" "$cache_dir/manifest.yaml"

  local docs_changed=0
  local bundles_changed=0

  if [ "$manifest_changed" = true ]; then
    local docs_len bundles_len
    docs_len=$(yq '.docs | length' "$manifest_tmp" 2>/dev/null || echo 0)
    for ((i=0; i<docs_len; i++)); do
      local doc_id doc_source doc_version prev_doc_version target_file
      doc_id=$(yq -r ".docs[$i].id // \"doc-$i\"" "$manifest_tmp")
      doc_source=$(yq -r ".docs[$i].source // .docs[$i].url // .docs[$i].path // \"\"" "$manifest_tmp")
      doc_version=$(yq -r ".docs[$i].version // .docs[$i].etag // \"\"" "$manifest_tmp")
      prev_doc_version=$(yq -r ".items.docs.\"$doc_id\".version // \"\"" "$state_file" 2>/dev/null || echo "")
      if [ "$doc_version" != "$prev_doc_version" ] || [ -z "$doc_version" ]; then
        target_file="$cache_dir/docs/$doc_id"
        sync_entry_content "$doc_source" "$target_file"
        docs_changed=$((docs_changed + 1))
        yq -i ".items.docs.\"$doc_id\" = {version: \"$doc_version\", source: \"$doc_source\", cached_at: \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" "$state_file" 2>/dev/null || true
      fi
    done

    bundles_len=$(yq '.bundles | length' "$manifest_tmp" 2>/dev/null || echo 0)
    for ((i=0; i<bundles_len; i++)); do
      local bundle_id bundle_source bundle_version prev_bundle_version bundle_target
      bundle_id=$(yq -r ".bundles[$i].id // \"bundle-$i\"" "$manifest_tmp")
      bundle_source=$(yq -r ".bundles[$i].source // .bundles[$i].url // .bundles[$i].path // \"\"" "$manifest_tmp")
      bundle_version=$(yq -r ".bundles[$i].version // .bundles[$i].etag // \"\"" "$manifest_tmp")
      prev_bundle_version=$(yq -r ".items.bundles.\"$bundle_id\".version // \"\"" "$state_file" 2>/dev/null || echo "")
      if [ "$bundle_version" != "$prev_bundle_version" ] || [ -z "$bundle_version" ]; then
        bundle_target="$cache_dir/bundles/$bundle_id"
        sync_entry_content "$bundle_source" "$bundle_target"
        bundles_changed=$((bundles_changed + 1))
        yq -i ".items.bundles.\"$bundle_id\" = {version: \"$bundle_version\", source: \"$bundle_source\", cached_at: \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" "$state_file" 2>/dev/null || true
      fi
    done

    yq -o=yaml '.routes // {}' "$manifest_tmp" > "$cache_dir/route-docs.yaml" 2>/dev/null || echo "{}" > "$cache_dir/route-docs.yaml"
    yq -o=yaml '.tools // {}' "$manifest_tmp" > "$cache_dir/tool-docs.yaml" 2>/dev/null || echo "{}" > "$cache_dir/tool-docs.yaml"

    recompute_artifacts "$cache_dir" "$MERGED_CONFIG"
  fi

  cat > "$outcome_file" <<OUTCOME
updated_at: "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
manifest_changed: $manifest_changed
docs_changed: $docs_changed
bundles_changed: $bundles_changed
source: "$manifest_source"
OUTCOME

  yq -i ".last_checked = $now_epoch |
    .manifest.version = \"$manifest_version\" |
    .manifest.etag = \"$manifest_etag\" |
    .manifest.source = \"$manifest_source\"" "$state_file"

  info "Sync subsystem complete (manifest_changed=$manifest_changed docs_changed=$docs_changed bundles_changed=$bundles_changed)"
}

case "$COMMAND" in
  run)
    run_sync
    ;;
  *)
    echo "[error] Unknown command: $COMMAND" >&2
    exit 1
    ;;
esac
