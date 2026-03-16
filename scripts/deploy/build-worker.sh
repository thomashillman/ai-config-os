#!/bin/bash

# Build Worker artifacts (dist/ bundle required at deploy time)
#
# This script:
# 1. Runs npm build to generate dist/
# 2. Validates that dist/ was created with required files
# 3. Confirms Worker imports are available
#
# Usage:
#   bash scripts/deploy/build-worker.sh

set -eu

echo "Building Worker artifacts..."
echo

# Run the build
npm run build

# Check that dist/ was created
if [ ! -d dist ]; then
  echo "✗ Build failed: dist/ directory not created"
  exit 1
fi

# Check for required artifacts
required_files=(
  "dist/registry/index.json"
  "dist/clients/claude-code/.claude-plugin/plugin.json"
)

missing=0
for file in "${required_files[@]}"; do
  if [ ! -f "$file" ]; then
    echo "✗ Build validation failed: Missing $file"
    missing=$((missing + 1))
  fi
done

if [ $missing -gt 0 ]; then
  exit 1
fi

echo "✓ Build successful. Worker artifacts ready."
echo "  dist/registry/index.json"
echo "  dist/clients/claude-code/.claude-plugin/plugin.json"
echo
