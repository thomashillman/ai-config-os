# Design: Agent compatibility remediation (ai-config-os)

**Status:** Approved for implementation planning  
**Date:** 2026-03-31  
**Brainstorming:** Scope B (docs, tests, governance, Prettier + CI). License posture: **none** (not MIT; no LICENSE file).

## 1. Problem

Agent compatibility review reported: missing root `npm install` in README, Contributing under-spec vs AGENTS.md, dashboard path without install, heavy full-test loop, opaque failures from the root entrypoint contract test, false MIT/README license claims vs repo metadata, and no repo-root formatter for scanner/CI alignment.

## 2. Goals

- Cold contributors and agents can bootstrap from **README** with explicit **root** `npm ci` / `npm install` before Node build/test commands.
- **Dashboard** instructions include `npm install` (or `npm ci`) in `dashboard/` before `npm run dev`.
- **Contributing** lists the same **tiered** verification ladder as agent entrypoints (validate/build, test, cursor-rules when relevant), with **AGENTS.md** as the canonical full matrix and **Claude** paths (`adapters/claude/dev-test.sh`, etc.) as the plugin-specific tier.
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

1. Minimal repo loop: `npm run validate` or `npm run build`, `npm test`, and `npm run check:cursor-rules` when `.cursor/rules/**` changes.
2. Link to **AGENTS.md** for the complete verification list.
3. Claude/plugin packaging: `bash adapters/claude/dev-test.sh` and related commands when those surfaces change.

### 4.3 Doctrine fragments (not generated roots)

`AGENTS.md` and `CLAUDE.md` are generated — edit **doctrine overlays**, e.g.:

- [`shared/agent-doctrine/repos/ai-config-os/codex.overlay.md`](../../../shared/agent-doctrine/repos/ai-config-os/codex.overlay.md)
- [`shared/agent-doctrine/repos/ai-config-os/claude.overlay.md`](../../../shared/agent-doctrine/repos/ai-config-os/claude.overlay.md)

Add a short **Generated entrypoints** (or **Before full test**) note:

- Full `npm test` includes a contract that **tracked** generator outputs stay in sync after compile (e.g. root `CLAUDE.md`, `dist/clients/codex/AGENTS.md`, Claude plugin metadata under `dist/`).
- Local edits without regenerating and committing will fail that test; run `npm run build` (and doctrine emit as needed), commit, or revert.

Add a **cross-surface** one-liner: Codex agents use **AGENTS.md**; Claude-oriented detail also in **CLAUDE.md** / overlay — pick the checklist that matches the surface you are using.

Regenerate entrypoints per repo workflow (`npm run doctrine:build` / compile as documented) so generated files stay consistent.

## 5. Test runner and contract test

### 5.1 `scripts/build/test/run-tests.mjs`

- If additional CLI arguments are present after the script name, treat them as explicit `.test.mjs` paths (resolve relative to cwd or repo conventions as implemented).
- Preserve existing behavior when **no** extra args: discover all tests, classify dist-writers vs pure, two-phase execution unchanged for the selected or full set.

### 5.2 `package.json` scripts

- Add e.g. `test:file` that documents invocation, e.g. `node scripts/build/test/run-tests.mjs` with placeholder comment in docs or pass-through: `"test:file": "node scripts/build/test/run-tests.mjs"` (npm run test:file -- path).

### 5.3 `scripts/build/test/root-entrypoints-contract.test.mjs`

- When `gitChangedFiles` is non-empty, fail with a message that lists **paths** and states remediation: run `npm run build` / doctrine emit, commit generated outputs, or discard local edits to those tracked files.

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

- In [`.github/workflows/pr-mergeability-gate.yml`](../../../.github/workflows/pr-mergeability-gate.yml), after `npm ci`, add a step `npm run format:check`.
- Extend workflow `paths` filters if required so changes to Prettier config always run the gate (follow existing patterns in that file and `validate.yml`).

## 8. Verification

- `npm run format:check` and `npm run format` after initial format pass.
- `npm run validate`, `npm test`, `npm run check:cursor-rules` when rules change.
- Re-run agent compatibility pass (`/check-agent-compatibility`) optionally to confirm score movement.

## 9. Implementation order

1. LICENSE/README/package.json + README bootstrap + Contributing + dashboard install + doctrine note (regenerate entrypoints).
2. `run-tests.mjs` argv + `test:file` + improved contract assertion.
3. Prettier deps + config + ignore + format + `format:check` + CI step + initial formatted tree (excluding ignored paths).
