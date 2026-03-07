#!/usr/bin/env bash
# MCP adapter: manage MCP server entries in ~/.claude/mcp.json
# Usage: bash runtime/adapters/mcp-adapter.sh <command> [args]
# Commands: sync <merged-config-file>, add <name>, remove <name>, enable <name>, disable <name>, list
set -euo pipefail

COMMAND="${1:?Usage: mcp-adapter.sh <command> [args]}"
MCP_CONFIG="${CLAUDE_MCP_CONFIG:-$HOME/.claude/mcp.json}"

if ! command -v jq &>/dev/null; then
  echo "[error] jq required" >&2; exit 1
fi

# Atomic write helper
atomic_write() {
  local file="$1"
  local content="$2"
  local tmp="${file}.tmp.$$"
  echo "$content" > "$tmp"
  mv "$tmp" "$file"
}

# Ensure MCP config exists
ensure_mcp_config() {
  if [ ! -f "$MCP_CONFIG" ]; then
    mkdir -p "$(dirname "$MCP_CONFIG")"
    atomic_write "$MCP_CONFIG" '{"mcpServers":{}}'
  fi
}

# Resolve env vars in string (replaces ${VAR} with value)
# Uses safe indirect expansion — no eval
resolve_env() {
  local val="$1"
  while [[ "$val" =~ \$\{([A-Za-z_][A-Za-z_0-9]*)\} ]]; do
    local varname="${BASH_REMATCH[1]}"
    local varval="${!varname:-}"
    val="${val/\$\{$varname\}/$varval}"
  done
  echo "$val"
}

case "$COMMAND" in
  sync)
    MERGED_CONFIG="${2:?sync requires merged config file path}"
    ensure_mcp_config

    if ! command -v yq &>/dev/null; then
      echo "[error] yq required for sync" >&2; exit 1
    fi

    current=$(cat "$MCP_CONFIG")
    desired_mcps=$(yq '.mcps // {}' "$MERGED_CONFIG")

    # Build new mcpServers object from desired state
    new_servers=$(echo "$desired_mcps" | jq '
      to_entries |
      map(select(.value.enabled != false)) |
      map({
        key: .key,
        value: {
          command: .value.command,
          args: (.value.args // []),
          env: (.value.env // {})
        }
      }) |
      from_entries
    ')

    updated=$(echo "$current" | jq --argjson servers "$new_servers" '.mcpServers = $servers')
    atomic_write "$MCP_CONFIG" "$updated"
    echo "[ok] MCP config synced ($(echo "$new_servers" | jq 'keys | length') servers)"
    ;;

  list)
    ensure_mcp_config
    echo "MCP servers in $MCP_CONFIG:"
    jq -r '.mcpServers | to_entries[] | "  \(.key): \(.value.command) \(.value.args | join(" "))"' "$MCP_CONFIG" 2>/dev/null || echo "  (none)"
    ;;

  add)
    NAME="${2:?add requires server name}"
    COMMAND_BIN="${3:?add requires command}"
    shift 3
    ensure_mcp_config
    current=$(cat "$MCP_CONFIG")
    updated=$(echo "$current" | jq --arg name "$NAME" --arg cmd "$COMMAND_BIN" --argjson args "$(printf '%s\n' "$@" | jq -R . | jq -s .)" \
      '.mcpServers[$name] = {command: $cmd, args: $args, env: {}}')
    atomic_write "$MCP_CONFIG" "$updated"
    echo "[ok] Added MCP server: $NAME"
    ;;

  remove)
    NAME="${2:?remove requires server name}"
    ensure_mcp_config
    current=$(cat "$MCP_CONFIG")
    updated=$(echo "$current" | jq --arg name "$NAME" 'del(.mcpServers[$name])')
    atomic_write "$MCP_CONFIG" "$updated"
    echo "[ok] Removed MCP server: $NAME"
    ;;

  enable)
    NAME="${2:?enable requires server name}"
    echo "[info] MCP server enable: managed via config sync. Set enabled: true in runtime/config/"
    ;;

  disable)
    NAME="${2:?disable requires server name}"
    echo "[info] MCP server disable: managed via config sync. Set enabled: false in runtime/config/"
    ;;

  *)
    echo "[error] Unknown command: $COMMAND" >&2
    echo "Usage: mcp-adapter.sh <sync|list|add|remove|enable|disable>" >&2
    exit 1
    ;;
esac
