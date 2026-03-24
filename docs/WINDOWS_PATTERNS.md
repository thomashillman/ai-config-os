# Windows-Safe Code Patterns

Safe patterns for common tasks that fail on Windows. When writing tests, scripts, or build tools, consult these patterns to avoid platform-specific failures.

## Dynamic Imports (ESM)

**Safe: new URL() pattern**
```javascript
// Works on Windows, Linux, macOS
const moduleUrl = new URL('../lib/module.mjs', import.meta.url).href;
const module = await import(moduleUrl);
```

**Unsafe: path.resolve() passed to import()**
```javascript
// Fails on Windows — path.resolve() returns D:\path\to\file.mjs
// import() treats D: as a protocol, not a drive letter
const mod = await import(path.resolve(__dirname, '../lib/module.mjs'));
```

**Why:** On Windows, `path.resolve()` produces paths like `D:\project\file.mjs`. When passed to `import()`, Node.js sees `D:` and tries to use it as a URL scheme (like `http:` or `file:`), which fails with `ERR_UNSUPPORTED_ESM_URL_SCHEME`. The `new URL(..., import.meta.url)` pattern uses the module's own file:// URL as a base, so it works identically on all platforms.

## Path Comparisons in Tests

**Safe: resolve both sides before comparing**
```javascript
import { resolve, sep } from 'node:path';

const repoRoot = resolve('/home/user/project');
const result = resolve(repoRoot, 'src/file.js');

// Always resolve the boundary — never hardcode Unix-style paths
assert.ok(
  result.startsWith(repoRoot + sep) || result === repoRoot,
  `path ${result} should be inside ${repoRoot}`
);
```

**Unsafe: comparing against Unix-style string literals**
```javascript
// Fails on Windows — result is D:\home\user\project\src\file.js
const result = path.resolve('/home/user/project', 'src/file.js');
assert.ok(result.startsWith('/home/user/project'), '...');  // Always fails on Windows
```

**Why:** On Windows, `path.resolve()` injects the drive letter and converts separators to backslashes. Always call `resolve()` on the boundary constant before comparing.

## Symlink Operations in Tests

**Safe: wrap in try/catch with skip**
```javascript
import { test } from 'node:test';
import { symlinkSync } from 'node:fs';

test('symlink functionality', (t) => {
  try {
    symlinkSync(target, link);
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'ENOTSUP') {
      t.skip('symlinks not permitted on this platform');
      return;
    }
    throw err;
  }
  // Test symlink behavior
});
```

**Unsafe: unconditional symlink creation**
```javascript
// Fails on macOS CI where unprivileged symlink creation is denied
fs.symlinkSync(target, link);
```

**Why:** macOS CI runners and some Windows configurations deny unprivileged symlink creation. Gracefully skip the test if the OS doesn't support it.

## Temp Files and Directories

**Safe: use os.tmpdir()**
```javascript
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDir = tmpdir();
const tempFile = join(tempDir, 'my-temp-file.txt');
```

**Unsafe: hardcode /tmp**
```javascript
// Fails on Windows where /tmp doesn't exist
const tempFile = '/tmp/my-temp-file.txt';
```

## Reusable Safe Import Utility

For repeated dynamic imports, use the utility at `scripts/build/lib/windows-safe-import.mjs`:

```javascript
import { safeImport } from './lib/windows-safe-import.mjs';

// In any test or build script:
const { someExport } = await safeImport('../path/to/module.mjs', import.meta.url);
```
