#!/usr/bin/env bash
# Auto-generate skill documentation from SKILL.md frontmatter
# - Creates README.md files for each skill
# - Updates shared/manifest.md with skill metadata

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SHARED_SKILLS="${REPO_ROOT}/shared/skills"
MANIFEST_FILE="${REPO_ROOT}/shared/manifest.md"

echo "==> Auto-generating skill documentation..."
echo ""

generated_count=0

for skill_dir in "$SHARED_SKILLS"/*; do
  if [ ! -d "$skill_dir" ] || [ "$(basename "$skill_dir")" = "_template" ]; then
    continue
  fi

  skill_name=$(basename "$skill_dir")
  skill_md="${skill_dir}/SKILL.md"
  readme_file="${skill_dir}/README.md"

  if [ ! -f "$skill_md" ]; then
    continue
  fi

  # Extract basic info from SKILL.md for README
  # In Phase 2b, this will use YAML parser to extract full metadata
  description=$(sed -n '/^description:/,/^[a-z]/p' "$skill_md" | head -2 | tail -1 | sed 's/^[[:space:]]*//;s/|$//')

  # Generate basic README
  cat > "$readme_file" <<EOF
# $skill_name

$description

## Quick Start

See \`SKILL.md\` for full skill definition including:
- Input/output specification
- Multi-model variants (Opus, Sonnet, Haiku)
- Test definitions
- Performance metrics
- Dependency requirements

## File Structure

\`\`\`
$skill_name/
├── SKILL.md              # Full skill definition with frontmatter
├── README.md             # This file (auto-generated)
└── prompts/              # Variant-specific prompts
    ├── detailed.md       # Opus variant
    ├── balanced.md       # Sonnet variant (default)
    └── brief.md          # Haiku variant
\`\`\`

## Integration

This skill is available through the core-skills plugin and can be:
- Invoked directly by Claude Code
- Composed into workflows
- Used with different model variants
- Monitored for performance metrics

---

*This README was auto-generated from SKILL.md frontmatter. Edit the SKILL.md file, then run \`ops/generate-docs.sh\` to update.*
EOF

  echo "[ok] Generated: $skill_name/README.md"
  ((generated_count++))
done

echo ""
echo "[info] Generated $generated_count README files"
echo "[info] Next: update $MANIFEST_FILE with skills table"
echo "[info] Note: Phase 2b will enhance YAML parsing for full metadata extraction"

exit 0
