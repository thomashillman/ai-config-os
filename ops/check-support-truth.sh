#!/usr/bin/env bash
set -euo pipefail

CANONICAL="docs/SUPPORTED_TODAY.md"
README_DOC="README.md"
PLAN_DOC="PLAN.md"

fail() {
  echo "[support-truth] ERROR: $1" >&2
  exit 1
}

info() {
  echo "[support-truth] $1"
}

[ -f "$CANONICAL" ] || fail "$CANONICAL is missing"

if ! grep -qE '^Last verified: [0-9]{4}-[0-9]{2}-[0-9]{2}$' "$CANONICAL"; then
  fail "$CANONICAL must include 'Last verified: YYYY-MM-DD'"
fi

for doc in "$README_DOC" "$PLAN_DOC"; do
  [ -f "$doc" ] || fail "$doc is missing"
  grep -qF 'docs/SUPPORTED_TODAY.md' "$doc" || fail "$doc must link to docs/SUPPORTED_TODAY.md"
done

# Prevent stale duplicated support matrices in docs outside canonical source.
# These sections previously carried support truth and now must be centralized.
if grep -qF '### Phase 1 Constraints (by design)' "$README_DOC"; then
  fail "README.md still contains Phase 1 support matrix; move support truth to $CANONICAL"
fi

if grep -qF 'The dashboard provides eight top-level tabs:' "$README_DOC"; then
  fail "README.md still enumerates dashboard support matrix; keep support truth in $CANONICAL"
fi

# Guard against repeated support-status claims in README.
# PLAN intentionally contains roadmap and historical context, so this guard stays README-only.
KNOWN_SURFACES='`(claude-code|cursor|codex|claude-web|claude-ios|claude-ssh|github-actions|gitlab-ci)`'
STATUS_WORDS='supported|unsupported|not supported|unknown|limited|compile-only'

if grep -niE "(${KNOWN_SURFACES}).{0,60}(${STATUS_WORDS})|(${STATUS_WORDS}).{0,60}(${KNOWN_SURFACES})" "$README_DOC"; then
  fail "README.md repeats support-status claims for known surfaces; keep status truth only in $CANONICAL"
fi

info "Support truth checks passed"
