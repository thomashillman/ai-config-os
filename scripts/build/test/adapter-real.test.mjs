/**
 * adapter-real.test.mjs
 *
 * Tests real adapter code at the Node.js layer: validators and shell-safe utilities.
 * This test suite focuses on portable Node.js code that runs on all platforms.
 *
 * Note: Shell script testing (mcp-adapter.sh) requires bash, jq, and yq to be
 * installed, which is not guaranteed in CI environments. Those tests are best
 * run locally during development.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateName } from '../../../runtime/mcp/validators.mjs';
import { isCommandNameSafe } from '../../../runtime/adapters/shell-safe.mjs';

// ---------------------------------------------------------------------------
// Validator + shell-safe integration (runs on all platforms)
// ---------------------------------------------------------------------------

describe('adapter-real: mcp_add validation flow', () => {
  test('valid name + valid command passes both checks', () => {
    const name = 'my-server';
    const command = 'npx';

    assert.equal(validateName(name), name);
    assert.equal(isCommandNameSafe(command), true);
  });

  test('valid name + unsafe command is caught by isCommandNameSafe', () => {
    const name = 'my-server';
    const command = '/usr/bin/evil; rm -rf /';

    assert.equal(validateName(name), name);
    assert.equal(isCommandNameSafe(command), false);
  });

  test('invalid name is caught by validateName before command check', () => {
    assert.throws(() => validateName('BAD;NAME'), /Invalid name/);
  });
});

describe('adapter-real: command validation edge cases', () => {
  test('rejects commands with path separators', () => {
    assert.equal(isCommandNameSafe('/bin/node'), false);
    assert.equal(isCommandNameSafe('../node'), false);
    assert.equal(isCommandNameSafe('bin\\node'), false);
  });

  test('rejects commands with shell metacharacters', () => {
    assert.equal(isCommandNameSafe('node; echo'), false);
    assert.equal(isCommandNameSafe('node && whoami'), false);
    assert.equal(isCommandNameSafe('node | cat'), false);
    assert.equal(isCommandNameSafe('node`id`'), false);
  });

  test('accepts valid MCP server commands', () => {
    assert.equal(isCommandNameSafe('npx'), true);
    assert.equal(isCommandNameSafe('node'), true);
    assert.equal(isCommandNameSafe('python3'), true);
    assert.equal(isCommandNameSafe('uvx'), true);
    assert.equal(isCommandNameSafe('deno'), true);
    assert.equal(isCommandNameSafe('my-custom-server'), true);
  });
});
