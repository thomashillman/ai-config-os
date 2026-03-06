#!/usr/bin/env bash
# CLI adapter: check presence of CLI tools
# Usage: bash runtime/adapters/cli-adapter.sh <command> [args]
# Commands: check <tool-id>, list, sync <merged-config-file>
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
COMMAND="${1:?Usage: cli-adapter.sh <command> [args]}"
CACHE_FILE="/tmp/ai-config-os-cli-cache.$$"

# Cache CLI availability within a sync run
check_cli_cached() {
  local cmd="$1"
  if [ -f "$CACHE_FILE" ] && grep -q "^${cmd}=" "$CACHE_FILE"; then
    grep "^${cmd}=" "$CACHE_FILE" | cut -d= -f2
  else
    if command -v "$cmd" &>/dev/null; then
      echo "${cmd}=present" >> "$CACHE_FILE"
      echo "present"
    else
      echo "${cmd}=absent" >> "$CACHE_FILE"
      echo "absent"
    fi
  fi
}

trap "rm -f $CACHE_FILE" EXIT

case "$COMMAND" in
  check)
    TOOL_ID="${2:?check requires tool-id}"
    if ! command -v yq &>/dev/null; then
      echo "[error] yq required" >&2; exit 1
    fi
    cli_cmd=$(yq -r ".tools[] | select(.id == \"$TOOL_ID\") | .cli_command" "$REPO_ROOT/runtime/tool-registry.yaml")
    if [ "$cli_cmd" = "null" ] || [ -z "$cli_cmd" ]; then
      echo "[warn] No CLI command defined for tool: $TOOL_ID"
      exit 0
    fi
    status=$(check_cli_cached "$cli_cmd")
    echo "$TOOL_ID ($cli_cmd): $status"
    [ "$status" = "present" ] && exit 0 || exit 1
    ;;

  list)
    if ! command -v yq &>/dev/null; then
      echo "[error] yq required" >&2; exit 1
    fi
    echo "CLI tool status:"
    tool_count=$(yq '.tools | length' "$REPO_ROOT/runtime/tool-registry.yaml")
    for i in $(seq 0 $((tool_count - 1))); do
      id=$(yq -r ".tools[$i].id" "$REPO_ROOT/runtime/tool-registry.yaml")
      cli_cmd=$(yq -r ".tools[$i].cli_command // \"\"" "$REPO_ROOT/runtime/tool-registry.yaml")
      if [ -n "$cli_cmd" ] && [ "$cli_cmd" != "null" ]; then
        status=$(check_cli_cached "$cli_cmd")
        echo "  $id: $status"
      fi
    done
    ;;

  sync)
    echo "[info] CLI adapter sync: validates tool presence, no installation performed"
    bash "$0" list
    ;;

  *)
    echo "[error] Unknown command: $COMMAND" >&2
    exit 1
    ;;
esac
