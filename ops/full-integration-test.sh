#!/usr/bin/env bash
# End-to-end integration test for all 6 Phase 2 features
# Validates the complete system works together

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
TESTS_PASSED=0
TESTS_FAILED=0

test_step() {
  local step="$1"
  echo ""
  echo "==> $step"
}

report_test() {
  local name="$1"
  local exit_code="$2"

  if [ "$exit_code" -eq 0 ]; then
    echo "[ok] $name"
    ((TESTS_PASSED++))
  else
    echo "[FAIL] $name"
    ((TESTS_FAILED++))
  fi
}

echo "=== Phase 2 Full Integration Test ==="
echo ""
echo "Testing all 6 features working together"
echo ""

# Test 1: Structure validation (Feature 1)
test_step "Testing skill dependency validation (Feature 1)"
bash "$REPO_ROOT/ops/validate-dependencies.sh" >/dev/null 2>&1
report_test "Dependency validation" $?

# Test 2: Variant validation (Feature 2)
test_step "Testing variant definitions (Feature 2)"
bash "$REPO_ROOT/ops/validate-variants.sh" >/dev/null 2>&1
report_test "Variant validation" $?

# Test 3: Test runner (Feature 3)
test_step "Testing skill testing framework (Feature 3)"
bash "$REPO_ROOT/ops/test-skills.sh" >/dev/null 2>&1
report_test "Test runner" $?

# Test 4: Workflow validation (Feature 4)
test_step "Testing workflow composition (Feature 4)"
if [ -f "$REPO_ROOT/shared/workflows/research-mode/workflow.json" ]; then
  report_test "Workflow definition exists" 0
else
  report_test "Workflow definition exists" 1
fi

# Test 5: Documentation generation (Feature 5)
test_step "Testing auto-doc generation (Feature 5)"
if [ -f "$REPO_ROOT/shared/skills/web-search/README.md" ]; then
  report_test "Auto-generated README files" 0
else
  report_test "Auto-generated README files" 1
fi

# Test 6: Analytics infrastructure (Feature 6)
test_step "Testing analytics infrastructure (Feature 6)"
bash "$REPO_ROOT/ops/analytics-report.sh" >/dev/null 2>&1
report_test "Analytics reporter" $?

# Test 7: Plugin validation
test_step "Testing plugin structure"
bash "$REPO_ROOT/adapters/claude/dev-test.sh" 2>&1 | grep -q "Validation passed" && PLUGIN_OK=0 || PLUGIN_OK=1
report_test "Plugin validates" $PLUGIN_OK

echo ""
echo "=== Test Summary ==="
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo "[ok] All Phase 2 integration tests passed!"
  echo ""
  echo "Next steps for Phase 2 completion:"
  echo "1. Run this test to verify Phase 2 is complete"
  echo "2. Update living docs (README.md, CLAUDE.md, PLAN.md)"
  echo "3. Push to claude/review-repo-plan-JQRaf"
  exit 0
else
  echo "[ERROR] Some tests failed"
  exit 1
fi
