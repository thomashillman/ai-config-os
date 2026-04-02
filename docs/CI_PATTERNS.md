# Cross-Platform CI Patterns

Reference for Node.js build tools and tests that must run on Windows, macOS, and Linux CI runners. Authoritative owner per living docs protocol — do not duplicate in CLAUDE.md.

---

## CI goals and non-goals

- **Goals:** Fast PR feedback; conditional heavy steps in the merge gate when `full_ci` paths match; a **single clear outcome** for the gate via the **`merge-gate-status`** job; full-repo Prettier on `main` ([`format-check-main.yml`](../.github/workflows/format-check-main.yml)); portability coverage from [`build.yml`](../.github/workflows/build.yml) when its triage matches.
- **Non-goals:** Skipping the merge gate entirely for “docs-only” PRs while still using one canonical required check—that would require a deliberate noop/triage design; this repo instead always schedules the gate jobs (with cheaper steps when `full_ci` is false).
- **Redundant work:** When paths overlap, **`merge-node`** (with `full_ci`) and the **`build`** workflow matrix can both run **validate/build/test-class** work. That is **intentional** as dual signal (Linux merge gate vs multi-OS matrix), not something to remove without a **policy** decision (for example treating `build` as informational only).

---

## Branch protection and required checks

- **Canonical merge gate:** Treat [`.github/workflows/pr-mergeability-gate.yml`](../.github/workflows/pr-mergeability-gate.yml) as the **primary** required status for merging to `main`. It runs on every non-draft PR to `main` (no `paths:` filter on the workflow). It splits into **`merge-git`** (merge simulation + conflict-marker scan, no Node), **`changes`** (path triage for `full_ci` via `dorny/paths-filter` on pull requests), **`merge-node`** (Prettier on **changed files only** via [`scripts/ci/format-check-changed.mjs`](../scripts/ci/format-check-changed.mjs), Cursor rules, conditional dashboard install, then **validate / build / test** only when `full_ci` matches, and **`verify` with `--skip-tests`**), and **`merge-gate-status`** (aggregate: **`if: always()`**, fails if any gate job **failed** or **cancelled**, passes when all **skipped** e.g. draft PR, passes when all **success**). Each upstream job’s `needs.<job_id>.result` is one of **`success`**, **`failure`**, **`cancelled`**, or **`skipped`** — see GitHub’s [`needs` context](https://docs.github.com/en/actions/learn-github-actions/contexts#needs-context).
- **`merge-gate-status` trust model:** The aggregate step evaluates job results using **inline shell embedded in the workflow file** (resolved from the default branch), not `node` on files from a PR checkout. That avoids a class of bypasses where a PR could edit `scripts/ci/*` and make the required check always pass. [`scripts/ci/lib/merge-gate-status-logic.mjs`](../scripts/ci/lib/merge-gate-status-logic.mjs) mirrors the same rules for unit tests; when you change the shell block in the workflow, update that module and tests together.
- **Mixed `success` / `skipped` tuples:** After ruling out **`failure`** and **`cancelled`**, only **all `success`** or **all `skipped`** are treated as pass. Any other combination fails with an “Unexpected merge gate job states” error. If GitHub’s `needs` behavior changes or you observe a legitimate mixed tuple in production, update the workflow shell, the logic module, and this doc together.
- **Single required check name:** Prefer requiring **`merge-gate-status`** in GitHub rulesets or branch protection so one status reflects the whole gate. Remove stale required checks named **`mergeability`** or individual job names if you standardize on **`merge-gate-status`**. **Rulesets and branch protection match the workflow job id** (`merge-gate-status`); the **display name** in the GitHub UI comes from the job’s `name:` field (**Merge gate status**). Keep the id and `name:` aligned with the workflow when editing.
- **Updating GitHub rulesets after workflow changes:** If you do not use **`merge-gate-status`**, required status names match **job IDs** in the workflow file (e.g. `merge-git`, `changes`, `merge-node`). After editing jobs, update **branch protection / rulesets** accordingly.
- **Supplementary workflows:** [`.github/workflows/build.yml`](../.github/workflows/build.yml) and [`.github/workflows/validate.yml`](../.github/workflows/validate.yml) schedule on every PR to `main` but use a **triage** job (`dorny/paths-filter`) so heavy jobs run only when matching paths change. When nothing matches, a **noop** job (`build-not-needed` / `validate-not-needed`) succeeds so the workflow still completes without idle matrix runners.
- **Push to `main`:** `build` and `validate` workflows keep workflow-level `paths:` filters on `push` to avoid redundant runs when unrelated files change. [`.github/workflows/format-check-main.yml`](../.github/workflows/format-check-main.yml) runs **full-repo** `npm run format:check` on every push to `main` so repo-wide formatting stays enforced even though PRs use **changed-file** Prettier for speed.

### `full_ci` path list (merge gate)

The canonical glob list lives in [`shared/ci/full-ci-globs.json`](../shared/ci/full-ci-globs.json) and must match the `full_ci` block under `dorny/paths-filter` in [`pr-mergeability-gate.yml`](../.github/workflows/pr-mergeability-gate.yml). **`npm run validate:full-ci-manifest`** (also exercised by **`npm test`**) fails if they diverge—edit **both** the JSON and the workflow when changing globs.

**Scope:** That manifest check **only** aligns the JSON file with the merge gate’s `full_ci` list. **[`build.yml`](../.github/workflows/build.yml)** and **[`validate.yml`](../.github/workflows/validate.yml)** use **separate** path filters for their own triage; updating those lists does **not** have to match this manifest unless you are intentionally changing merge-gate `full_ci` behavior. For example, **`shared/ci/**`** may appear in **`build.yml`** `paths` / filters so CI config edits re-run the build workflow, without being covered by **`validate:full-ci-manifest`** unless those paths are also added to the merge gate **`full_ci`\*\* globs and JSON.

When **no** path under `full_ci` matches the PR diff, **`validate` / `build` / `test`** are skipped in **`merge-node`** (verify still runs version/lint/dashboard gates with `--skip-tests`). If you introduce a **new root file or top-level directory** that affects compilation, tests, dependencies, or CI, **add a glob** to the manifest and workflow. When unsure, prefer adding the path so the heavy steps run.

Configure GitHub rulesets or branch protection so merges are not blocked waiting for a workflow that never ran because of an old path-only `on:` filter; the triage + noop pattern avoids that for PRs.

## Path filters vs conditional steps

- **Workflow `paths:` on `on:`** — Skips the entire workflow (no jobs). Cheap, but any **required** check tied to that workflow may never appear on the PR.
- **Triage job + `if:` on jobs** — Workflow always runs; path filters set outputs; downstream jobs or noop jobs run accordingly. Slightly more Actions time for checkout + triage on every PR.
- **Conditional steps** — If a step is guarded with `if:` and produces artifacts or side effects used later, **guard the consuming steps too** (same condition or a compatible one). Unpaired conditionals are a common source of “passing” CI that skipped install/build but still ran a consumer step.

---

## CI Pitfalls

### 1. Shell glob patterns in npm scripts

`node --test scripts/build/test/*.test.mjs` fails on Windows CMD (no glob expansion).

**Fix:** Use a dedicated test runner with Node.js glob:

```json
"test": "node scripts/build/test/run-tests.mjs"
```

```javascript
import { globSync } from "glob";
const files = globSync("scripts/build/test/*.test.mjs");
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
const mod = await import(new URL("../lib/module.mjs", import.meta.url).href);
```

**Unsafe:**

```javascript
// Fails on Windows — D:\path\file.mjs treated as URL scheme by import()
const mod = await import(path.resolve(__dirname, "../lib/module.mjs"));
```

Use the utility at `scripts/build/lib/windows-safe-import.mjs` for repeated dynamic imports:

```javascript
import { safeImport } from "./lib/windows-safe-import.mjs";
const { someExport } = await safeImport(
  "../path/to/module.mjs",
  import.meta.url,
);
```

### Path comparisons in tests

**Safe:**

```javascript
import { resolve, sep } from "node:path";
const resolvedRoot = resolve(repoRoot); // resolve the boundary
assert.ok(
  result.startsWith(resolvedRoot + sep) || result === resolvedRoot,
  `path ${result} should be inside ${resolvedRoot}`,
);
```

**Unsafe:**

```javascript
// Always fails on Windows — result is D:\home\user\project\src\file.js
assert.ok(result.startsWith("/home/user/project"), "...");
```

Rule: always call `resolve()` on the boundary before comparing. Never compare against a raw Unix-style string literal.

Also use `path.join()` / `normalize()` instead of hardcoded slashes when building paths:

```javascript
import { join, normalize } from "path";
const safePath = normalize(rawPath);
```

### Symlink operations in tests

**Safe:**

```javascript
import { test } from "node:test";
test("symlink functionality", (t) => {
  try {
    fs.symlinkSync(target, link);
  } catch (err) {
    if (err.code === "EPERM" || err.code === "ENOTSUP") {
      t.skip("symlinks not permitted on this platform");
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
import { tmpdir } from "node:os";
import { join } from "node:path";
const tempFile = join(tmpdir(), "my-temp-file.txt");
```

**Unsafe:** `/tmp/my-temp-file.txt` — does not exist on Windows.
