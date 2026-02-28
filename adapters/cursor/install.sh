#!/usr/bin/env bash
set -euo pipefail

# Install AI Config OS principles and selected skills to a Cursor .cursorrules file
# Usage: adapters/cursor/install.sh [target_dir]
# Default: current working directory ($PWD/.cursorrules)

TARGET_DIR="${1:-.}"
CURSORRULES_FILE="$TARGET_DIR/.cursorrules"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)")"

# Check if .cursorrules already exists
if [ -f "$CURSORRULES_FILE" ]; then
  # Check if AI Config OS block already present
  if grep -q "AI Config OS" "$CURSORRULES_FILE"; then
    echo "WARNING: AI Config OS section already exists in $CURSORRULES_FILE"
    echo "Skipping to avoid duplicate. Edit manually or remove the existing section."
    exit 0
  fi
  echo "Note: Appending to existing $CURSORRULES_FILE"
fi

# Read principles
PRINCIPLES=$(cat "$REPO_ROOT/shared/principles.md" 2>/dev/null || echo "# Principles file not found")

# Extract skill descriptions
SKILLS_SUMMARY=""
for skill in code-review commit-conventions debug explain-code; do
  skill_file="$REPO_ROOT/shared/skills/$skill/SKILL.md"
  if [ -f "$skill_file" ]; then
    # Extract description from frontmatter
    desc=$(awk 'BEGIN{f=0} /^---$/{f++; next} f==1 && /^description:/{f=2} f==2{print; exit}' "$skill_file" | sed 's/^description: *//' | head -1)
    SKILLS_SUMMARY+="- **$skill**: $desc\n"
  fi
done

# Append block to .cursorrules
{
  echo ""
  echo "# --- AI Config OS Configuration ---"
  echo ""
  echo "$PRINCIPLES"
  echo ""
  echo "## Available Skills from AI Config OS"
  echo ""
  printf "$SKILLS_SUMMARY"
  echo ""
  echo "See: https://github.com/thomashillman/ai-config-os"
} >> "$CURSORRULES_FILE"

echo "✓ AI Config OS section added to: $CURSORRULES_FILE"
exit 0
