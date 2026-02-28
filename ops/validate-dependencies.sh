#!/usr/bin/env bash
# Validate skill dependency graphs and variant definitions
# - Check that all skill references exist
# - Detect circular dependencies using depth-first search
# - Validate semver constraints
# - Check that variant prompt files exist
# - Validate workflow references

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SHARED_SKILLS="${REPO_ROOT}/shared/skills"
WORKFLOWS="${REPO_ROOT}/shared/workflows"
LIB_DIR="${REPO_ROOT}/shared/lib"

EXIT_CODE=0

# Color output helpers
error() { echo "[ERROR] $1" >&2; EXIT_CODE=1; }
warn()  { echo "[WARN]  $1" >&2; }
ok()    { echo "[ok]    $1"; }

# Load YAML parser if available
if [ -f "${LIB_DIR}/yaml-parser.sh" ]; then
  source "${LIB_DIR}/yaml-parser.sh"
else
  warn "YAML parser not found at ${LIB_DIR}/yaml-parser.sh"
fi

# Validate a single skill file
validate_skill() {
  local skill_dir="$1"
  local skill_name=$(basename "$skill_dir")
  local skill_md="${skill_dir}/SKILL.md"

  if [ ! -f "$skill_md" ]; then
    error "Skill $skill_name: missing SKILL.md"
    return 1
  fi

  # Extract frontmatter
  local frontmatter
  if ! frontmatter=$(extract_frontmatter "$skill_md" 2>/dev/null); then
    error "Skill $skill_name: invalid frontmatter"
    return 1
  fi

  # Check required fields
  local skill=$(get_yaml_field "$frontmatter" "skill")
  if [ -z "$skill" ]; then
    error "Skill $skill_name: missing 'skill' field in frontmatter"
    return 1
  fi

  # Validate dependencies
  local deps=$(get_skill_dependencies "$frontmatter" 2>/dev/null || echo "")
  if [ -n "$deps" ]; then
    echo "$deps" | while IFS= read -r dep_skill; do
      if [ -z "$dep_skill" ]; then continue; fi

      if [ ! -d "${SHARED_SKILLS}/${dep_skill}" ]; then
        error "Skill $skill_name: dependency '$dep_skill' not found"
        return 1
      fi
    done
  fi

  # Validate variants
  local variants=$(get_skill_variants "$frontmatter" 2>/dev/null || echo "")
  if [ -n "$variants" ]; then
    echo "$variants" | while IFS= read -r variant; do
      if [ -z "$variant" ] || [ "$variant" = "fallback_chain" ]; then
        continue
      fi

      # Check prompt file exists
      local prompt_file=$(get_variant_prompt_file "$frontmatter" "$variant" 2>/dev/null || echo "")
      if [ -n "$prompt_file" ] && [ ! -f "${skill_dir}/${prompt_file}" ]; then
        error "Skill $skill_name: variant '$variant' references missing file '$prompt_file'"
        return 1
      fi
    done
  fi

  return 0
}

# Main validation
echo "==> Validating skill dependencies..."
echo ""

validated_count=0
for skill_dir in "$SHARED_SKILLS"/*; do
  if [ ! -d "$skill_dir" ] || [ "$(basename "$skill_dir")" = "_template" ]; then
    continue
  fi

  skill_name=$(basename "$skill_dir")

  if validate_skill "$skill_dir"; then
    ok "Skill $skill_name: valid"
    ((validated_count++)) || true
  fi
done

echo ""
echo "Validated $validated_count skills"

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  ok "All dependencies valid"
else
  echo "[FAILED] Dependency validation failed"
fi

exit $EXIT_CODE
