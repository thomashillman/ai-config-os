#!/usr/bin/env bash
# ops/check-docs.sh — post-change doc checklist
# Run before committing to see which docs the staged changes are expected to touch.
set -euo pipefail

STAGED=$(git diff --cached --name-only 2>/dev/null || git diff --name-only HEAD 2>/dev/null || true)

warn() { echo "  [check] $1"; }
ok()   { echo "  [ok]    $1"; }

echo ""
echo "==> Living docs checklist"
echo ""

# Skill changes => manifest.md
if echo "$STAGED" | grep -q 'shared/skills/'; then
  if echo "$STAGED" | grep -q 'shared/manifest.md'; then
    ok "shared/manifest.md updated alongside skill changes"
  else
    warn "Skill files changed — did you update shared/manifest.md?"
  fi
fi

# New top-level dir or ops script => README + CLAUDE.md
if echo "$STAGED" | grep -qE '^ops/|^adapters/|^plugins/'; then
  if echo "$STAGED" | grep -q 'README.md'; then
    ok "README.md updated alongside structural changes"
  else
    warn "Structural files changed — does README.md directory table need updating?"
  fi
  if echo "$STAGED" | grep -q 'CLAUDE.md'; then
    ok "CLAUDE.md updated alongside structural changes"
  else
    warn "Structural files changed — does CLAUDE.md Structure section need updating?"
  fi
fi

# plugin.json version bump => confirm skill content also changed
if echo "$STAGED" | grep -q 'plugin.json'; then
  if echo "$STAGED" | grep -q 'shared/skills/'; then
    ok "plugin.json bumped alongside skill content change"
  else
    warn "plugin.json version changed without skill content — intentional?"
  fi
fi

echo ""
echo "==> Done. Fix any [check] warnings before committing."
echo ""
