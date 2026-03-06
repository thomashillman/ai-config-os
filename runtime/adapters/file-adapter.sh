#!/usr/bin/env bash
# File adapter: manage file-based tool configs (.cursorrules etc.)
# Usage: bash runtime/adapters/file-adapter.sh <command> [args]
# Commands: sync <merged-config-file>, check <tool-id>
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
COMMAND="${1:?Usage: file-adapter.sh <command> [args]}"

case "$COMMAND" in
  sync)
    echo "[info] File adapter sync: no file-based tools require sync in current config"
    ;;

  check)
    TOOL_ID="${2:?check requires tool-id}"
    if ! command -v yq &>/dev/null; then
      echo "[error] yq required" >&2; exit 1
    fi
    path=$(yq -r ".tools[] | select(.id == \"$TOOL_ID\") | .paths.rules // \"\"" "$REPO_ROOT/runtime/tool-registry.yaml")
    if [ -z "$path" ] || [ "$path" = "null" ]; then
      echo "[warn] No file path defined for tool: $TOOL_ID"
      exit 0
    fi
    expanded_path="${path/#\~/$HOME}"
    [ -f "$expanded_path" ] && echo "$TOOL_ID: present ($expanded_path)" || echo "$TOOL_ID: absent ($expanded_path)"
    ;;

  *)
    echo "[error] Unknown command: $COMMAND" >&2
    exit 1
    ;;
esac
