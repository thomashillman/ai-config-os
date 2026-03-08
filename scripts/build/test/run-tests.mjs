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

const __dirname = dirname(fileURLToPath(import.meta.url));

// Find all .test.mjs files in current directory
const files = readdirSync(__dirname);
const testFiles = files
  .filter(f => f.endsWith('.test.mjs'))
  .map(f => `${__dirname}/${f}`)
  .sort();

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
