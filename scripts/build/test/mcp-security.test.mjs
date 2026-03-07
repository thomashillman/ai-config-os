/**
 * mcp-security.test.mjs
 * Security smoke tests for MCP server input validation.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Import validators (standalone module, no heavy MCP deps)
import { validateName, validateNumber } from '../../../runtime/mcp/validators.mjs';

// ---------------------------------------------------------------------------
// validateName
// ---------------------------------------------------------------------------

describe('validateName — rejects shell metacharacters', () => {
  const malicious = [
    '; rm -rf /',
    'foo; whoami',
    'test$(id)',
    'test`id`',
    'foo | cat /etc/passwd',
    'foo & bg',
    'foo\nbar',
    '../../../etc/passwd',
    '',
    ' ',
    'UPPERCASE',
    '-starts-with-dash',
  ];

  for (const input of malicious) {
    test(`rejects: ${JSON.stringify(input)}`, () => {
      assert.throws(() => validateName(input), /Invalid name/);
    });
  }
});

describe('validateName — accepts valid names', () => {
  const valid = [
    'my-server',
    'foo_bar',
    'blockscout',
    'web-search',
    'a1',
    'mcp-server-v2',
  ];

  for (const input of valid) {
    test(`accepts: ${input}`, () => {
      assert.equal(validateName(input), input);
    });
  }
});

// ---------------------------------------------------------------------------
// validateNumber
// ---------------------------------------------------------------------------

describe('validateNumber — sanitizes input', () => {
  test('valid number passes through', () => {
    assert.equal(validateNumber(2000, 1000), 2000);
  });

  test('numeric string is coerced', () => {
    assert.equal(validateNumber('3000', 1000), 3000);
  });

  test('non-numeric string returns fallback', () => {
    assert.equal(validateNumber('100; whoami', 2000), 2000);
  });

  test('undefined returns fallback', () => {
    assert.equal(validateNumber(undefined, 2000), 2000);
  });

  test('null coerces to 0 (Number(null) === 0)', () => {
    assert.equal(validateNumber(null, 2000), 0);
  });

  test('NaN returns fallback', () => {
    assert.equal(validateNumber(NaN, 2000), 2000);
  });

  test('Infinity returns fallback', () => {
    assert.equal(validateNumber(Infinity, 2000), 2000);
  });
});
