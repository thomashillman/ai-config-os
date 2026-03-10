#!/usr/bin/env bash
set -euo pipefail

# Install AI Config OS principles and selected skills to a Cursor .cursorrules file
# Usage: adapters/cursor/install.sh [target_dir]
# Default: current working directory ($PWD/.cursorrules)

TARGET_DIR="${1:-.}"
CURSORRULES_FILE="$TARGET_DIR/.cursorrules"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)")"
START_MARKER="# --- AI Config OS Configuration (start) ---"
END_MARKER="# --- AI Config OS Configuration (end) ---"
LEGACY_MARKER="# --- AI Config OS Configuration ---"

if [ ! -d "$TARGET_DIR" ]; then
  echo "ERROR: Target directory does not exist: $TARGET_DIR" >&2
  exit 1
fi

render_managed_block() {
  local skill_file
  local desc
  local skills_summary=""

  for skill in code-review commit-conventions debug explain-code; do
    skill_file="$REPO_ROOT/shared/skills/$skill/SKILL.md"
    if [ -f "$skill_file" ]; then
      desc=$(awk '
        BEGIN { in_frontmatter = 0 }
        /^---$/ {
          in_frontmatter++
          next
        }
        in_frontmatter == 1 && /^description:/ {
          sub(/^description:[[:space:]]*/, "")
          print
          exit
        }
      ' "$skill_file" | head -1)
      skills_summary="${skills_summary}- **$skill**: ${desc}\n"
    fi
  done

  cat <<EOF
$START_MARKER
# AI Config OS Configuration

$(cat "$REPO_ROOT/shared/principles.md" 2>/dev/null || echo "# Principles file not found")

## Available Skills from AI Config OS

$(printf '%b' "$skills_summary")
See: https://github.com/thomashillman/ai-config-os
$END_MARKER
EOF
}

strip_managed_block() {
  local file="$1"

  if [ ! -f "$file" ]; then
    return
  fi

  node - "$file" "$START_MARKER" "$END_MARKER" "$LEGACY_MARKER" <<'NODE'
const fs = require('node:fs');

const [file, startMarker, endMarker, legacyMarker] = process.argv.slice(2);
let text = fs.readFileSync(file, 'utf8');

if (text.includes(startMarker) && text.includes(endMarker)) {
  const start = text.indexOf(startMarker);
  let end = text.indexOf(endMarker, start) + endMarker.length;
  while (end < text.length && /[\r\n]/.test(text[end])) {
    end += 1;
  }
  const prefix = text.slice(0, start).replace(/\s+$/, '');
  const suffix = text.slice(end).replace(/^[\r\n]+/, '');
  text = prefix;
  if (prefix && suffix) {
    text += '\n\n';
  }
  text += suffix;
} else if (text.includes(legacyMarker)) {
  const start = text.indexOf(legacyMarker);
  text = text.slice(0, start).replace(/\s+$/, '');
  if (text) {
    text += '\n';
  }
}

fs.writeFileSync(file, text, 'utf8');
NODE
}

tmp_file="$(mktemp "${CURSORRULES_FILE}.tmp.XXXXXX")"
trap 'rm -f "$tmp_file"' EXIT

strip_managed_block "$CURSORRULES_FILE"

if [ -f "$CURSORRULES_FILE" ]; then
  cat "$CURSORRULES_FILE" > "$tmp_file"
  if [ -s "$tmp_file" ]; then
    printf '\n\n' >> "$tmp_file"
  fi
fi

render_managed_block >> "$tmp_file"
printf '\n' >> "$tmp_file"
mv "$tmp_file" "$CURSORRULES_FILE"

echo "Updated AI Config OS section in: $CURSORRULES_FILE"
exit 0
