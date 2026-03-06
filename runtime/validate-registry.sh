#!/usr/bin/env bash
# Validate tool-registry.yaml structure
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
REGISTRY="$REPO_ROOT/runtime/tool-registry.yaml"

if ! command -v yq &>/dev/null; then
  echo "[error] yq required" >&2; exit 1
fi

if [ ! -f "$REGISTRY" ]; then
  echo "[error] tool-registry.yaml not found" >&2; exit 1
fi

errors=0

# Check each tool has required fields
tool_count=$(yq '.tools | length' "$REGISTRY")
for i in $(seq 0 $((tool_count - 1))); do
  id=$(yq -r ".tools[$i].id" "$REGISTRY")
  adapter=$(yq -r ".tools[$i].adapter" "$REGISTRY")

  if [ "$id" = "null" ] || [ -z "$id" ]; then
    echo "[error] Tool $i missing id" >&2
    errors=$((errors + 1))
  fi

  if [ "$adapter" = "null" ] || [ -z "$adapter" ]; then
    echo "[error] Tool $i ($id) missing adapter" >&2
    errors=$((errors + 1))
  fi

  # Validate adapter type
  if ! echo "$adapter" | grep -qE "^(cli|file|shell)$"; then
    echo "[error] Tool $i ($id) has invalid adapter type: $adapter" >&2
    errors=$((errors + 1))
  fi
done

if [ $errors -eq 0 ]; then
  echo "[ok] Tool registry valid ($tool_count tools)"
else
  echo "[error] Registry validation failed ($errors errors)" >&2
  exit 1
fi
