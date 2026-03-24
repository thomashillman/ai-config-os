// Tests for runtime/mcp/validators.mjs
//
// Validates: SAFE_NAME regex pattern, validateName, and validateNumber.
// validateRouteDefinition delegates to the contract system and is not tested here.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { SAFE_NAME, validateName, validateNumber } from '../../../runtime/mcp/validators.mjs';

// ─── SAFE_NAME regex ──────────────────────────────────────────────────────────

describe('SAFE_NAME regex', () => {
  const valid = [
    'abc',
    'my-skill',
    'skill_name',
    'a1b2',
    'review-repo',
    'test123',
    'a',
    'x-y-z',
  ];

  const invalid = [
    '',
    '-starts-with-dash',
    '_starts-with-underscore',
    'Has Uppercase',
    'has.dot',
    '../path',
    'with space',
    'ALLCAPS',
  ];

  for (const v of valid) {
    test(`accepts: "${v}"`, () => {
      assert.ok(SAFE_NAME.test(v), `"${v}" should match SAFE_NAME`);
    });
  }

  for (const v of invalid) {
    test(`rejects: "${v || '(empty)'}"`, () => {
      assert.ok(!SAFE_NAME.test(v), `"${v}" should not match SAFE_NAME`);
    });
  }
});

// ─── validateName ─────────────────────────────────────────────────────────────

describe('validateName', () => {
  test('returns the name unchanged when valid', () => {
    assert.equal(validateName('my-skill'), 'my-skill');
    assert.equal(validateName('abc123'), 'abc123');
    assert.equal(validateName('a'), 'a');
    assert.equal(validateName('tool_name'), 'tool_name');
  });

  test('throws for name starting with dash', () => {
    assert.throws(() => validateName('-bad'), /Invalid name/);
  });

  test('throws for name starting with underscore', () => {
    assert.throws(() => validateName('_bad'), /Invalid name/);
  });

  test('throws for name with uppercase letters', () => {
    assert.throws(() => validateName('MySkill'), /Invalid name/);
    assert.throws(() => validateName('ALLCAPS'), /Invalid name/);
  });

  test('throws for name with spaces', () => {
    assert.throws(() => validateName('my skill'), /Invalid name/);
  });

  test('throws for name with dots', () => {
    assert.throws(() => validateName('a.b'), /Invalid name/);
  });

  test('throws for empty string', () => {
    assert.throws(() => validateName(''), /Invalid name/);
  });

  test('throws for non-string input (number)', () => {
    assert.throws(() => validateName(42), /Invalid name/);
  });

  test('throws for non-string input (null)', () => {
    assert.throws(() => validateName(null), /Invalid name/);
  });

  test('throws for non-string input (undefined)', () => {
    assert.throws(() => validateName(undefined), /Invalid name/);
  });
});

// ─── validateNumber ───────────────────────────────────────────────────────────

describe('validateNumber', () => {
  test('returns integer unchanged', () => {
    assert.equal(validateNumber(42, 0), 42);
  });

  test('returns float unchanged', () => {
    assert.equal(validateNumber(3.14, 0), 3.14);
  });

  test('returns zero (not the fallback)', () => {
    assert.equal(validateNumber(0, 99), 0);
  });

  test('coerces numeric string to number', () => {
    assert.equal(validateNumber('100', 0), 100);
    assert.equal(validateNumber('2.5', 0), 2.5);
  });

  test('returns fallback for NaN', () => {
    assert.equal(validateNumber(NaN, 42), 42);
  });

  test('returns fallback for non-numeric string', () => {
    assert.equal(validateNumber('abc', 99), 99);
  });

  test('returns fallback for Infinity', () => {
    assert.equal(validateNumber(Infinity, 10), 10);
  });

  test('returns fallback for -Infinity', () => {
    assert.equal(validateNumber(-Infinity, 5), 5);
  });

  test('null coerces to 0 (Number(null) === 0), not the fallback', () => {
    assert.equal(validateNumber(null, 7), 0);
  });

  test('returns fallback for undefined', () => {
    assert.equal(validateNumber(undefined, 3), 3);
  });

  test('negative numbers are valid', () => {
    assert.equal(validateNumber(-10, 0), -10);
  });
});
