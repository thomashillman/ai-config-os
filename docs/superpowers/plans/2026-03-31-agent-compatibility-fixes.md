# Agent compatibility remediation — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve cold-agent bootstrap docs, tiered verification guidance, narrow test runs, clearer entrypoint-contract failures, `UNLICENSED` metadata, and repo-root Prettier with PR `format:check`—per [docs/superpowers/specs/2026-03-31-agent-compatibility-fixes-design.md](../specs/2026-03-31-agent-compatibility-fixes-design.md).

**Architecture:** Edit human-facing README and generated-doctrine **overlays** only, then regenerate `AGENTS.md` / `CLAUDE.md`. Extend `run-tests.mjs` with optional repo-root-relative `.test.mjs` paths. Improve one assertion message in `root-entrypoints-contract.test.mjs`. Add Prettier at repo root with `.prettierignore` excluding `dashboard/` (v1), `dist/`, `node_modules`, plugin caches, etc. Enforce `format:check` only in `pr-mergeability-gate.yml`; extend `paths:` on `validate.yml` and `build.yml` for Prettier/gate config files.

**Tech Stack:** Node.js (ESM), npm scripts, GitHub Actions, Prettier 3.x (devDependency).

**Spec:** [docs/superpowers/specs/2026-03-31-agent-compatibility-fixes-design.md](../specs/2026-03-31-agent-compatibility-fixes-design.md)

---

## File map

| File                                                                                                                             | Role                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [`package.json`](../../package.json)                                                                                             | Add `"license": "UNLICENSED"`, `prettier` devDependency, `format`, `format:check`, `test:file`           |
| [`README.md`](../../README.md)                                                                                                   | Root install, dashboard install, License section, Contributing tier                                      |
| [`shared/agent-doctrine/repos/ai-config-os/codex.overlay.md`](../../shared/agent-doctrine/repos/ai-config-os/codex.overlay.md)   | Generated entrypoints + cross-surface + `doctrine:check` when doctrine changes                           |
| [`shared/agent-doctrine/repos/ai-config-os/claude.overlay.md`](../../shared/agent-doctrine/repos/ai-config-os/claude.overlay.md) | Same (keep Codex/Claude wording symmetric)                                                               |
| [`scripts/build/test/run-tests.mjs`](../../scripts/build/test/run-tests.mjs)                                                     | Parse `process.argv` for explicit test paths from repo root                                              |
| [`scripts/build/test/root-entrypoints-contract.test.mjs`](../../scripts/build/test/root-entrypoints-contract.test.mjs)           | Richer failure message listing paths + `npm run build` vs `npm run doctrine:build`                       |
| **Create** [`.prettierrc`](../../.prettierrc) (or `.prettierrc.json`)                                                            | Minimal Prettier config                                                                                  |
| **Create** [`.prettierignore`](../../.prettierignore)                                                                            | `dist/`, `**/node_modules/`, `dashboard/`, lockfiles, caches, generated vendor trees                     |
| [`.github/workflows/pr-mergeability-gate.yml`](../../.github/workflows/pr-mergeability-gate.yml)                                 | Step: `npm run format:check` after `npm ci`                                                              |
| [`.github/workflows/validate.yml`](../../.github/workflows/validate.yml)                                                         | Add `.prettierrc`, `.prettierignore`, `.github/workflows/pr-mergeability-gate.yml` to both `paths` lists |
| [`.github/workflows/build.yml`](../../.github/workflows/build.yml)                                                               | Same path additions                                                                                      |
| Generated (after `doctrine:build`)                                                                                               | `AGENTS.md`, `CLAUDE.md` at repo root                                                                    |

---

### Task 1: Package license metadata

**Files:**

- Modify: [`package.json`](../../package.json)

- [ ] **Step 1:** Add `"license": "UNLICENSED"` next to other top-level keys (do not add a `LICENSE` file).

- [ ] **Step 2:** Commit `chore: set package license to UNLICENSED`

---

### Task 2: README — License, bootstrap, Contributing, dashboard

**Files:**

- Modify: [`README.md`](../../README.md)

- [ ] **Step 1:** Replace the **License** section (currently MIT + `LICENSE` link) with a short **no license** statement: e.g. no permission to use/copy/modify is granted by default; all rights reserved unless you state otherwise elsewhere. No link to a missing file.

- [ ] **Step 2:** Under **Getting started** (after Prerequisites or as **Develop from source**), add: clone then **`npm ci` or `npm install` at the repository root** before `npm run build`, `node scripts/build/compile.mjs`, `npm test`, or other scripts that need `node_modules`.

- [ ] **Step 3:** In **Step 3: Explore the dashboard**, before `npm run dev`, add `npm install` or `npm ci` inside `dashboard/` (e.g. `cd dashboard && npm install && npm run dev` split across lines).

- [ ] **Step 4:** Rewrite **Contributing** step 4+ as a tiered list: (1) `npm run validate` or `npm run build`, `npm test`; (2) `npm run check:cursor-rules` when `.cursor/rules/**` changes; (3) `npm run doctrine:check` when `shared/agent-doctrine/**` changes; link **AGENTS.md** for full matrix; (4) when Claude/plugin packaging changes, `bash adapters/claude/dev-test.sh` and related commands.

- [ ] **Step 5:** Commit `docs: align README with agent bootstrap and license posture`

---

### Task 3: Doctrine overlays + regenerate entrypoints

**Files:**

- Modify: [`shared/agent-doctrine/repos/ai-config-os/codex.overlay.md`](../../shared/agent-doctrine/repos/ai-config-os/codex.overlay.md)
- Modify: [`shared/agent-doctrine/repos/ai-config-os/claude.overlay.md`](../../shared/agent-doctrine/repos/ai-config-os/claude.overlay.md)

- [ ] **Step 1:** Insert a **Generated entrypoints** (or **Before full `npm test`**) subsection after **Verification commands** (or **Repository-specific workflows**) covering: `npm run build` = compile only; `npm run doctrine:build` = root `CLAUDE.md` / root `AGENTS.md`; contract test tracks `CLAUDE.md`, `dist/clients/codex/AGENTS.md`, plugin json after compile; root `AGENTS.md` is separate from dist Codex package; run `doctrine:build` vs `build` then commit or revert; `doctrine:check` when editing `shared/agent-doctrine/**`.

- [ ] **Step 2:** Add one line: Codex-oriented agents use **AGENTS.md**; Claude-oriented detail in **CLAUDE.md** — use the checklist for your surface.

- [ ] **Step 3:** In **Verification commands** blocks, add `npm run doctrine:check` when doctrine fragments change (mirror README tier).

- [ ] **Step 4:** Run `npm run doctrine:build` from repo root (requires prior `npm install`).

- [ ] **Step 5:** Commit regenerated `AGENTS.md`, `CLAUDE.md`, and overlays: `docs(doctrine): document generated entrypoints and checks`

---

### Task 4: `run-tests.mjs` explicit file paths

**Files:**

- Modify: [`scripts/build/test/run-tests.mjs`](../../scripts/build/test/run-tests.mjs)

- [ ] **Step 1:** Define `REPO_ROOT = resolve(__dirname, '..', '..', '..')`.

- [ ] **Step 2:** Parse `process.argv.slice(2)`. If non-empty, treat each argument as a path: `resolve(REPO_ROOT, arg)` for non-absolute args; `realpathSync` on resolved path and on `REPO_ROOT`; **contain** the file inside the repo using `relative(REPO_ROOTReal, resolvedReal)` and reject if the result is empty, starts with `..`, or `isAbsolute(relative)` — do **not** use a naive `startsWith(REPO_ROOT)` string check (prefix attacks: e.g. `…/ai-config-os-evil`). Require basename ends with `.test.mjs`; exit 1 with clear stderr if any path is invalid.

- [ ] **Step 3:** If argv mode: build `allTestFiles` from argv only (sorted); skip directory discovery. If argv empty: keep current discovery from `build/test` + `deploy/test`.

- [ ] **Step 4:** If `allTestFiles.length === 0`, exit 1 with message (argv mode: “no valid test files”; default mode: keep current message).

- [ ] **Step 5:** Run existing classification + two-phase execution on `allTestFiles` unchanged.

- [ ] **Step 6:** Manual check: `node scripts/build/test/run-tests.mjs scripts/build/test/some-pure.test.mjs` (pick one small file) exits 0 after `npm run build`. Document in plan follow-up: `npm run test:file` in Task 5.

- [ ] **Step 7:** Commit `feat(test): allow run-tests.mjs to target explicit test files`

---

### Task 5: `test:file` script + contract test message

**Files:**

- Modify: [`package.json`](../../package.json)
- Modify: [`scripts/build/test/root-entrypoints-contract.test.mjs`](../../scripts/build/test/root-entrypoints-contract.test.mjs)

- [ ] **Step 1:** Add `"test:file": "node scripts/build/test/run-tests.mjs"` to `scripts`. Document in a one-line comment in `README` Contributing or in `AGENTS` overlay: **`test:file` does not run `pretest`** — run `npm run build` first if `dist/` must be fresh.

- [ ] **Step 2:** Replace `assert.deepEqual(changed, [], ...)` with an assertion whose message lists `changed` and maps paths to commands: **`dist/clients/codex/AGENTS.md`** and **`dist/clients/claude-code/.claude-plugin/plugin.json`** are compile-owned → run **`npm run build`**. Root **`CLAUDE.md`** is **not** emitted by `compile.mjs` (see [`scripts/build/compile.mjs`](../../scripts/build/compile.mjs)); it is doctrine-owned → run **`npm run doctrine:build`**. Then commit regenerated files or revert local edits.

- [ ] **Step 3:** Run `npm test` (full suite) on a clean tree; expect pass.

- [ ] **Step 4:** Commit `feat(test): test:file script and clearer entrypoint sync errors`

---

### Task 6: Prettier — deps, config, ignore, scripts

**Files:**

- Modify: [`package.json`](../../package.json)
- Create: [`.prettierrc`](../../.prettierrc)
- Create: [`.prettierignore`](../../.prettierignore)

- [ ] **Step 1:** `npm install -D prettier@3` at repo root; lockfile updates.

- [ ] **Step 2:** Add `.prettierrc` with minimal options, e.g. `{ "singleQuote": true }` only if it matches bulk of existing JS; otherwise empty `{}` for Prettier defaults.

- [ ] **Step 3:** `.prettierignore` must include at minimum: `dist/`, `**/node_modules/`, `package-lock.json` (or not, if you want lock formatted—spec said lockfiles; typically ignore), `dashboard/`, `.cursor/plugins/` or `**/.cursor/plugins/**` if present and large, any `plugins/**/node_modules`, `coverage/`, `*.min.js`. Scan repo for other generated trees.

- [ ] **Step 4:** Add `"format": "prettier --write ."` and `"format:check": "prettier --check ."`.

- [ ] **Step 5:** Run `npm run format` once; expect large diff across allowed paths.

- [ ] **Step 6:** Run `npm run format:check` — must exit 0.

- [ ] **Step 7:** Commit `chore: add Prettier with format scripts` (may combine with Task 7 if preferred).

---

### Task 7: CI — mergeability gate + workflow paths

**Files:**

- Modify: [`.github/workflows/pr-mergeability-gate.yml`](../../.github/workflows/pr-mergeability-gate.yml)
- Modify: [`.github/workflows/validate.yml`](../../.github/workflows/validate.yml)
- Modify: [`.github/workflows/build.yml`](../../.github/workflows/build.yml)

- [ ] **Step 1:** In `pr-mergeability-gate.yml`, after `npm ci`, add step `npm run format:check`.

- [ ] **Step 2:** In `validate.yml` and `build.yml`, append to both `push` and `pull_request` `paths` lists: `.prettierrc`, `.prettierignore`, `.github/workflows/pr-mergeability-gate.yml` (exact YAML list style must match each file).

- [ ] **Step 3:** Commit `ci: enforce format check on PRs and widen workflow paths`

---

### Task 8: Final verification

- [ ] **Step 1:** `npm run validate` — exit 0.

- [ ] **Step 2:** `npm test` — exit 0 on clean tree (run `npm run build` first if needed).

- [ ] **Step 3:** `npm run check:cursor-rules` if any `.cursor/rules/**` touched.

- [ ] **Step 4:** `npm run doctrine:check` if any `shared/agent-doctrine/**` or regenerated `AGENTS.md` / `CLAUDE.md` workflow was part of the change set.

- [ ] **Step 5:** Optional: `/check-agent-compatibility` or local agent-compatibility CLI.

- [ ] **Step 6:** Final commit only if fixes needed; else done.

---

## Execution handoff (after plan approval)

Plan complete and saved to [`docs/superpowers/plans/2026-03-31-agent-compatibility-fixes.md`](2026-03-31-agent-compatibility-fixes.md).

**1. Subagent-driven (recommended)** — Fresh subagent per task, review between tasks.

**2. Inline execution** — Run tasks in this session in order with checkpoints.

Which approach do you want?
