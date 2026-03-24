# Cross-Platform CI Patterns

Reference for Node.js build tools and tests that must run on Windows, macOS, and Linux CI runners. Authoritative owner per living docs protocol — do not duplicate in CLAUDE.md.

---

## CI Pitfalls

### 1. Shell glob patterns in npm scripts

`node --test scripts/build/test/*.test.mjs` fails on Windows CMD (no glob expansion).

**Fix:** Use a dedicated test runner with Node.js glob:
```json
"test": "node scripts/build/test/run-tests.mjs"
```
```javascript
import { globSync } from 'glob';
const files = globSync('scripts/build/test/*.test.mjs');
```

### 2. Platform-specific code in multi-platform CI

`execFileSync("bash", ...)` or `jq`/`yq` dependencies fail on Windows or minimal images.

**Fix:** Test only portable Node.js code in CI. Keep bash adapter testing local-only; document local procedures in the relevant README.

### 3. Build artifacts not available to tests

Tests fail when `pretest` build did not complete or `dist/` was cleaned.

**Fix:** Verify `package.json` has `"pretest": "node scripts/build/compile.mjs"`. Make tests independent of build artifacts where possible.

---

## Safe Code Patterns

### Dynamic imports (ESM)

**Safe:**
```javascript
// Works on Windows, Linux, macOS
const mod = await import(new URL('../lib/module.mjs', import.meta.url).href);
```

**Unsafe:**
```javascript
// Fails on Windows — D:\path\file.mjs treated as URL scheme by import()
const mod = await import(path.resolve(__dirname, '../lib/module.mjs'));
```

Use the utility at `scripts/build/lib/windows-safe-import.mjs` for repeated dynamic imports:
```javascript
import { safeImport } from './lib/windows-safe-import.mjs';
const { someExport } = await safeImport('../path/to/module.mjs', import.meta.url);
```

### Path comparisons in tests

**Safe:**
```javascript
import { resolve, sep } from 'node:path';
const resolvedRoot = resolve(repoRoot); // resolve the boundary
assert.ok(
  result.startsWith(resolvedRoot + sep) || result === resolvedRoot,
  `path ${result} should be inside ${resolvedRoot}`
);
```

**Unsafe:**
```javascript
// Always fails on Windows — result is D:\home\user\project\src\file.js
assert.ok(result.startsWith('/home/user/project'), '...');
```

Rule: always call `resolve()` on the boundary before comparing. Never compare against a raw Unix-style string literal.

Also use `path.join()` / `normalize()` instead of hardcoded slashes when building paths:
```javascript
import { join, normalize } from 'path';
const safePath = normalize(rawPath);
```

### Symlink operations in tests

**Safe:**
```javascript
import { test } from 'node:test';
test('symlink functionality', (t) => {
  try {
    fs.symlinkSync(target, link);
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'ENOTSUP') {
      t.skip('symlinks not permitted on this platform');
      return;
    }
    throw err;
  }
});
```

**Unsafe:**
```javascript
fs.symlinkSync(target, link); // EPERM on macOS CI, fails immediately
```

### Temp files and directories

**Safe:**
```javascript
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const tempFile = join(tmpdir(), 'my-temp-file.txt');
```

**Unsafe:** `/tmp/my-temp-file.txt` — does not exist on Windows.
