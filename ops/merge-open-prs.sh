#!/usr/bin/env bash
set -euo pipefail

DEFAULT_BASE="main"
MERGE_METHOD="squash"

usage() {
  cat <<USAGE
Usage: $(basename "$0") [--base <branch>] [--method <merge|squash|rebase>] [--include-drafts]

Sequentially merges all open PRs using GitHub CLI. If a PR merge fails due to conflicts,
the script rebases the PR branch on top of origin/<base>, pushes the rebased branch,
and retries the merge.
USAGE
}

INCLUDE_DRAFTS=false
BASE_BRANCH="$DEFAULT_BASE"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      BASE_BRANCH="${2:-}"
      shift 2
      ;;
    --method)
      MERGE_METHOD="${2:-}"
      shift 2
      ;;
    --include-drafts)
      INCLUDE_DRAFTS=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh CLI is required." >&2
  exit 1
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Error: must run inside a git repository." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree is dirty. Commit or stash changes before running." >&2
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Error: git remote 'origin' is not configured." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Error: gh is not authenticated. Run 'gh auth login'." >&2
  exit 1
fi

FILTER='.[]'
if [[ "$INCLUDE_DRAFTS" != true ]]; then
  FILTER='.[] | select(.isDraft == false)'
fi

mapfile -t PRS < <(gh pr list --state open --limit 200 --json number,headRefName,baseRefName,isDraft \
  --jq "$FILTER | [.number, .headRefName, .baseRefName] | @tsv")

if [[ ${#PRS[@]} -eq 0 ]]; then
  echo "No open PRs to merge."
  exit 0
fi

ORIGINAL_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

git fetch origin "$BASE_BRANCH"

merge_one_pr() {
  local number="$1"
  local head_branch="$2"
  local base_branch="$3"

  echo "---"
  echo "Processing PR #$number ($head_branch -> $base_branch)"

  if gh pr merge "$number" --"$MERGE_METHOD" --delete-branch; then
    echo "Merged PR #$number"
    return 0
  fi

  if [[ "$base_branch" != "$BASE_BRANCH" ]]; then
    echo "PR #$number targets '$base_branch', not '$BASE_BRANCH'; skipping conflict recovery."
    return 1
  fi

  echo "Initial merge failed; attempting conflict recovery via rebase onto origin/$BASE_BRANCH"

  git fetch origin "$head_branch" "$BASE_BRANCH"
  git checkout -B "$head_branch" "origin/$head_branch"

  if git rebase "origin/$BASE_BRANCH"; then
    git push --force-with-lease origin "$head_branch"
  else
    echo "Rebase has conflicts. Attempting automatic conflict resolution."
    while git diff --name-only --diff-filter=U | grep -q .; do
      while IFS= read -r conflicted; do
        [[ -z "$conflicted" ]] && continue
        case "$conflicted" in
          *.lock|*package-lock.json|*pnpm-lock.yaml)
            git checkout --ours -- "$conflicted"
            ;;
          *)
            git checkout --theirs -- "$conflicted"
            ;;
        esac
        git add "$conflicted"
      done < <(git diff --name-only --diff-filter=U)

      if ! git rebase --continue; then
        if git diff --name-only --diff-filter=U | grep -q .; then
          continue
        fi
        git rebase --abort
        echo "Could not resolve conflicts for PR #$number automatically."
        return 1
      fi
    done

    git push --force-with-lease origin "$head_branch"
  fi

  git checkout "$ORIGINAL_BRANCH"

  echo "Retrying merge for PR #$number"
  gh pr merge "$number" --"$MERGE_METHOD" --delete-branch
}

failed=0
for row in "${PRS[@]}"; do
  number="$(awk '{print $1}' <<<"$row")"
  head="$(awk '{print $2}' <<<"$row")"
  base="$(awk '{print $3}' <<<"$row")"

  if ! merge_one_pr "$number" "$head" "$base"; then
    echo "Failed to merge PR #$number"
    failed=$((failed + 1))
  fi

done

git checkout "$ORIGINAL_BRANCH"

if [[ "$failed" -gt 0 ]]; then
  echo "$failed PR(s) failed to merge."
  exit 1
fi

echo "All PRs merged successfully."
