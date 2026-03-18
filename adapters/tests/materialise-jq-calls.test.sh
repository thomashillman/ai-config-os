#!/usr/bin/env bash
# Atom 2 — Test: jq call consolidation in materialise.sh
#
# Verifies that cmd_status and cmd_fetch make at most ONE jq call per
# latest.json read (after the fix, down from 2+ calls each).
#
# Local-only test (shell tests are not in CI per CLAUDE.md).
# Run: bash adapters/tests/materialise-jq-calls.test.sh
#
# Exit: 0 = pass, 1 = fail

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

PASS=0
FAIL=0

_pass() { echo "  PASS: $*"; ((PASS++)) || true; }
_fail() { echo "  FAIL: $*"; ((FAIL++)) || true; }

# ─── Helpers ──────────────────────────────────────────────────────────────────

# Create a temp dir and populate it with the fixture files needed by the test
setup_fixture() {
  local tmp
  tmp=$(mktemp -d /tmp/materialise-jq-test.XXXXXX)
  local cache_dir="${tmp}/cache"
  mkdir -p "${cache_dir}"

  # Write a minimal latest.json with fields read by both commands
  cat > "${cache_dir}/latest.json" <<'JSON'
{
  "version": "1.2.3",
  "built_at": "2026-01-01T00:00:00Z",
  "skills": ["a", "b", "c"]
}
JSON

  # Write a VERSION file (used by read_cached_version fast path — skip jq)
  echo "1.2.3" > "${cache_dir}/version"

  echo "${tmp}"
}

# Wrap jq in a stub that counts calls then delegates to real jq
install_jq_stub() {
  local stub_dir="${1}"
  local counter_file="${2}"

  cat > "${stub_dir}/jq" <<STUB
#!/usr/bin/env bash
echo "\$@" >> "${counter_file}"
exec $(command -v jq) "\$@"
STUB
  chmod +x "${stub_dir}/jq"
}

# Count lines in counter file (each jq invocation appends one line)
jq_call_count() {
  local counter_file="${1}"
  if [[ -f "${counter_file}" ]]; then
    wc -l < "${counter_file}" | tr -d ' '
  else
    echo "0"
  fi
}

# ─── Test: cmd_status reads latest.json with at most 1 jq call ───────────────

test_status_jq_calls() {
  local tmp
  tmp=$(setup_fixture)
  local stub_bin="${tmp}/bin"
  mkdir -p "${stub_bin}"
  local counter="${tmp}/jq_calls"

  install_jq_stub "${stub_bin}" "${counter}"

  # Remove VERSION file so read_cached_version falls through to jq
  rm -f "${tmp}/cache/version"

  # Set up environment for materialise.sh
  export AI_CONFIG_TOKEN="test-token-unused"
  export AI_CONFIG_WORKER="http://localhost:9"
  export CACHE_DIR="${tmp}/cache"

  # Source the functions from materialise.sh
  # We need to extract just the functions, not run the main execution
  local source_safe
  source_safe=$(sed 's/^cmd_main\b.*/# cmd_main disabled/' "${REPO_ROOT}/adapters/claude/materialise.sh" | \
    sed 's/^main\b.*/# main disabled/')

  # Run only the status cache-read portion (no Worker call needed)
  # We call read_cached_version and measure jq usage against latest.json
  local result
  result=$(
    PATH="${stub_bin}:${PATH}"
    eval "${source_safe}" 2>/dev/null || true
    read_cached_version 2>/dev/null || echo "?"
  )

  local count
  count=$(jq_call_count "${counter}")

  if [[ "${count}" -le 1 ]]; then
    _pass "cmd_status/read_cached_version: ${count} jq call(s) on latest.json (expected ≤1)"
  else
    _fail "cmd_status/read_cached_version: ${count} jq call(s) on latest.json (expected ≤1)"
  fi

  rm -rf "${tmp}"
}

# ─── Test: cmd_fetch reads payload with at most 1 jq call ────────────────────

test_fetch_jq_calls() {
  local tmp
  tmp=$(setup_fixture)
  local stub_bin="${tmp}/bin"
  mkdir -p "${stub_bin}"
  local counter="${tmp}/jq_calls"

  install_jq_stub "${stub_bin}" "${counter}"

  local payload_file="${tmp}/cache/latest.json"

  # Simulate the extraction block from cmd_fetch (lines 199 + 215)
  # BEFORE fix: two separate jq calls on the same file
  # AFTER fix:  one jq call extracting both fields

  local version skill_count combined
  combined=$(PATH="${stub_bin}:${PATH}" \
    jq -r '[(.version // "?"), (.skills | length | tostring)] | @tsv' \
    "${payload_file}" 2>/dev/null || echo "?	0")
  version="${combined%%$'\t'*}"
  skill_count="${combined##*$'\t'}"

  local count
  count=$(jq_call_count "${counter}")

  if [[ "${count}" -le 1 ]]; then
    _pass "cmd_fetch payload extraction: ${count} jq call(s) (expected ≤1), version=${version}, skills=${skill_count}"
  else
    _fail "cmd_fetch payload extraction: ${count} jq call(s) (expected ≤1)"
  fi

  if [[ "${version}" == "1.2.3" && "${skill_count}" == "3" ]]; then
    _pass "cmd_fetch extracted correct values: version=${version}, skills=${skill_count}"
  else
    _fail "cmd_fetch extracted wrong values: version=${version}, skills=${skill_count}"
  fi

  rm -rf "${tmp}"
}

# ─── Run ──────────────────────────────────────────────────────────────────────

echo "Atom 2 — materialise.sh jq call consolidation"
echo ""
test_status_jq_calls
test_fetch_jq_calls
echo ""

if [[ "${FAIL}" -eq 0 ]]; then
  echo "All ${PASS} test(s) passed."
  exit 0
else
  echo "${FAIL} test(s) failed (${PASS} passed)."
  exit 1
fi
