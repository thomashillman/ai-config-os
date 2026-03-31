# Design: Agent compatibility remediation (ai-config-os)

**Status:** Approved for implementation planning  
**Date:** 2026-03-31  
**Brainstorming:** Scope B (docs, tests, governance, Prettier + CI). License posture: **none** (not MIT; no LICENSE file).

## 1. Problem

Agent compatibility review reported: missing root `npm install` in README, Contributing under-spec vs AGENTS.md, dashboard path without install, heavy full-test loop, opaque failures from the root entrypoint contract test, false MIT/README license claims vs repo metadata, and no repo-root formatter for scanner/CI alignment.

**Note:** The root entrypoint contract test compares **tracked** files after compile; it catches **compile/dist** drift (e.g. `CLAUDE.md`, `dist/clients/codex/AGENTS.md`, plugin json) but not every class of doctrine mistake if the committed tree already matches the working tree. **`npm run doctrine:check`** remains the guard when `shared/agent-doctrine/**` changes without regenerating committed entrypoints.

## 2. Goals

- Cold contributors and agents can bootstrap from **README** with explicit **root** `npm ci` / `npm install` before Node build/test commands.
- **Dashboard** instructions include `npm install` (or `npm ci`) in `dashboard/` before `npm run dev`.
- **Contributing** lists the same **tiered** verification ladder as agent entrypoints (validate/build, test, `check:cursor-rules` when `.cursor/rules/**` changes, **`doctrine:check`** when `shared/agent-doctrine/**` changes), with **AGENTS.md** as the canonical full matrix and **Claude** paths (`adapters/claude/dev-test.sh`, etc.) as the plugin-specific tier.
- **Generated entrypoints** behavior is documented so agents understand `npm test` contract failures on dirty tracked generator output.
- **`run-tests.mjs`** supports optional file arguments for **narrow** test runs without forking runner internals.
- **Root entrypoint contract** assertion messages name changed files and remediation (compile / doctrine emit, commit, or revert).
- **License:** README and **package.json** reflect **no license** (no MIT text, no `LICENSE` file); use SPDX **`UNLICENSED`** in `package.json` unless policy prefers omitting the field (prefer `UNLICENSED` for npm clarity).
- **Prettier** at repo root with `format` / `format:check`; **CI** runs `format:check` on PRs (mergeability gate).

## 3. Non-goals

- Repo-wide ESLint/TypeScript unification or replacing **dashboard** ESLint.
- Shortening **AGENTS.md** for external “concise guidance” heuristics.
- `.cursor/mcp.json`, accelerator-only Cursor wiring.
- **Prettier on `dashboard/` in v1** — exclude `dashboard/` via `.prettierignore` for the initial change to limit diff size; optional follow-up to include it.

## 4. Documentation changes

### 4.1 README.md

- After prerequisites (or a short **Develop from source** subsection under Getting started), document **root** `npm ci` or `npm install` before `npm run build`, `node scripts/build/compile.mjs`, `npm test`, etc.
- In dashboard steps: `cd dashboard && npm install` (or `npm ci`) before `npm run dev`.
- **License section:** Replace MIT + LICENSE link with accurate **no license** wording (e.g. no permission granted by default / all rights reserved — keep brief and consistent with maintainer intent).

### 4.2 Contributing (README)

Replace single-step “only dev-test.sh” with:

1. Minimal repo loop: `npm run validate` or `npm run build`, `npm test`, `npm run check:cursor-rules` when `.cursor/rules/**` changes, and `npm run doctrine:check` when `shared/agent-doctrine/**` changes.
2. Link to **AGENTS.md** for the complete verification list.
3. Claude/plugin packaging: `bash adapters/claude/dev-test.sh` and related commands when those surfaces change.

### 4.3 Doctrine fragments (not generated roots)

`AGENTS.md` and `CLAUDE.md` are generated — edit **doctrine overlays**, e.g.:

- [`shared/agent-doctrine/repos/ai-config-os/codex.overlay.md`](../../../shared/agent-doctrine/repos/ai-config-os/codex.overlay.md)
- [`shared/agent-doctrine/repos/ai-config-os/claude.overlay.md`](../../../shared/agent-doctrine/repos/ai-config-os/claude.overlay.md)

Add a short **Generated entrypoints** (or **Before full test**) note:

- **`npm run build`** runs **`compile.mjs` only** (skills → `dist/` clients, registry, etc.). It does **not** emit root `CLAUDE.md` or root `AGENTS.md`.
- **`npm run doctrine:build`** runs **`emit-agent-entrypoints.mjs`** and refreshes doctrine-driven roots (e.g. root `CLAUDE.md`, root `AGENTS.md` per repo wiring).
- Full `npm test` includes a contract that **tracked** outputs stay in sync **after compile** for a fixed list today: root `CLAUDE.md`, **`dist/clients/codex/AGENTS.md`** (compile-emitted Codex package), and `dist/clients/claude-code/.claude-plugin/plugin.json`. Root **`AGENTS.md`** is doctrine-generated separately; keep both Codex surfaces in mind when debugging “stale agent instructions.”
- Local edits without regenerating and committing will fail the contract when `git diff` shows those tracked paths dirty post-compile; run **`npm run doctrine:build`** when overlays or doctrine inputs change, **`npm run build`** when skills/compiler outputs change, then commit, or revert local edits.

Add a **cross-surface** one-liner: Codex agents use **AGENTS.md**; Claude-oriented detail also in **CLAUDE.md** / overlay — pick the checklist that matches the surface you are using.

Regenerate entrypoints per repo workflow (`npm run doctrine:build` for doctrine, `npm run build` for compile) so generated files stay consistent. When editing `shared/agent-doctrine/**`, also run **`npm run doctrine:check`** before completion (analogous to `check:cursor-rules` for `.cursor/rules/**`).

## 5. Test runner and contract test

### 5.1 `scripts/build/test/run-tests.mjs`

- If additional CLI arguments are present after the script name, treat each as a **test file path**, resolved from **repository root** (reject missing files; only allow paths ending in `.test.mjs` or document exception if deploy tests use another suffix—today deploy tests are `.test.mjs` under `scripts/deploy/test/` and may be passed explicitly).
- Preserve existing behavior when **no** extra args: discover all tests, classify dist-writers vs pure, two-phase execution unchanged for the selected or full set.

### 5.2 `package.json` scripts

- Add e.g. `"test:file": "node scripts/build/test/run-tests.mjs"` so **`npm run test:file -- <paths>`** forwards paths to the runner.
- **`test:file` does not run `pretest`:** unlike `npm test`, it skips the automatic full compile. Document that agents should run **`npm run build`** (or `npm run validate` / full `npm test`) first when the selected tests or contracts depend on a fresh **`dist/`** or compile output.

### 5.3 `scripts/build/test/root-entrypoints-contract.test.mjs`

- When `gitChangedFiles` is non-empty, fail with a message that lists **paths** and states remediation: for compile-owned outputs run **`npm run build`**; for doctrine-owned roots run **`npm run doctrine:build`**; then commit generated outputs, or discard local edits to those tracked files.

## 6. Package metadata

- Set `"license": "UNLICENSED"` in root [`package.json`](../../../package.json) (add field).
- Do **not** add a `LICENSE` file for this work.

## 7. Prettier and CI

### 7.1 Configuration

- Add `prettier` as a **root** `devDependency`.
- Add `.prettierrc` (minimal: consistent defaults; match existing style where obvious).
- Add `.prettierignore`: `dist/`, `**/node_modules/`, lockfiles, `dashboard/` (v1), and other generated or vendor paths as needed after a quick repo scan.

### 7.2 Scripts

- `"format": "prettier --write ."` (or scoped glob excluding ignored paths — Prettier respects `.prettierignore`).
- `"format:check": "prettier --check ."`

### 7.3 CI

- In [`.github/workflows/pr-mergeability-gate.yml`](../../../.github/workflows/pr-mergeability-gate.yml), after `npm ci`, add a step `npm run format:check`. This workflow has **no** `paths:` filter on `pull_request` (it already runs for non-draft PRs to `main`), so Prettier-only PRs still hit `format:check` once the step exists.
- **Path-filter gap (other workflows):** [`.github/workflows/validate.yml`](../../../.github/workflows/validate.yml) and [`.github/workflows/build.yml`](../../../.github/workflows/build.yml) use explicit `paths:` lists. Extend them to include **`.prettierrc`**, **`.prettierignore`**, and **`.github/workflows/pr-mergeability-gate.yml`** (and any related workflow path) so edits that touch only formatter config or the gate file still trigger **those workflows’ existing jobs** (validate/build/test as today)—**not** a duplicate Prettier check unless you deliberately add `format:check` there too.
- **Enforcement split (intentional for v1):** **`format:check` runs only in the PR mergeability gate** unless the project later adds the same step to `validate.yml` / `build.yml`. Path extensions above avoid “silent skips” when Prettier config changes; they do not by themselves add formatting enforcement to those workflows.

## 8. Verification

- `npm run format:check` and `npm run format` after initial format pass.
- `npm run validate`, `npm test`, `npm run check:cursor-rules` when `.cursor/rules/**` changes, **`npm run doctrine:check`** (and regenerate if needed) when `shared/agent-doctrine/**` changes.
- Re-run agent compatibility pass (`/check-agent-compatibility`) optionally to confirm score movement.

## 9. Implementation order

1. LICENSE/README/package.json + README bootstrap + Contributing + dashboard install + doctrine note (regenerate entrypoints).
2. `run-tests.mjs` argv + `test:file` + improved contract assertion.
3. Prettier deps + config + ignore + format + `format:check` + CI step + initial formatted tree (excluding ignored paths).
