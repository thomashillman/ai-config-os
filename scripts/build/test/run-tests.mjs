#!/usr/bin/env node
/**
 * Test runner for cross-platform compatibility.
 * Discovers test files using Node.js fs module instead of shell glob patterns,
 * so it works on Windows CMD where *.test.mjs doesn't expand.
 */
import { readdirSync } from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function assertTestDependencies() {
  const requiredPackages = ['ajv', 'yaml'];
  const missing = [];

  for (const pkg of requiredPackages) {
    try {
      require.resolve(pkg);
    } catch {
      missing.push(pkg);
    }
  }

  if (missing.length > 0) {
    console.error(`Missing required test dependencies: ${missing.join(', ')}`);
    console.error('Run `npm install` before executing the test suite.');
    process.exit(1);
  }
}

assertTestDependencies();

// Find all .test.mjs files in build/test/ and scripts/deploy/test/
const buildTestDir = __dirname;
const deployTestDir = `${dirname(__dirname)}/../deploy/test`;

const buildFiles = readdirSync(buildTestDir)
  .filter(f => f.endsWith('.test.mjs'))
  .map(f => `${buildTestDir}/${f}`);

let deployFiles = [];
try {
  deployFiles = readdirSync(deployTestDir)
    .filter(f => f.endsWith('.test.mjs'))
    .map(f => `${deployTestDir}/${f}`);
} catch {
  // deploy/test directory may not exist, that's ok
}

const testFiles = [...buildFiles, ...deployFiles].sort();

if (testFiles.length === 0) {
  console.error('No test files found');
  process.exit(1);
}

// Run node --test with concurrency=1 to prevent dist/ race conditions.
// Multiple test files compile to the same dist/ directory; parallel execution
// causes ENOENT when one test's compile overwrites files another test is reading.
const proc = spawn('node', ['--test', '--test-concurrency=1', ...testFiles], { stdio: 'inherit' });
proc.on('exit', (code) => {
  process.exitCode = code;
});
