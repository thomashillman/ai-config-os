#!/bin/bash

##
# Validate task command store implementation
#
# Step 5: Build hardening - runs all authoritative-path validation checks
# Fails fast if any check fails, ensuring drift is caught at build time.
#
# Checks:
# 1. Command envelope structure stability
# 2. Service contract signatures
# 3. Worker TypeScript compilation
# 4. Unit tests for command, context, apply-command, projection
#

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS_DIR="$ROOT_DIR/scripts"
WORKER_DIR="$ROOT_DIR/worker"

echo "=========================================="
echo "Task Command Store Validation"
echo "=========================================="
echo

# Step 1: Validate command envelope structure
echo "[1/4] Validating command envelope structure..."
node "$SCRIPTS_DIR/validate/task-command-envelope-drift.mjs"
if [ $? -ne 0 ]; then
  echo "✗ Envelope drift validation failed"
  exit 1
fi
echo

# Step 2: Validate service signatures
echo "[2/4] Validating service contract signatures..."
node "$SCRIPTS_DIR/validate/task-command-store-signatures.mjs"
if [ $? -ne 0 ]; then
  echo "✗ Service signature validation failed"
  exit 1
fi
echo

# Step 3: TypeScript compilation check
echo "[3/4] Checking TypeScript compilation..."
cd "$WORKER_DIR"
npm run check:test-types > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "✗ TypeScript compilation failed"
  cd "$ROOT_DIR"
  exit 1
fi
echo "✓ TypeScript compilation clean"
echo

# Step 4: Run authoritative-path tests
echo "[4/4] Running authoritative-path tests..."
npm run test -- --reporter=verbose \
  "src/__tests__/task-command.test.ts" \
  "src/__tests__/task-mutation-context.test.ts" \
  "src/__tests__/task-object-apply-command.test.ts" \
  "src/__tests__/task-projection-reconcile.test.ts" \
  "src/__tests__/task-projection-integration.test.ts" \
  > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "✗ Authoritative-path tests failed"
  cd "$ROOT_DIR"
  exit 1
fi
echo "✓ All authoritative-path tests passed"
echo

cd "$ROOT_DIR"

echo "=========================================="
echo "✓ All task command store validations passed"
echo "=========================================="
echo
echo "Summary:"
echo "  • Command envelope structure: valid"
echo "  • Service contract signatures: stable"
echo "  • TypeScript compilation: clean"
echo "  • Authoritative-path tests: passing"
echo
echo "Ready for deployment"
exit 0
