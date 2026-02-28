#!/usr/bin/env bash
set -euo pipefail

# Validate a skill's frontmatter by name
# Usage: lint-skill.sh <skill-name>
# Exit 0: OK, Exit 1: errors found

SKILL_NAME="${1:?Usage: lint-skill.sh <skill-name>}"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)")"
SKILL_FILE="$REPO_ROOT/shared/skills/$SKILL_NAME/SKILL.md"

ERRORS=0
WARNINGS=0

# Check file exists
if [ ! -f "$SKILL_FILE" ]; then
  echo "ERROR: $SKILL_FILE not found" >&2
  exit 1
fi

# Extract frontmatter (content between first pair of --- lines)
# Use awk to split on --- and capture the first section
FRONTMATTER=$(awk 'BEGIN{f=0} /^---$/{f++; next} f==1{print}' "$SKILL_FILE" | head -200)

if [ -z "$FRONTMATTER" ]; then
  echo "ERROR: No frontmatter found (missing --- delimiters)" >&2
  exit 1
fi

# Helper: check if a field exists in frontmatter
field_exists() {
  local field="$1"
  echo "$FRONTMATTER" | grep -q "^$field:" && return 0 || return 1
}

# Helper: extract field value
field_value() {
  local field="$1"
  echo "$FRONTMATTER" | grep "^$field:" | head -1 | sed "s/^$field: *//;s/['\"]//g"
}

# Check required fields
for field in skill description type status version; do
  if ! field_exists "$field"; then
    echo "ERROR: missing required field '$field'" >&2
    ERRORS=$((ERRORS+1))
  fi
done

# Validate type
if field_exists "type"; then
  TYPE=$(field_value "type")
  if ! echo "$TYPE" | grep -qE "^(prompt|hook|agent|workflow-blueprint)$"; then
    echo "ERROR: invalid type '$TYPE' (expected: prompt|hook|agent|workflow-blueprint)" >&2
    ERRORS=$((ERRORS+1))
  fi
else
  TYPE=""
fi

# Validate status
if field_exists "status"; then
  STATUS=$(field_value "status")
  if ! echo "$STATUS" | grep -qE "^(stable|experimental|deprecated)$"; then
    echo "ERROR: invalid status '$STATUS' (expected: stable|experimental|deprecated)" >&2
    ERRORS=$((ERRORS+1))
  fi
else
  STATUS=""
fi

# Validate version (semver X.Y.Z)
if field_exists "version"; then
  VERSION=$(field_value "version")
  if ! echo "$VERSION" | grep -qE "^[0-9]+\.[0-9]+\.[0-9]+$"; then
    echo "ERROR: invalid version '$VERSION' (expected semver X.Y.Z)" >&2
    ERRORS=$((ERRORS+1))
  fi
else
  VERSION=""
fi

# Validate skill dependencies exist
# Extract only the dependencies.skills section (look for "skills:" under "dependencies:")
# Use awk to find the right section, respecting indentation
if echo "$FRONTMATTER" | grep -q "^dependencies:"; then
  # Get lines from "dependencies:" to the next top-level key (4 spaces or less indent from start)
  # Then extract from "skills:" onwards
  deps_section=$(echo "$FRONTMATTER" | awk '
    /^dependencies:/{f=1; next}
    f && /^[^ ]/{f=0}
    f
  ')

  # Now extract from "skills:" within that section
  skills_section=$(echo "$deps_section" | awk '
    /^  skills:/{f=1; next}
    f && /^  [a-z]+:/{f=0}
    f
  ')

  # Parse list items (lines starting with "    - name:")
  while IFS= read -r line; do
    if [[ "$line" =~ ^[[:space:]]*-[[:space:]]*name:[[:space:]]*([^ ]+) ]]; then
      dep_name="${BASH_REMATCH[1]}"
      [ -z "$dep_name" ] && continue
      if [ ! -d "$REPO_ROOT/shared/skills/$dep_name" ]; then
        echo "ERROR: dependency '$dep_name' not found in shared/skills/" >&2
        ERRORS=$((ERRORS+1))
      fi
    fi
  done < <(echo "$skills_section" | grep "name:")
fi

# For prompt type: check variant prompt files exist
if [ "$TYPE" = "prompt" ]; then
  SKILL_DIR="$REPO_ROOT/shared/skills/$SKILL_NAME"
  # Check for variant blocks (opus, sonnet, haiku) and their prompt_file references
  for variant in opus sonnet haiku; do
    # Try to find prompt_file for this variant
    # Look for lines like "    prompt_file: prompts/detailed.md"
    prompt_file=$(echo "$FRONTMATTER" | awk "/^  $variant:/{f=1; next} f && /^  [a-z-]+:/{f=0} f && /prompt_file:/{print; exit}" | sed 's/.*prompt_file: *//;s/[[:space:]]*$//')

    if [ -n "$prompt_file" ]; then
      if [ ! -f "$SKILL_DIR/$prompt_file" ]; then
        echo "WARNING: prompt file '$prompt_file' not found for variant '$variant'" >&2
        WARNINGS=$((WARNINGS+1))
      fi
    fi
  done
fi

# Summary
if [ $ERRORS -gt 0 ]; then
  echo "FAIL: $SKILL_NAME — $ERRORS error(s), $WARNINGS warning(s)" >&2
  exit 1
fi

if [ $WARNINGS -gt 0 ]; then
  echo "OK: $SKILL_NAME (with $WARNINGS warning(s))"
else
  echo "OK: $SKILL_NAME"
fi

exit 0
