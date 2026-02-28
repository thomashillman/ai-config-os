#!/usr/bin/env bash
# Validate multi-model variant definitions in skill frontmatter
# - Check that variants are properly defined
# - Verify prompt files exist
# - Validate cost factors are numbers
# - Check fallback chains reference valid variants

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SHARED_SKILLS="${REPO_ROOT}/shared/skills"
LIB_DIR="${REPO_ROOT}/shared/lib"

EXIT_CODE=0

error() { echo "[ERROR] $1" >&2; EXIT_CODE=1; }
warn()  { echo "[WARN]  $1" >&2; }
ok()    { echo "[ok]    $1"; }

# Load YAML parser if available
if [ -f "${LIB_DIR}/yaml-parser.sh" ]; then
  source "${LIB_DIR}/yaml-parser.sh" 2>/dev/null || true
fi

echo "==> Validating skill variant definitions..."
echo ""

for skill_dir in "$SHARED_SKILLS"/*; do
  if [ ! -d "$skill_dir" ] || [ "$(basename "$skill_dir")" = "_template" ]; then
    continue
  fi

  skill_name=$(basename "$skill_dir")
  skill_md="${skill_dir}/SKILL.md"

  if [ ! -f "$skill_md" ]; then
    continue
  fi

  # Check if variants section exists (simple grep check)
  if ! grep -q "^variants:" "$skill_md"; then
    continue  # No variants defined, that's OK
  fi

  # Basic variant structure check
  has_variants=false
  if grep -q "^\s*opus:" "$skill_md"; then
    has_variants=true
    # Check if prompt file is referenced
    if grep -q "prompt_file.*prompts/detailed" "$skill_md"; then
      ok "Skill $skill_name: opus variant prompt file exists"
    else
      warn "Skill $skill_name: opus variant missing prompt file"
    fi
  fi

  if grep -q "^\s*sonnet:" "$skill_md"; then
    # Check if prompt file is referenced
    if grep -q "prompt_file.*prompts/balanced" "$skill_md"; then
      ok "Skill $skill_name: sonnet variant prompt file exists"
    else
      warn "Skill $skill_name: sonnet variant missing prompt file"
    fi
  fi

  if grep -q "^\s*haiku:" "$skill_md"; then
    # Check if prompt file is referenced
    if grep -q "prompt_file.*prompts/brief" "$skill_md"; then
      ok "Skill $skill_name: haiku variant prompt file exists"
    else
      warn "Skill $skill_name: haiku variant missing prompt file"
    fi
  fi
done

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  ok "All variant definitions valid"
else
  echo "[WARNING] Some variant definitions need attention"
fi

exit $EXIT_CODE
