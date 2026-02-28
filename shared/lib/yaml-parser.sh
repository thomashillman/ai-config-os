#!/usr/bin/env bash
# YAML frontmatter parser utilities for SKILL.md files
# Provides functions to extract and parse YAML frontmatter from skill definitions

set -euo pipefail

# Extract YAML frontmatter from a file (text between --- markers)
# Usage: extract_frontmatter <file_path>
# Output: YAML content (without --- markers)
extract_frontmatter() {
  local file_path="$1"

  if [ ! -f "$file_path" ]; then
    echo "[error] File not found: $file_path" >&2
    return 1
  fi

  # Extract lines between first and second "---" markers
  sed -n '/^---$/,/^---$/p' "$file_path" | sed '1d;$d'
}

# Get a simple string field from YAML frontmatter
# Usage: get_yaml_field <yaml_content> <field_name>
# Output: field value (without quotes)
# Example: get_yaml_field "$frontmatter" "skill"
get_yaml_field() {
  local yaml_content="$1"
  local field="$2"

  echo "$yaml_content" | grep "^${field}:" | sed "s/^${field}:[[:space:]]*//;s/['\"]//g" | head -1
}

# Get a multiline YAML field (like description: |)
# Usage: get_yaml_multiline_field <yaml_content> <field_name>
# Output: multiline field value
get_yaml_multiline_field() {
  local yaml_content="$1"
  local field="$2"

  # Find the field and extract all following indented lines until next field
  echo "$yaml_content" | awk "
    /^${field}:[[:space:]]*\|/ { found=1; next }
    found && /^[a-z]/ { found=0 }
    found && /^[[:space:]]+/ { print }
  " | sed 's/^[[:space:]]*//'
}

# Parse simple array from YAML (like models: [opus, sonnet, haiku])
# Usage: get_yaml_array <yaml_content> <field_name>
# Output: space-separated array values
get_yaml_array() {
  local yaml_content="$1"
  local field="$2"

  echo "$yaml_content" | grep "^${field}:" | sed "s/^${field}:[[:space:]]*//;s/[\[\] ]//g;s/,/ /g"
}

# Parse list from YAML (like:
#   - name: value
#     type: string)
# Usage: get_yaml_list_field <yaml_content> <list_name> <item_field>
# Output: newline-separated values
get_yaml_list_field() {
  local yaml_content="$1"
  local list_name="$2"
  local item_field="$3"

  # Find the list section and extract the specified field from each item
  echo "$yaml_content" | awk "
    /^${list_name}:/ { in_list=1; next }
    in_list && /^[a-z]/ { in_list=0 }
    in_list && /^[[:space:]]*- ${item_field}:/ {
      print \$2
    }
  "
}

# Get dependency skill names from frontmatter
# Usage: get_skill_dependencies <yaml_content>
# Output: newline-separated dependency names
get_skill_dependencies() {
  local yaml_content="$1"

  # Extract all lines under dependencies.skills[] that have "- name:"
  # Compatible with both GAWK and mawk
  echo "$yaml_content" | awk '
    /^dependencies:/ { in_deps=1; next }
    in_deps && /^[a-z]/ { in_deps=0 }
    in_deps && /skills:/ { in_skills=1; next }
    in_skills && /^[a-z]/ { in_skills=0 }
    in_skills && /name:/ {
      sub(/.*name:[[:space:]]*/, "")
      sub(/[[:space:]].*/, "")
      if ($0) print $0
    }
  '
}

# Get variant names from frontmatter
# Usage: get_skill_variants <yaml_content>
# Output: newline-separated variant names (opus, sonnet, haiku, fallback_chain)
get_skill_variants() {
  local yaml_content="$1"

  # Extract all lines under variants: that are keys (e.g., "  opus:")
  # Compatible with both GAWK and mawk
  echo "$yaml_content" | awk '
    /^variants:/ { in_variants=1; next }
    in_variants && /^[a-z]/ && !/^  / { in_variants=0 }
    in_variants && /^  [a-z_]*:/ {
      sub(/^  /, "")
      sub(/:.*/, "")
      print
    }
  '
}

# Get test IDs from frontmatter
# Usage: get_skill_tests <yaml_content>
# Output: newline-separated test IDs
get_skill_tests() {
  local yaml_content="$1"

  # Extract all lines under tests[] that have "- id:"
  # Compatible with both GAWK and mawk
  echo "$yaml_content" | awk '
    /^tests:/ { in_tests=1; next }
    in_tests && /^[a-z]/ { in_tests=0 }
    in_tests && /^  - id:/ {
      sub(/.*id:[[:space:]]*/, "")
      sub(/[[:space:]].*/, "")
      if ($0) print $0
    }
  '
}

# Get variant prompt file path
# Usage: get_variant_prompt_file <yaml_content> <variant_name>
# Output: relative path to prompt file
get_variant_prompt_file() {
  local yaml_content="$1"
  local variant="$2"

  # Compatible with both GAWK and mawk
  echo "$yaml_content" | awk "
    /^variants:/ { in_variants=1; next }
    in_variants && /^[a-z]/ && !/^  / { in_variants=0 }
    in_variants && /^  ${variant}:/ { in_variant=1; next }
    in_variant && /^  [a-z]/ && !/^    / { in_variant=0 }
    in_variant && /prompt_file:/ {
      sub(/.*prompt_file:[[:space:]]*/, \"\")
      sub(/[[:space:]].*/, \"\")
      if (\$0) print \$0
    }
  "
}

# Check if frontmatter is valid YAML
# Usage: is_valid_yaml <yaml_content>
# Return: 0 if valid, 1 if invalid
is_valid_yaml() {
  local yaml_content="$1"

  # Simple check: no unmatched quotes, no tabs at line start
  if echo "$yaml_content" | grep -q $'^\t'; then
    return 1  # Invalid: tabs found
  fi

  # Basic quote matching (naive check)
  local single_quotes=$(echo "$yaml_content" | grep -o "'" | wc -l)
  local double_quotes=$(echo "$yaml_content" | grep -o '"' | wc -l)

  if [ $((single_quotes % 2)) -ne 0 ] || [ $((double_quotes % 2)) -ne 0 ]; then
    return 1  # Invalid: unmatched quotes
  fi

  return 0  # Valid
}

# Parse all metadata from a SKILL.md file
# Usage: parse_skill_metadata <file_path>
# Output: JSON object with all extracted metadata
parse_skill_metadata() {
  local file_path="$1"

  local frontmatter=$(extract_frontmatter "$file_path")

  if ! is_valid_yaml "$frontmatter"; then
    echo "[error] Invalid YAML in $file_path" >&2
    return 1
  fi

  local skill_name=$(get_yaml_field "$frontmatter" "skill")
  local description=$(get_yaml_field "$frontmatter" "description")
  local type=$(get_yaml_field "$frontmatter" "type")
  local status=$(get_yaml_field "$frontmatter" "status")
  local version=$(get_yaml_field "$frontmatter" "version")

  # For now, output simple format (can be enhanced to JSON if needed)
  cat <<EOF
skill_name: $skill_name
type: $type
status: $status
version: $version
description: $description
EOF
}

# Export functions for use in other scripts
export -f extract_frontmatter
export -f get_yaml_field
export -f get_yaml_multiline_field
export -f get_yaml_array
export -f get_yaml_list_field
export -f get_skill_dependencies
export -f get_skill_variants
export -f get_skill_tests
export -f get_variant_prompt_file
export -f is_valid_yaml
export -f parse_skill_metadata
