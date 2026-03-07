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

test('compile.mjs --validate-only exits 0 against real skills', () => {
  const result = spawnSync(
    process.execPath,
    [COMPILE_MJS, '--validate-only'],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );

  if (result.status !== 0) {
    console.error('--- compiler stdout ---');
    console.error(result.stdout);
    console.error('--- compiler stderr ---');
    console.error(result.stderr);
  }

  assert.equal(result.status, 0, `Compiler exited with status ${result.status}`);

  const output = result.stdout + result.stderr;
  const errorLines = output.split('\n').filter(l => l.includes('[error]'));
  assert.equal(
    errorLines.length,
    0,
    `Expected no [error] lines, found:\n${errorLines.join('\n')}`
  );
});

test('compile.mjs --validate-only reports skills and platforms loaded', () => {
  const result = spawnSync(
    process.execPath,
    [COMPILE_MJS, '--validate-only'],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );

  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('Validated:'), 'Expected "Validated:" summary line');
  assert.ok(result.stdout.includes('Loaded'), 'Expected "Loaded N platform(s)" line');
});
