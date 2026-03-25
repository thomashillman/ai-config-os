#!/usr/bin/env bash
set -euo pipefail

# ---- Required inputs ----
BASE_BRANCH="${BASE_BRANCH:-main}"
PR_BRANCH="${PR_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
CURRENT_BRANCH="$PR_BRANCH"

print_escalation_report() {
  local reason="$1"
  local next_action="$2"
  local conflicted_files="${3:-none}"

  echo "STRUCTURED ESCALATION REPORT"
  echo "base branch: $BASE_BRANCH"
  echo "current branch: $CURRENT_BRANCH"
  echo "conflicted files: $conflicted_files"
  echo "likely cause of overlap: $reason"
  echo "what each side appears to be changing: branch sync/rebase state could not be safely established."
  echo "why the conflict is ambiguous: remote/base metadata is incomplete or conflict requires non-obvious intent decisions."
  echo "smallest safe next action: $next_action"
}

echo "== Pre-PR mergeability gate =="
echo "Base: $BASE_BRANCH"
echo "Head: $PR_BRANCH"

# 1) Sync + safety
if ! git remote get-url origin >/dev/null 2>&1; then
  print_escalation_report \
    "no origin remote is configured" \
    "configure origin using a trusted repository URL, then rerun this gate."
  exit 10
fi

set +e
git fetch origin --prune
FETCHRC=$?
set -e
if [[ $FETCHRC -ne 0 ]]; then
  print_escalation_report \
    "origin fetch failed" \
    "verify remote URL/access and rerun this gate."
  exit 11
fi

if ! git ls-remote --exit-code --heads origin "$BASE_BRANCH" >/dev/null 2>&1; then
  print_escalation_report \
    "base branch does not exist on origin" \
    "set BASE_BRANCH to a valid remote branch and rerun this gate."
  exit 12
fi

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
    CONFLICTED_FILES="$(git diff --name-only --diff-filter=U | paste -sd ', ' -)"
    print_escalation_report \
      "rebase onto origin/$BASE_BRANCH produced unresolved conflicts" \
      "resolve conflicted files, run git add <files> && git rebase --continue, then rerun this gate." \
      "$CONFLICTED_FILES"
    exit 3
  else
    git rebase --continue || true
  fi
fi

# 4) Repo verification (fast -> broad)
npm run -s validate
npm run -s build
npm run -s test
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
