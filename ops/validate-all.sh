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

echo ""
if [ "$failed" -eq 0 ]; then
  echo "==> All validation stages passed! ✓"
  exit 0
else
  echo "==> $failed stage(s) failed"
  exit 1
fi
