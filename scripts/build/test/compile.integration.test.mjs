/**
 * compile.integration.test.mjs
 * Integration test: runs the real compiler against shared/skills/ and asserts
 * it exits cleanly with no errors.
 *
 * Run with: node --test scripts/build/test/compile.integration.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const COMPILE_MJS = resolve(__dirname, '..', 'compile.mjs');

// Run compiler once; both tests share the result.
const compileResult = spawnSync(
  process.execPath,
  [COMPILE_MJS, '--validate-only'],
  { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60_000 }
);

test('compile.mjs --validate-only exits 0 against real skills', () => {
  if (compileResult.status !== 0) {
    console.error('--- compiler stdout ---');
    console.error(compileResult.stdout);
    console.error('--- compiler stderr ---');
    console.error(compileResult.stderr);
  }

  assert.equal(compileResult.status, 0, `Compiler exited with status ${compileResult.status}`);

  const output = compileResult.stdout + compileResult.stderr;
  const errorLines = output.split('\n').filter(l => l.includes('[error]'));
  assert.equal(
    errorLines.length,
    0,
    `Expected no [error] lines, found:\n${errorLines.join('\n')}`
  );
});

test('compile.mjs --validate-only reports skills and platforms loaded', () => {
  assert.equal(compileResult.status, 0, `Compiler exited with status ${compileResult.status}`);
  assert.ok(compileResult.stdout.includes('Validated:'), 'Expected "Validated:" summary line');
  assert.ok(compileResult.stdout.includes('Loaded'), 'Expected "Loaded N platform(s)" line');
});
