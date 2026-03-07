#!/usr/bin/env bash
# Single validation entry point - runs all validators and reports status

cd "$(git rev-parse --show-toplevel)" || exit 1

echo ""
echo "==> Comprehensive Validation Suite"
echo ""

failed=0

# Step 1: Dependencies
echo "Step 1: Validating dependencies..."
if ./ops/validate-dependencies.sh > /tmp/val-deps.out 2>&1; then
  echo "  ✓ Pass"
else
  echo "  ✗ Fail"
  ((failed++))
fi

# Step 2: Variants
echo "Step 2: Validating variants..."
if ./ops/validate-variants.sh > /tmp/val-vars.out 2>&1; then
  echo "  ✓ Pass"
else
  echo "  ✗ Fail"
  ((failed++))
fi

# Step 3: Tests
echo "Step 3: Running structure tests..."
if ./ops/test-skills.sh --structure-only > /tmp/val-tests.out 2>&1; then
  echo "  ✓ Pass"
else
  echo "  ✗ Fail"
  ((failed++))
fi

# Step 4: Docs
echo "Step 4: Checking documentation..."
if ./ops/check-docs.sh > /tmp/val-docs.out 2>&1; then
  echo "  ✓ Pass"
else
  echo "  ✗ Fail"
  ((failed++))
fi

# Step 5: Plugin
echo "Step 5: Validating plugin structure..."
if claude plugin validate . > /tmp/val-plugin.out 2>&1; then
  echo "  ✓ Pass"
else
  echo "  ✗ Fail"
  ((failed++))
fi

# Step 6: Tool registry
echo "Step 6: Validating tool registry..."
if ./runtime/validate-registry.sh > /tmp/val-registry.out 2>&1; then
  echo "  ✓ Pass"
else
  echo "  ✗ Fail"
  ((failed++))
fi

# Step 7: Runtime dry-run
echo "Step 7: Runtime sync dry-run..."
if ./runtime/sync.sh --dry-run > /tmp/val-sync.out 2>&1; then
  echo "  ✓ Pass"
else
  echo "  ✗ Fail (non-blocking)"
  # Not incremented: sync failure is a warning in CI, not a hard block
fi

# Step 8: Capability probe (non-blocking)
echo "Step 8: Running capability probe..."
if ./ops/capability-probe.sh --quiet > /tmp/val-probe.out 2>&1; then
  echo "  ✓ Pass"
else
  echo "  ✗ Fail (non-blocking)"
  # Not incremented: probe failure is informational only
fi

echo ""
if [ "$failed" -eq 0 ]; then
  echo "==> All validation stages passed! ✓"
  exit 0
else
  echo "==> $failed stage(s) failed"
  exit 1
fi
