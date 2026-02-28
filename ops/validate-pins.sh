#!/bin/bash
# Validate skill version pins against available versions

set -e

SKILLS_DIR="shared/skills"
MANIFEST="shared/manifest.md"

echo "=== Skill Version Pin Validator ==="
echo

# Check if any skills have locked versions
found_pins=false

for skill_dir in "$SKILLS_DIR"/*/; do
    skill_name=$(basename "$skill_dir")
    skill_file="$skill_dir/SKILL.md"
    
    if [[ -f "$skill_file" ]]; then
        # Look for 'locked:' field in frontmatter
        if grep -q "^locked:" "$skill_file"; then
            found_pins=true
            locked_version=$(grep "^locked:" "$skill_file" | cut -d'"' -f2)
            actual_version=$(grep "^version:" "$skill_file" | cut -d'"' -f2)
            
            echo "Skill: $skill_name"
            echo "  Locked: $locked_version"
            echo "  Actual: $actual_version"
            
            if [[ "$locked_version" != "$actual_version" ]]; then
                echo "  ⚠️  PIN MISMATCH! Update 'locked' field or skill version"
                exit 1
            else
                echo "  ✓ Pin matches"
            fi
            echo
        fi
    fi
done

if [[ $found_pins == false ]]; then
    echo "No pinned versions found (all skills are unpinned)"
else
    echo "All pins validated ✓"
fi
