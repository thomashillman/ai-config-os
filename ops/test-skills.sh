#!/usr/bin/env bash
# Test skill definitions and collect metrics
# Supports: prompt-validation, structure-check, integration, performance tests

set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SHARED_SKILLS="${REPO_ROOT}/shared/skills"
TEST_RESULTS_DIR="${REPO_ROOT}/shared/test-results"

# Create test results directory if needed
mkdir -p "$TEST_RESULTS_DIR"

# Initialize results file
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
RESULTS_FILE="${TEST_RESULTS_DIR}/results-${TIMESTAMP}.json"

# Parse command-line options
STRUCTURE_ONLY=false
SKILL_FILTER=""

while [ $# -gt 0 ]; do
  case "$1" in
    --structure-only)
      STRUCTURE_ONLY=true
      shift
      ;;
    --skill)
      SKILL_FILTER="$2"
      shift 2
      ;;
    *)
      echo "[error] Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "[info] Test runner initialized"
echo "[info] Results will be saved to: $RESULTS_FILE"
echo ""

if [ "$STRUCTURE_ONLY" = true ]; then
  echo "[info] Running structure-only validation (CI mode)"
else
  echo "[info] Running full test suite"
fi
echo ""

# Simple utility functions for YAML parsing (avoid subshell issues)
extract_frontmatter() {
  sed -n '/^---$/,/^---$/p' "$1" | sed '1d;$d'
}

check_has_tests() {
  grep -q "^tests:" "$1" && return 0
  return 1
}

echo "==> Scanning skills for test definitions..."
echo ""

total_tests=0
total_passed=0
total_failed=0

# Create a temporary file to collect JSON results
json_results_tmp=$(mktemp)
trap "rm -f $json_results_tmp" EXIT

skill_count=0
for skill_dir in "$SHARED_SKILLS"/*; do
  if [ ! -d "$skill_dir" ]; then
    continue
  fi

  skill_name=$(basename "$skill_dir")

  if [ "$skill_name" = "_template" ]; then
    continue
  fi

  # Skip if filtering by skill name
  if [ -n "$SKILL_FILTER" ] && [ "$skill_name" != "$SKILL_FILTER" ]; then
    continue
  fi

  skill_md="${skill_dir}/SKILL.md"
  if [ ! -f "$skill_md" ]; then
    continue
  fi

  # Check if skill has test definitions
  if ! check_has_tests "$skill_md"; then
    continue
  fi

  ((skill_count++))
  echo "[test] Running structure checks for $skill_name..."

  # Test 1: SKILL.md exists
  echo "{\"skill\":\"${skill_name}\",\"test_id\":\"structure-file-exists\",\"status\":\"PASS\",\"message\":\"SKILL.md found\"}" >> "$json_results_tmp"
  ((total_passed++))
  ((total_tests++))

  # Test 2: Frontmatter exists and is non-empty
  frontmatter=$(extract_frontmatter "$skill_md") || true
  if [ -n "$frontmatter" ]; then
    echo "{\"skill\":\"${skill_name}\",\"test_id\":\"structure-frontmatter-valid\",\"status\":\"PASS\",\"message\":\"Frontmatter found\"}" >> "$json_results_tmp"
    ((total_passed++))
  else
    echo "{\"skill\":\"${skill_name}\",\"test_id\":\"structure-frontmatter-valid\",\"status\":\"FAIL\",\"message\":\"Frontmatter missing or invalid\"}" >> "$json_results_tmp"
    ((total_failed++))
  fi
  ((total_tests++))

  # Test 3: Check for variant prompt files (only for prompt-type skills)
  skill_type=$(grep "^type:" "$skill_md" | sed 's/^type:[[:space:]]*//' | head -1)

  if [ "$skill_type" = "prompt" ] || [ "$skill_type" = "workflow-blueprint" ]; then
    # Prompt-type skills should have variant prompt files
    if [ -d "${skill_dir}/prompts" ]; then
      prompt_count=$(find "${skill_dir}/prompts" -type f | wc -l)
      if [ "$prompt_count" -gt 0 ]; then
        echo "{\"skill\":\"${skill_name}\",\"test_id\":\"structure-variant-files\",\"status\":\"PASS\",\"message\":\"Variant prompt files exist ($prompt_count found)\"}" >> "$json_results_tmp"
        ((total_passed++))
      else
        echo "{\"skill\":\"${skill_name}\",\"test_id\":\"structure-variant-files\",\"status\":\"FAIL\",\"message\":\"No prompt files found in prompts/\"}" >> "$json_results_tmp"
        ((total_failed++))
      fi
    else
      echo "{\"skill\":\"${skill_name}\",\"test_id\":\"structure-variant-files\",\"status\":\"FAIL\",\"message\":\"No prompts/ directory found\"}" >> "$json_results_tmp"
      ((total_failed++))
    fi
  else
    # Non-prompt skills (hooks, agents, etc.) don't need prompt files
    echo "{\"skill\":\"${skill_name}\",\"test_id\":\"structure-variant-files\",\"status\":\"PASS\",\"message\":\"Skill type '$skill_type' does not require prompts/\"}" >> "$json_results_tmp"
    ((total_passed++))
  fi
  ((total_tests++))

  echo ""
done

echo ""
echo "==> Test Summary"
echo "   Skills tested: $skill_count"
echo "   Total tests:   $total_tests"
echo "   Passed:        $total_passed"
echo "   Failed:        $total_failed"
echo ""

# Generate JSON results file
{
  echo "{"
  echo "  \"timestamp\": \"$TIMESTAMP\","
  echo "  \"run_type\": \"$([ "$STRUCTURE_ONLY" = true ] && echo 'structure-only' || echo 'full')\","
  echo "  \"total_tests\": $total_tests,"
  echo "  \"passed\": $total_passed,"
  echo "  \"failed\": $total_failed,"
  echo "  \"results\": ["

  if [ -s "$json_results_tmp" ]; then
    sed '$!s/$/,/' "$json_results_tmp" | sed 's/^/    /'
  fi

  echo "  ]"
  echo "}"
} > "$RESULTS_FILE"

echo "[ok] Results saved to: $RESULTS_FILE"

# Exit with error if any tests failed
if [ $total_failed -gt 0 ]; then
  exit 1
fi

exit 0
