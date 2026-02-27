#!/usr/bin/env bash
set -euo pipefail

SKILL_NAME="${1:?Usage: new-skill.sh <skill-name>}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
SHARED_DIR="$REPO_ROOT/shared/skills/$SKILL_NAME"
PLUGIN_DIR="$REPO_ROOT/plugins/core-skills/skills/$SKILL_NAME"

if [ -d "$SHARED_DIR" ]; then
  echo "Error: skill '$SKILL_NAME' already exists at $SHARED_DIR" >&2
  exit 1
fi

# 1. Create skill from template
mkdir -p "$SHARED_DIR"
sed "s/{{SKILL_NAME}}/$SKILL_NAME/g" "$REPO_ROOT/shared/skills/_template/SKILL.md" > "$SHARED_DIR/SKILL.md"

# 2. Symlink into plugin
mkdir -p "$(dirname "$PLUGIN_DIR")"
ln -s "../../../shared/skills/$SKILL_NAME" "$PLUGIN_DIR"

# 3. Bump patch version
PLUGIN_JSON="$REPO_ROOT/plugins/core-skills/.claude-plugin/plugin.json"
if command -v jq &>/dev/null; then
  CURRENT=$(jq -r '.version' "$PLUGIN_JSON")
  NEXT=$(echo "$CURRENT" | awk -F. '{printf "%d.%d.%d", $1, $2, $3+1}')
  jq --arg v "$NEXT" '.version = $v' "$PLUGIN_JSON" > "$PLUGIN_JSON.tmp" && mv "$PLUGIN_JSON.tmp" "$PLUGIN_JSON"
  echo "Bumped plugin version: $CURRENT → $NEXT"
fi

echo "Created skill '$SKILL_NAME'"
echo "  → $SHARED_DIR/SKILL.md (edit this)"
echo "  → $PLUGIN_DIR (symlink)"
echo ""
echo "Next: edit SKILL.md, update shared/manifest.md, then run adapters/claude/dev-test.sh"
