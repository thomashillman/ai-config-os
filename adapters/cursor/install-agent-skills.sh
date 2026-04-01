#!/usr/bin/env bash
# Install every Cursor-compatible skill from the build output into Cursor's
# Agent Skills discovery path (~/.cursor/skills or a project path).
#
# Source skills live in shared/skills/; the compiler filters by platform
# (e.g. hook-only skills may be excluded for cursor). Installed count matches
# dist/clients/cursor/skills/, not raw shared/skills/ count.
#
# Usage:
#   bash adapters/cursor/install-agent-skills.sh
#   bash adapters/cursor/install-agent-skills.sh --no-build
#   bash adapters/cursor/install-agent-skills.sh --dest "$PWD/.cursor/skills"
#
# Env:
#   CURSOR_SKILLS_DIR — default install directory (default: $HOME/.cursor/skills)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
NO_BUILD=0
DEST="${CURSOR_SKILLS_DIR:-$HOME/.cursor/skills}"

usage() {
  cat <<'USAGE'
Usage: bash adapters/cursor/install-agent-skills.sh [--no-build] [--dest DIR]

  --no-build   Skip compile; use existing dist/clients/cursor/skills
  --dest DIR   Install into DIR (default: $CURSOR_SKILLS_DIR or ~/.cursor/skills)

Env: CURSOR_SKILLS_DIR — default destination when --dest is omitted
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --no-build)
      NO_BUILD=1
      shift
      ;;
    --dest)
      if [ -z "${2:-}" ]; then
        echo "ERROR: --dest requires a path" >&2
        exit 1
      fi
      DEST="$2"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

SRC="$REPO_ROOT/dist/clients/cursor/skills"

if [ "$NO_BUILD" = 0 ]; then
  echo "==> Building Cursor client (dist/clients/cursor/skills)..."
  (cd "$REPO_ROOT" && node scripts/build/compile.mjs)
fi

if [ ! -d "$SRC" ]; then
  echo "ERROR: Missing $SRC — run: npm run build" >&2
  exit 1
fi

mkdir -p "$DEST"
count=0
for d in "$SRC"/*/; do
  [ -d "$d" ] || continue
  name="$(basename "$d")"
  rm -rf "${DEST:?}/$name"
  cp -R "$d" "$DEST/$name"
  count=$((count + 1))
done

echo "Installed $count skill(s) into: $DEST"
echo "Restart Cursor (or reload window) so Agent picks up skill changes."
