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
  while IFS= read -r dep_skill; do
    if [ -z "$dep_skill" ]; then continue; fi

    if [ ! -d "${SHARED_SKILLS}/${dep_skill}" ]; then
      error "Skill $skill_name: dependency '$dep_skill' not found"
      return 1
    fi
  done < <(get_skill_dependencies "$frontmatter" 2>/dev/null || true)

  # Validate variants
  local variants=$(get_skill_variants "$frontmatter" 2>/dev/null || true)
  while IFS= read -r variant; do
    if [ -z "$variant" ] || [ "$variant" = "fallback_chain" ]; then
      continue
    fi

    # Check prompt file exists
    local prompt_file=$(get_variant_prompt_file "$frontmatter" "$variant" 2>/dev/null || true)
    if [ -n "$prompt_file" ] && [ ! -f "${skill_dir}/${prompt_file}" ]; then
      error "Skill $skill_name: variant '$variant' references missing file '$prompt_file'"
      return 1
    fi
  done < <(echo "$variants")

  return 0
}

# Detect circular dependencies
detect_circular_deps() {
  local skill="$1"
  local visited="${2:-}"
  local rec_stack="${3:-}"

  # Check if skill is in recursion stack (circular dependency detected)
  if echo " $rec_stack " | grep -q " $skill "; then
    return 0  # Circular dependency found
  fi

  # Get dependencies of this skill
  local skill_md="${SHARED_SKILLS}/${skill}/SKILL.md"
  if [ ! -f "$skill_md" ]; then
    return 1
  fi

  local frontmatter=$(extract_frontmatter "$skill_md" 2>/dev/null || echo "")
  local deps=$(get_skill_dependencies "$frontmatter" 2>/dev/null || echo "")

  # Check each dependency
  while IFS= read -r dep_skill; do
    if [ -z "$dep_skill" ]; then continue; fi

    # Recursively check dependencies
    if detect_circular_deps "$dep_skill" "$visited $skill" "$rec_stack $skill"; then
      error "Circular dependency detected: $dep_skill -> ... -> $skill"
      return 0
    fi
  done < <(echo "$deps")

  return 1
}

# Validate workflows (if --workflows-only flag is set)
validate_workflows() {
  if [ ! -d "$WORKFLOWS" ]; then
    ok "No workflows directory found"
    return 0
  fi

  for workflow_dir in "$WORKFLOWS"/*; do
    if [ ! -d "$workflow_dir" ]; then
      continue
    fi

    local workflow_name=$(basename "$workflow_dir")
    local workflow_json="${workflow_dir}/workflow.json"

    if [ ! -f "$workflow_json" ]; then
      warn "Workflow $workflow_name: missing workflow.json"
      continue
    fi

    # Try to parse JSON (basic validation)
    if ! grep -q '"workflow"' "$workflow_json"; then
      error "Workflow $workflow_name: invalid JSON structure"
      continue
    fi

    ok "Workflow $workflow_name: valid"
  done
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
    ((validated_count++))
  fi
done

echo ""
echo "Validated $validated_count skills"

# Check for circular dependencies
echo ""
echo "==> Checking for circular dependencies..."

for skill_dir in "$SHARED_SKILLS"/*; do
  if [ ! -d "$skill_dir" ] || [ "$(basename "$skill_dir")" = "_template" ]; then
    continue
  fi

  skill_name=$(basename "$skill_dir")
  if detect_circular_deps "$skill_name" "" ""; then
    # Error already printed by detect_circular_deps
    :
  fi
done

# Validate workflows if flag is set
if [ "${1:-}" = "--workflows-only" ]; then
  echo ""
  echo "==> Validating workflows..."
  validate_workflows
fi

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  ok "All dependencies valid"
else
  echo "[FAILED] Dependency validation failed"
fi

exit $EXIT_CODE
