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

# 4. Auto-append to manifest.md
MANIFEST="$REPO_ROOT/shared/manifest.md"
if [ -f "$MANIFEST" ]; then
  # Insert a placeholder row into the skills table
  # Find the line before "## Plugins" section and insert before it
  sed -i "/^## Plugins/i | \`$SKILL_NAME\` | TODO: fill description from SKILL.md | \`shared/skills/$SKILL_NAME/SKILL.md\` |" "$MANIFEST" 2>/dev/null || {
    echo "WARNING: Could not auto-update manifest.md (check file permissions)"
  }
  echo "  → Added placeholder row to shared/manifest.md (update the description)"
fi

# 5. Run lint-skill.sh as post-scaffold check
echo ""
if bash "$REPO_ROOT/ops/lint-skill.sh" "$SKILL_NAME" 2>/dev/null; then
  echo "Frontmatter lint: OK"
else
  echo "WARNING: Frontmatter has issues. Edit SKILL.md or run:"
  echo "  bash ops/lint-skill.sh $SKILL_NAME"
fi

echo ""
echo "Next: edit SKILL.md, review manifest.md row, then run adapters/claude/dev-test.sh"
