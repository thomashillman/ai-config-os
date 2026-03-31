#!/usr/bin/env node
/**
 * Test runner for cross-platform compatibility.
 * Discovers test files using Node.js fs module instead of shell glob patterns,
 * so it works on Windows CMD where *.test.mjs doesn't expand.
 *
 * Performance: pure logic tests (no dist/ interaction) run in parallel;
 * tests that compile or read from dist/ run sequentially to avoid race conditions.
 *
 * Optional CLI args: pass repo-root-relative or absolute paths to specific *.test.mjs files
 * (also deploy tests under scripts/deploy/test/). Does not run pretest/compile — ensure
 * dist/ is fresh when needed (`npm run build` or full `npm test`).
 */
import { readdirSync, existsSync, realpathSync } from 'fs';
import { readFile } from 'fs/promises';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path';
import { createRequire } from 'module';
import { resolveTestConcurrency } from './lib/test-runner-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const require = createRequire(import.meta.url);

/**
 * Resolve explicit test paths; each must exist, end with .test.mjs, and lie inside REPO_ROOT
 * (use path.relative containment — not a string prefix check).
 */
function resolveContainedTestPaths(argvArgs) {
  let repoRootReal;
  try {
    repoRootReal = realpathSync(REPO_ROOT);
  } catch {
    console.error('Could not resolve repository root');
    process.exit(1);
  }
  const files = [];
  for (const arg of argvArgs) {
    const trimmed = arg.trim();
    if (!trimmed) {
      console.error('Empty test path argument');
      process.exit(1);
    }
    const candidate = isAbsolute(trimmed) ? resolve(trimmed) : resolve(REPO_ROOT, trimmed);
    if (!existsSync(candidate)) {
      console.error(`Test file not found: ${trimmed}`);
      process.exit(1);
    }
    let real;
    try {
      real = realpathSync(candidate);
    } catch {
      console.error(`Could not resolve path: ${trimmed}`);
      process.exit(1);
    }
    const rel = relative(repoRootReal, real);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
      console.error(`Path must be inside repository: ${trimmed}`);
      process.exit(1);
    }
    if (!basename(real).endsWith('.test.mjs')) {
      console.error(`Not a *.test.mjs file: ${trimmed}`);
      process.exit(1);
    }
    files.push(real);
  }
  return [...new Set(files)].sort();
}

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

const argvArgs = process.argv.slice(2).filter(a => a.trim());
const buildTestDir = __dirname;
const deployTestDir = join(dirname(dirname(__dirname)), 'deploy', 'test');

let allTestFiles;
if (argvArgs.length > 0) {
  allTestFiles = resolveContainedTestPaths(argvArgs);
  console.log(`\n[run-tests] Explicit: ${allTestFiles.length} file(s)`);
} else {
  const buildFiles = readdirSync(buildTestDir)
    .filter(f => f.endsWith('.test.mjs'))
    .map(f => join(buildTestDir, f));

  let deployFiles = [];
  try {
    deployFiles = readdirSync(deployTestDir)
      .filter(f => f.endsWith('.test.mjs'))
      .map(f => join(deployTestDir, f));
  } catch {
    // deploy/test directory may not exist, that's ok
  }

  allTestFiles = [...buildFiles, ...deployFiles].sort();

  if (allTestFiles.length === 0) {
    console.error('No test files found');
    process.exit(1);
  }
}

// Narrow pattern: tests that INVOKE THE COMPILER (write to dist/).
// Only these need sequential execution — they re-compile, which overwrites
// files that concurrent tests might be reading.
const DIST_WRITE_PATTERN = /COMPILE_MJS|ensureFreshDist|spawnSync[^)]*compile/;

// Broad pattern: tests that read OR write dist/ (superset of DIST_WRITE_PATTERN).
// Read-only dist tests (matching broad but not narrow) can safely run in parallel
// because the pretest build has already produced a stable dist/ snapshot.
const DIST_READ_PATTERN = /DIST_DIR|['"`]dist\/clients|['"`]dist\/registry|['"`]dist\/runtime/;

// Classify each file once (single read per file, not two). Reads run in parallel.
const classifications = await Promise.all(
  allTestFiles.map(filePath =>
    readFile(filePath, 'utf8')
      .then(content => ({ filePath, isDistWriter: DIST_WRITE_PATTERN.test(content) }))
      .catch(() => ({ filePath, isDistWriter: true })) // conservative: treat unreadable as compiler-invoking
  )
);

const distTests = [];
const pureTests = [];
for (const { filePath, isDistWriter } of classifications) {
  if (isDistWriter) distTests.push(filePath);
  else pureTests.push(filePath);
}

// Pure tests run in parallel; default is platform-aware and env-overridable.
const parallelism = resolveTestConcurrency();

/**
 * Run a set of test files with node --test and the given concurrency.
 * Returns a Promise that resolves with { exitCode, durationMs }.
 */
function runTestGroup(files, concurrency) {
  return new Promise((resolve) => {
    if (files.length === 0) {
      resolve({ exitCode: 0, durationMs: 0 });
      return;
    }
    const start = Date.now();
    const proc = spawn(
      process.execPath,
      ['--test', `--test-concurrency=${concurrency}`, ...files],
      { stdio: 'inherit' }
    );
    proc.on('exit', (code) => resolve({ exitCode: code ?? 1, durationMs: Date.now() - start }));
  });
}

// Phase 1: run pure logic tests in parallel
console.log(`\n[run-tests] Phase 1: ${pureTests.length} pure tests (concurrency=${parallelism})`);
const phase1Start = Date.now();
const { exitCode: pureExitCode, durationMs: pureDurationMs } = await runTestGroup(pureTests, parallelism);
console.log(`[run-tests] Phase 1 done in ${pureDurationMs}ms`);

// Phase 2: run dist-touching tests sequentially (prevents dist/ race conditions)
console.log(`[run-tests] Phase 2: ${distTests.length} dist tests (concurrency=1)`);
const { exitCode: distExitCode, durationMs: distDurationMs } = await runTestGroup(distTests, 1);
console.log(`[run-tests] Phase 2 done in ${distDurationMs}ms`);
console.log(`[run-tests] Total: ${Date.now() - phase1Start}ms`);

process.exitCode = pureExitCode !== 0 ? pureExitCode : distExitCode;
