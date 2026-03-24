# Common CI Pitfalls

Platform-specific CI pitfalls when building for multi-platform CI (Windows, macOS, Linux).

## 1. Shell glob patterns in npm scripts

**Problem:** `npm test` with `node --test scripts/build/test/*.test.mjs` fails on Windows CMD (doesn't expand globs).

**Solution:** Use Node.js `glob()` in a dedicated test runner script instead.
```json
"test": "node scripts/build/test/run-tests.mjs"
```
Create `run-tests.mjs` using `import { globSync } from 'glob'` to discover test files on all platforms.

## 2. Platform-specific code in test suites run on all OSes

**Problem:** Tests using `execFileSync("bash", ...)` or depending on `jq`/`yq` fail on Windows or minimal CI images.

**Solution:** Test Node.js code across all platforms. Keep bash script testing local-only.
- Don't test shell adapters in multi-platform CI
- Focus CI on portable Node.js code
- Document local testing procedures for shell scripts

## 3. Build artifacts not available to tests

**Problem:** Tests fail because pretest build didn't complete or dist/ was cleaned up.

**Solution:**
- Ensure `pretest` hook runs before tests (already in package.json: `"pretest": "node scripts/build/compile.mjs"`)
- Make tests independent of build artifacts when possible
- If tests need dist/, verify the pretest step completes before tests start

## 4. Platform-specific path separators in config

**Problem:** Test code assumes forward slashes; fails on Windows with backslashes.

**Solution:** Use `path.join()` and normalize paths early in tests.
```javascript
import { join, normalize } from 'path';
const safePath = normalize(rawPath); // Converts to platform-native separators
```

## 5. Comparing resolved paths against raw Unix-style string literals

**Problem:** `path.resolve('/home/user/project', 'sub/file')` returns
`C:\home\user\project\sub\file` on Windows (the drive letter and backslashes are
injected). Any subsequent `result.startsWith('/home/user/project')` check will
**always fail on Windows**, even though the path is logically correct.
```javascript
// WRONG — fails on Windows
assert.ok(result.startsWith(repoRoot), '...');

// RIGHT — platform-neutral
import { resolve, sep } from 'node:path';
const resolvedRoot = resolve(repoRoot);
assert.ok(
  result.startsWith(resolvedRoot + sep) || result === resolvedRoot,
  `path ${result} should be inside ${resolvedRoot}`
);
```
**Rule:** In tests that check whether a resolved path is inside a boundary, always
call `resolve()` on the boundary constant before comparing — never compare against
a raw Unix-style string literal.

## 6. Unconditional symlink creation in tests on macOS CI

**Problem:** `fs.symlinkSync()` without a try/catch causes a test failure on macOS
CI runners where unprivileged symlink creation can return `EPERM`. The test exits
immediately, making the build fail very fast (~18 s).

**Solution:** Wrap symlink creation in try/catch and skip the test gracefully if the
OS rejects the operation:
```javascript
import { test } from 'node:test';
test('symlink test', (t) => {
  try {
    fs.symlinkSync(target, link);
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'ENOTSUP') {
      t.skip('symlink creation not permitted on this platform');
      return;
    }
    throw err;
  }
  // ... rest of test
});
```
