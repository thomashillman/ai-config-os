#!/bin/bash

##
# Validate routing policy implementation
#
# Step 5: Build hardening - runs all routing policy validation checks
# Fails fast if any check fails, ensuring drift is caught at build time.
#
# Checks:
# 1. Route registry schema stability
# 2. Model path registry schema stability
# 3. ExecutionSelection identity contract stability
# 4. Version field constraints (major-only)
# 5. Narrowing operations constraints (only narrow, never widen)
# 6. Routing policy integration tests
#

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS_DIR="$ROOT_DIR/scripts"

echo "=========================================="
echo "Routing Policy Validation"
echo "=========================================="
echo

# Step 1: Validate routing policy contracts
echo "[1/2] Validating routing policy contracts..."
node "$SCRIPTS_DIR/validate/routing-policy-drift.mjs"
if [ $? -ne 0 ]; then
  echo "✗ Routing policy drift validation failed"
  exit 1
fi
echo

# Step 2: Run routing policy validator tests
echo "[2/2] Running routing policy validator tests..."
node --test "$ROOT_DIR/scripts/build/test/routing-policy-drift.test.mjs" > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "✗ Routing policy tests failed"
  exit 1
fi
echo "✓ All routing policy tests passed"
echo

echo "=========================================="
echo "✓ All routing policy validations passed"
echo "=========================================="
echo
echo "Summary:"
echo "  • Route registry schema: stable"
echo "  • Model path registry schema: stable"
echo "  • ExecutionSelection identity: stable"
echo "  • Version field constraints: enforced"
echo "  • Narrowing operations: verified"
echo "  • Validator tests: passing"
echo
echo "Ready for deployment"
exit 0
