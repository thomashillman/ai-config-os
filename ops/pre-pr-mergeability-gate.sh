#!/usr/bin/env bash
set -euo pipefail

# ---- Required inputs ----
BASE_BRANCH="${BASE_BRANCH:-main}"
PR_BRANCH="${PR_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"

echo "== Pre-PR mergeability gate =="
echo "Base: $BASE_BRANCH"
echo "Head: $PR_BRANCH"

# 1) Sync + safety
git fetch origin --prune
git checkout "$PR_BRANCH"
git status --porcelain
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: Working tree not clean. Commit/stash first."
  exit 2
fi

# 2) Enable recorded conflict reuse (safe auto-resolution for repeated conflicts)
git config rerere.enabled true
git config rerere.autoupdate true

# 3) Rebase onto latest base (preferred for linear PR branches)
set +e
git rebase "origin/$BASE_BRANCH"
REBASERC=$?
set -e

if [[ $REBASERC -ne 0 ]]; then
  echo "Rebase has conflicts. Attempting rerere-assisted resolution state..."
  # If rerere could resolve, continue; otherwise stop for manual resolution
  if git diff --name-only --diff-filter=U | grep -q .; then
    echo "UNRESOLVED FILES:"
    git diff --name-only --diff-filter=U
    echo "STOP: Manual conflict resolution required."
    echo "After resolving: git add <files> && git rebase --continue"
    exit 3
  else
    git rebase --continue || true
  fi
fi

# 4) Repo verification (fast -> broad)
npm run -s validate
npm run -s build
# Root/node:test suite for build + validation contracts
npm run -s test
# Explicit split lanes: worker Vitest suite and standalone validator node:test suite
npm run -s test:worker
npm run -s test:validators
npm run -s verify

# 5) Explicit conflict-marker guard
if rg -n "(^<{7}|^={7}|^>{7})" --glob '!**/node_modules/**' . ; then
  echo "ERROR: Conflict markers found."
  exit 4
fi

# 6) Final mergeability preview against base
echo "Diff summary vs base:"
git diff --stat "origin/$BASE_BRANCH"...HEAD

echo "PASS: Branch is rebased, verified, and ready to open/update PR."
echo "Suggested push:"
echo "git push origin HEAD:$PR_BRANCH --force-with-lease"