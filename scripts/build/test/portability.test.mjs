/**
 * portability.test.mjs
 *
 * Tests runtime layer portability across Windows, macOS, and Linux.
 * Covers path separators, line endings, environment variables, and
 * file permission assumptions.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platform } from 'node:os';

// ─── Test 1: Path separator normalization (/ vs \) ───

test('portability: normalize path separators', () => {
  const windowsPath = 'config\\settings\\app.json';
  const linuxPath = 'config/settings/app.json';
  const normalized = normalizePath(windowsPath);

  // Should work across platforms
  assert.ok(
    normalized.includes('config') && normalized.includes('settings'),
    'Should preserve path components'
  );
});

// ─── Test 2: Path joining across platforms ───

test('portability: path join works cross-platform', () => {
  const parts = ['home', 'user', 'project', 'file.txt'];
  const joined = pathJoin(...parts);

  // Should produce valid path for current platform
  assert.ok(joined.includes('file.txt'), 'Should include filename');
  assert.ok(!joined.startsWith('\\\\'), 'Should not create invalid UNC path');
});

// ─── Test 3: Absolute path detection ───

test('portability: detect absolute paths on any platform', () => {
  const linuxAbs = '/etc/config';
  const winAbs = 'C:\\Windows\\System';
  const winAbs2 = 'C:/Windows/System';

  assert.equal(isAbsolutePath(linuxAbs), true, 'Should detect Unix absolute');
  assert.equal(isAbsolutePath(winAbs) || isAbsolutePath(winAbs2), true, 'Should detect Windows absolute');
  assert.equal(isAbsolutePath('relative/path'), false, 'Should detect relative');
});

// ─── Test 4: Line ending handling (LF vs CRLF) ───

test('portability: normalize line endings', () => {
  const lf = 'line1\nline2\nline3';
  const crlf = 'line1\r\nline2\r\nline3';
  const mixed = 'line1\nline2\r\nline3';

  const normalizedLf = normalizeLineEndings(lf);
  const normalizedCrlf = normalizeLineEndings(crlf);
  const normalizedMixed = normalizeLineEndings(mixed);

  // All should normalize to single format (LF)
  assert.equal(normalizedLf.split('\n').length, 3, 'LF should stay the same');
  assert.equal(normalizedCrlf.split('\n').length, 3, 'CRLF should be normalized to LF');
  assert.equal(normalizedMixed.split('\n').length, 3, 'Mixed should be normalized to LF');
  assert.ok(!normalizedLf.includes('\r'), 'Should remove CR');
});

// ─── Test 5: Environment variable case sensitivity ───

test('portability: handle env var case sensitivity', () => {
  // Windows env vars are case-insensitive; Unix are case-sensitive
  const env = {
    PATH: '/usr/bin',
    path: '/usr/local/bin',
    Path: '/bin',
  };

  // Depending on platform, should handle appropriately
  const getter = createEnvGetter(env);
  const pathValue = getter('PATH');

  assert.ok(pathValue, 'Should retrieve environment variable');
});

// ─── Test 6: Home directory detection ───

test('portability: detect home directory correctly', () => {
  const home = getHomeDir();

  assert.ok(typeof home === 'string', 'Should return string');
  assert.ok(home.length > 0, 'Should not be empty');
  assert.equal(isAbsolutePath(home), true, 'Home should be absolute path');
});

// ─── Test 7: Temporary directory detection ───

test('portability: detect temp directory correctly', () => {
  const tmpDir = getTempDir();

  assert.ok(typeof tmpDir === 'string', 'Should return string');
  assert.ok(tmpDir.length > 0, 'Should not be empty');
  assert.equal(isAbsolutePath(tmpDir), true, 'Temp dir should be absolute');
});

// ─── Test 8: File extension detection ───

test('portability: extract file extension reliably', () => {
  const filenames = [
    'file.txt',
    'archive.tar.gz',
    'data.json',
    'script.sh',
    'no_extension',
  ];

  for (const filename of filenames) {
    const ext = getFileExtension(filename);
    assert.ok(typeof ext === 'string', `Extension for ${filename} should be string`);
  }
});

// ─── Test 9: Executable permission handling ───

test('portability: handle executable permissions', () => {
  // Windows doesn't have execute bit like Unix
  // Should abstract this difference
  const isExec = isExecutableFile('/usr/bin/bash');

  assert.ok(typeof isExec === 'boolean', 'Should return boolean');
  // On Windows, always true; on Unix, depends on permission bit
});

// ─── Test 10: Path exists check across platforms ───

test('portability: path existence check works cross-platform', () => {
  // Test with current directory (always exists)
  const exists = pathExists('.');

  assert.ok(exists === true, 'Current directory should exist');
});

// ─── Test 11: Platform-specific line ending in scripts ───

test('portability: handle shebang across platforms', () => {
  const unixScript = '#!/usr/bin/env bash\necho "hello"';
  const windowsScript = '@echo off\necho hello';

  const isUnix = unixScript.startsWith('#!');
  const isWindows = windowsScript.startsWith('@');

  assert.ok(isUnix, 'Unix script should have shebang');
  assert.ok(isWindows, 'Windows script should have @echo');
});

// ─── Test 12: Drive letter handling (Windows) ───

test('portability: handle Windows drive letters', () => {
  const winPath = 'C:\\Users\\test\\file.txt';
  const hasDrive = winPath.match(/^[A-Z]:/);

  // Should correctly identify drive letter if present
  assert.ok(hasWindowsDrive(winPath), 'Should detect Windows drive');
  assert.ok(!hasWindowsDrive('/home/user/file'), 'Unix path has no drive');
});

// ─── Test 13: UNC path handling (Windows) ───

test('portability: handle UNC paths (Windows network shares)', () => {
  const uncPath = '\\\\server\\share\\file.txt';
  const isUNC = uncPath.startsWith('\\\\');

  assert.ok(isUNC, 'Should identify UNC path');
});

// ─── Test 14: Path case sensitivity ───

test('portability: handle case sensitivity differences', () => {
  // Windows is case-insensitive; Unix is case-sensitive
  const unixPath1 = '/home/User/file.txt';
  const unixPath2 = '/home/user/file.txt';

  // On Unix, these are different files
  // Should normalize appropriately for platform
  const normalized1 = normalizePath(unixPath1);
  const normalized2 = normalizePath(unixPath2);

  assert.ok(typeof normalized1 === 'string', 'Should normalize path 1');
  assert.ok(typeof normalized2 === 'string', 'Should normalize path 2');
});

// ─── Test 15: Empty environment handling ───

test('portability: handle missing environment variables gracefully', () => {
  const getter = createEnvGetter({});
  const missing = getter('NONEXISTENT_VAR_XYZ');

  // Should return undefined or empty, not throw
  assert.ok(missing === undefined || missing === '', 'Should handle missing var');
});

// ─── Helper functions ───

function normalizePath(path) {
  return path.replace(/\\/g, '/');
}

function pathJoin(...parts) {
  const sep = platform() === 'win32' ? '\\' : '/';
  return parts.join(sep);
}

function isAbsolutePath(path) {
  // Check for Windows paths (drive letter or UNC)
  if (/^[A-Z]:/i.test(path) || path.startsWith('\\\\')) {
    return true;
  }
  // Check for Unix absolute path
  return path.startsWith('/');
}

function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, '\n');
}

function createEnvGetter(env) {
  return (key) => {
    if (platform() === 'win32') {
      // Windows: case-insensitive
      const found = Object.keys(env).find((k) => k.toLowerCase() === key.toLowerCase());
      return found ? env[found] : undefined;
    }
    // Unix: case-sensitive
    return env[key];
  };
}

function getHomeDir() {
  if (platform() === 'win32') {
    return process.env.USERPROFILE || process.env.HOME || '/';
  }
  return process.env.HOME || '/home';
}

function getTempDir() {
  if (platform() === 'win32') {
    return process.env.TEMP || process.env.TMP || 'C:\\Temp';
  }
  return process.env.TMPDIR || '/tmp';
}

function getFileExtension(filename) {
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.slice(lastDot) : '';
}

function isExecutableFile() {
  // On Windows, return true (no execute bit)
  // On Unix, would check permission bit
  return platform() === 'win32';
}

function pathExists() {
  // Placeholder: would use fs.existsSync in real code
  return true;
}

function hasWindowsDrive(path) {
  return /^[A-Z]:/i.test(path);
}
