#!/usr/bin/env bash
set -euo pipefail

# Print a table of all skills with their metadata
# Shows: name, type, status, variants (opus/sonnet/haiku), test count

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)")"
SKILLS_DIR="$REPO_ROOT/shared/skills"

# Print header
printf "%-22s %-12s %-12s %-8s %-8s %-8s %-6s\n" "SKILL" "TYPE" "STATUS" "OPUS" "SONNET" "HAIKU" "TESTS"
printf "%-22s %-12s %-12s %-8s %-8s %-8s %-6s\n" "$(printf '%*s' 22 | tr ' ' '-')" "$(printf '%*s' 12 | tr ' ' '-')" "$(printf '%*s' 12 | tr ' ' '-')" "$(printf '%*s' 8 | tr ' ' '-')" "$(printf '%*s' 8 | tr ' ' '-')" "$(printf '%*s' 8 | tr ' ' '-')" "$(printf '%*s' 6 | tr ' ' '-')"

# Iterate over all skill directories
for skill_dir in "$SKILLS_DIR"/*/; do
  skill_name=$(basename "$skill_dir")

  # Skip template
  [ "$skill_name" = "_template" ] && continue

  skill_file="$skill_dir/SKILL.md"
  [ ! -f "$skill_file" ] && continue

  # Extract frontmatter
  frontmatter=$(awk 'BEGIN{f=0} /^---$/{f++; next} f==1{print}' "$skill_file" | head -200)

  # Extract type (strip comments and quotes)
  type=$(echo "$frontmatter" | grep "^type:" | head -1 | sed 's/^type: *//;s/ *#.*//' | tr -d "\"'")
  [ -z "$type" ] && type="?"

  # Extract status (strip comments and quotes)
  status=$(echo "$frontmatter" | grep "^status:" | head -1 | sed 's/^status: *//;s/ *#.*//' | tr -d "\"'")
  [ -z "$status" ] && status="?"

  # Check for variants (look for "  opus:", "  sonnet:", "  haiku:" at start of line with 2 spaces)
  opus=$(echo "$frontmatter" | grep -q "^  opus:" && echo "✓" || echo "-")
  sonnet=$(echo "$frontmatter" | grep -q "^  sonnet:" && echo "✓" || echo "-")
  haiku=$(echo "$frontmatter" | grep -q "^  haiku:" && echo "✓" || echo "-")

  # Count tests (lines starting with "  - id:")
  test_count=$(echo "$frontmatter" | grep "^  - id:" | wc -l | tr -d ' ')
  [ -z "$test_count" ] && test_count="0"

  # Print row
  printf "%-22s %-12s %-12s %-8s %-8s %-8s %-6s\n" "$skill_name" "$type" "$status" "$opus" "$sonnet" "$haiku" "$test_count"
done

exit 0
