#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
WRANGLER_TOML="$REPO_ROOT/worker/wrangler.toml"
WORKER_INDEX="$REPO_ROOT/worker/src/index.ts"

pass() {
  echo "[PASS] $1"
}

fail() {
  echo "[FAIL] $1" >&2
  exit 1
}

check_command_available() {
  local cmd="$1"
  if command -v "$cmd" >/dev/null 2>&1; then
    pass "Required command is available: $cmd"
  else
    fail "Required command is missing: $cmd. Install it and retry."
  fi
}

check_file_exists() {
  local file_path="$1"
  if [[ -f "$file_path" ]]; then
    pass "Found expected file: ${file_path#$REPO_ROOT/}"
  else
    fail "Expected file not found: ${file_path#$REPO_ROOT/}"
  fi
}

check_staging_binding_still_commented() {
  if grep -Eq '^[[:space:]]*\[env\.staging\.durable_objects\]' "$WRANGLER_TOML"; then
    fail "worker/wrangler.toml has an active [env.staging.durable_objects] block. Step 2 is unsafe until this remains commented."
  fi

  if grep -Eq '^[[:space:]]*#[[:space:]]*\[env\.staging\.durable_objects\]' "$WRANGLER_TOML"; then
    pass "Staging Durable Object binding is still commented out in worker/wrangler.toml"
  else
    fail "Could not find a commented [env.staging.durable_objects] marker in worker/wrangler.toml. Verify migration sequencing before running step 2."
  fi
}

check_staging_dual_write_flag() {
  local staging_vars_block
  staging_vars_block="$(awk '
    /^\[env\.staging\.vars\]$/ { in_block=1; next }
    /^\[/ { if (in_block) exit }
    { if (in_block) print }
  ' "$WRANGLER_TOML")"

  if [[ -z "$staging_vars_block" ]]; then
    fail "Could not read [env.staging.vars] block in worker/wrangler.toml."
  fi

  if grep -Eq '^[[:space:]]*TASK_DO_DUAL_WRITE[[:space:]]*=[[:space:]]*"false"[[:space:]]*$' <<<"$staging_vars_block"; then
    pass "Staging TASK_DO_DUAL_WRITE is still set to \"false\""
  else
    fail "worker/wrangler.toml must keep TASK_DO_DUAL_WRITE = \"false\" under [env.staging.vars] for step 2 preflight."
  fi
}

check_taskobject_export() {
  if grep -Eq "^[[:space:]]*export[[:space:]]+\{[[:space:]]*TaskObject[[:space:]]*\}[[:space:]]+from[[:space:]]+['\"]\./task-object['\"];" "$WORKER_INDEX"; then
    pass "worker/src/index.ts still exports TaskObject"
  else
    fail "worker/src/index.ts no longer exports TaskObject from ./task-object. Restore export before step 2."
  fi
}

check_clean_git_tree() {
  local status_output
  status_output="$(git -C "$REPO_ROOT" status --porcelain --untracked-files=normal)"

  if [[ -z "$status_output" ]]; then
    pass "Git working tree is clean"
  else
    echo "[FAIL] Git working tree is not clean. Commit/stash these changes before step 2:" >&2
    echo "$status_output" >&2
    exit 1
  fi
}

echo "Durable Object migration step 2 preflight"
echo "Repository: $REPO_ROOT"

check_command_available npm
check_command_available wrangler
check_file_exists "$WRANGLER_TOML"
check_file_exists "$WORKER_INDEX"
check_staging_binding_still_commented
check_staging_dual_write_flag
check_taskobject_export
check_clean_git_tree

echo "All preconditions passed. Safe to proceed with step 2."
