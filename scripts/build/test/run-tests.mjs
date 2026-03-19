#!/usr/bin/env node
/**
 * Test runner for cross-platform compatibility.
 * Discovers test files using Node.js fs module instead of shell glob patterns,
 * so it works on Windows CMD where *.test.mjs doesn't expand.
 *
 * Performance: pure logic tests (no dist/ interaction) run in parallel;
 * tests that compile or read from dist/ run sequentially to avoid race conditions.
 */
import { readdirSync, readFileSync } from 'fs';
import { spawn } from 'child_process';
import { cpus } from 'os';
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

const allTestFiles = [...buildFiles, ...deployFiles].sort();

if (allTestFiles.length === 0) {
  console.error('No test files found');
  process.exit(1);
}

// Narrow pattern: tests that INVOKE THE COMPILER (write to dist/).
// Only these need sequential execution — they re-compile, which overwrites
// files that concurrent tests might be reading.
const DIST_WRITE_PATTERN = /COMPILE_MJS|ensureFreshDist|spawnSync[^)]*compile/;

// Broad pattern: tests that read OR write dist/ (superset of DIST_WRITE_PATTERN).
// Read-only dist tests (matching broad but not narrow) can safely run in parallel
// because the pretest build has already produced a stable dist/ snapshot.
const DIST_READ_PATTERN = /DIST_DIR|['"`]dist\/clients|['"`]dist\/registry|['"`]dist\/runtime/;

function writesToDist(filePath) {
  try {
    return DIST_WRITE_PATTERN.test(readFileSync(filePath, 'utf8'));
  } catch {
    return true; // conservative: treat unreadable files as compiler-invoking
  }
}

const distTests = allTestFiles.filter(writesToDist);
const pureTests = allTestFiles.filter(f => !writesToDist(f));

// Pure tests run in parallel; configurable via TEST_CONCURRENCY env var (default: min(cpus, 4))
const envConcurrency = parseInt(process.env.TEST_CONCURRENCY, 10);
const parallelism = Math.max(1, envConcurrency > 0 ? envConcurrency : Math.min(cpus().length, 4));

/**
 * Run a set of test files with node --test and the given concurrency.
 * Returns a Promise that resolves with the exit code.
 */
function runTestGroup(files, concurrency) {
  return new Promise((resolve) => {
    if (files.length === 0) {
      resolve(0);
      return;
    }
    const proc = spawn(
      process.execPath,
      ['--test', `--test-concurrency=${concurrency}`, ...files],
      { stdio: 'inherit' }
    );
    proc.on('exit', resolve);
  });
}

// Phase 1: run pure logic tests in parallel
const pureExitCode = await runTestGroup(pureTests, parallelism);

// Phase 2: run dist-touching tests sequentially (prevents dist/ race conditions)
const distExitCode = await runTestGroup(distTests, 1);

process.exitCode = pureExitCode !== 0 ? pureExitCode : distExitCode;
