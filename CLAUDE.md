> Generated file. Edit doctrine fragments, not this file.

# Project Doctrine

This base fragment is intentionally repository-agnostic.

## Engineering Principles

mindset: prioritise high-value problems; take ownership end-to-end; success = user outcomes not lines of code
design: KISS/YAGNI | DRY | high-cohesion/low-coupling | SOLID-as-refactoring-lens
quality: readability>cleverness | TDD-by-default | conform-to-conventions | tight-error-handling/no-broad-catch | search-before-adding
delivery: small-increments | instrument-observability | quality-built-in
process: source-control-is-truth | done=production-value-not-QA | fix-systems-not-people

## Autonomy and Persistence

- Once given a direction, proactively gather context, plan, implement, test, and refine without waiting for prompts at each step.
- Persist end-to-end: carry changes through implementation and verification rather than stopping at analysis or partial fixes.
- Bias to action: implement with reasonable assumptions; pause for clarification only when genuinely blocked.
- Avoid looping: if re-reading or re-editing the same files without clear progress, stop and surface a concise summary with targeted questions.

## Verification

- Validate changes with relevant project checks before declaring completion.
- Prefer fast, high-signal checks first, then broader checks when risk is higher.
- Report exactly what was run and what passed or failed.
- Never claim tests passed unless they were executed successfully.

## Git Safety

- Inspect branch, remote, and upstream state before synchronization operations.
- Verify target branch and merge intent from repository evidence rather than assumptions.
- Avoid history-rewriting and force operations unless explicitly instructed.

## Change Discipline

- Keep changes scoped to a single coherent objective.
- Prefer incremental commits of working code.
- Avoid unrelated refactors unless required for correctness.
- Preserve behavior-critical logic and test intent during conflict resolution.

## Communication

- For code changes, open by stating what changed and why.
- Be concise, concrete, and explicit about uncertainty.
- If blocked, state the blocker and ask a targeted question.
- Present options as a numbered list when a choice is needed.

## Git Commit Conventions

[Conventional Commits](https://www.conventionalcommits.org/): `feat|fix|style|refactor|docs|build|chore: <description>`

# Autonomy

- Once direction is clear, gather context, plan, implement, and verify without waiting for repeated prompts.
- Continue until the requested outcome is complete, not just partially analyzed.
- Make reasonable assumptions to keep momentum; pause only when blocked or when decisions are irreversible.
- If progress stalls or loops, stop and present a concise blocker summary with targeted questions.

# Change Discipline

- Keep changes scoped to a single coherent objective.
- Prefer incremental commits of working code.
- Do not bypass hooks or required checks to force progress.
- Avoid unrelated refactors unless they are required for correctness.
- Preserve behavior-critical logic and test intent during conflict resolution.

# Communication

- Start by stating what changed and why.
- Be concise, concrete, and explicit about uncertainty.
- When blocked, state the blocker and ask one targeted follow-up question.
- Present options as a numbered list when a choice is needed.

# Engineering Principles

- Prioritize high-value outcomes and own work end-to-end.
- Prefer simple, readable solutions over clever or abstract designs.
- Use established conventions before introducing new patterns.
- Deliver in small, verifiable increments.
- Build quality in from the start with focused testing and clear error handling.
- Treat source control as the authoritative history of decisions.

# Git Safety

- Inspect branch and working-tree state before synchronization operations.
- Verify remote and upstream configuration before fetch, pull, rebase, or merge.
- Do not guess default branches, remotes, or merge intent.
- Avoid history-rewriting or force operations unless explicitly requested.

# Verification

- Validate changes with the project's existing checks before declaring completion.
- Prefer fast, relevant checks first, then broader validation when risk is higher.
- Report exactly what was run and the outcome.
- Do not claim tests passed unless they were executed successfully.

## Surface Adapter: Claude

This entrypoint is loaded from `CLAUDE.md` by Claude-compatible clients.

Delta-only additions for this surface:

- **Memory assumption:** context is cumulative; keep prior decisions unless explicitly replaced.
- **Guidance mode:** default to advisory output (options + recommendation) before execution.
- **Future pattern:** imports/rules may be layered later as optional specialization hooks.

## Repository Overlay: ai-config-os

- Run the repository mergeability gate before PR preparation.
- Keep runtime and build scripts portable across CI environments.

# ai-config-os Claude Overlay

Use this overlay with the base doctrine fragments when operating as a Claude-oriented agent in this repository.

## Repository context and purpose

- AI Config OS is a personal AI behavior layer for Claude Code and related agents.
- Skills are authored in `shared/skills/`, compiled into self-sufficient `dist/` packages, and distributed without requiring source-tree access.
- Skill format and usage reference lives in `docs/SKILLS.md`.

## Repository-specific structure

- Author skills in `shared/skills/`; do not edit generated outputs directly.
- Generated packages live in `dist/clients/<platform>/` and registry output lives in `dist/registry/index.json`.
- Platform capability definitions are in `shared/targets/platforms/`.
- Canonical version source is `VERSION`; derived version files must be synchronized through project scripts.
- Build compiler and linters live in `scripts/build/` and `scripts/lint/`.
- Adapter scripts and generated plugin surfaces live under `adapters/` and `plugins/`.
- Cursor project rules live under `.cursor/rules/*.mdc`; validate with `npm run check:cursor-rules` when you change them. Prefer committing rule files without committing local `.cursor/settings.json` unless the team explicitly shares editor settings.

## Repository-specific workflows

### Create a new skill

```bash
node scripts/build/new-skill.mjs <skill-name>
node scripts/build/new-skill.mjs <skill-name> --no-link
```

Start from `shared/skills/_template/SKILL.md`.

### Verification commands

Run relevant checks for touched surfaces:

```bash
node scripts/build/compile.mjs
npm test
npm run check:cursor-rules
npm run doctrine:check
adapters/claude/dev-test.sh
ops/validate-all.sh
claude plugin validate .
```

Run `npm run doctrine:check` whenever you change `shared/agent-doctrine/**` (regenerate with `npm run doctrine:build` if the check fails).

### Generated entrypoints and full `npm test`

- **`npm run build`** runs the skill compiler only (`compile.mjs`). It emits under `dist/` and does **not** emit root `CLAUDE.md` or root `AGENTS.md`.
- **`npm run doctrine:build`** emits doctrine-driven root entrypoints (root `CLAUDE.md`, root `AGENTS.md`).
- Full **`npm test`** includes a contract that, after compile, certain **tracked** files stay in sync with generator output, including root **`CLAUDE.md`**, **`dist/clients/codex/AGENTS.md`**, and **`dist/clients/claude-code/.claude-plugin/plugin.json`**. Root **`AGENTS.md`** is doctrine output; the Codex package file under **`dist/`** is compile output—keep both in mind when debugging stale instructions.
- If that contract fails, run **`npm run doctrine:build`** for doctrine-owned roots and **`npm run build`** for compile-owned `dist/` outputs, then commit or revert local edits.

Codex-oriented agents follow **AGENTS.md**; Claude-oriented detail lives in **CLAUDE.md**—use the checklist that matches your surface.

## Repository-specific rules

- Always author skills in `shared/skills/`, never directly in generated plugin outputs.
- Only bump version in `VERSION`; then run `npm run version:sync` and `npm run version:check`.
- Derived version files (for example `package.json` and plugin metadata) are script-managed; do not hand-edit them.
- Use ASCII by default unless existing file content requires non-ASCII.
- Do not revert unrelated in-progress changes in touched files.

## Test integrity and code formatting

**Tests are specification.** Treat existing tests, specs, snapshots, fixtures, mocks, and test data as protected by default.

- Do not edit, rewrite, weaken, delete, skip, xfail, narrow, or otherwise relax test files to make a build pass.
- Do not change snapshots, fixtures, mocks, or test data to rescue a failing implementation.
- If a test appears wrong, outdated, or misaligned with intended behaviour, stop and explain the issue rather than changing it pre-emptively.
- Test changes require explicit user approval. When proposing a test edit, explain why an implementation fix alone is insufficient before proceeding.
- Prefer fixing production code over changing tests.
- Solutions must be general: no hard-coded values designed to pass current test cases, no branching on test-only inputs, no workarounds that satisfy only the current suite.
- Report whether any test-related file (spec, fixture, snapshot, mock) was touched in the change summary.

**Code formatting:** All contributed code must pass `npm run format:check` (Prettier). Run `npm run format` to fix violations before declaring a change complete.

## Repository-specific git and release safety

- Before major sync operations, inspect:
  - `git status --short --branch`
  - `git remote`
  - `git branch -vv`
- Use the local pre-PR gate before PR creation or update:

```bash
bash ops/pre-pr-mergeability-gate.sh
```

- For `claude/*` branch startup flows, fetch/rebase against `main` and perform version sync/check for release-oriented updates.

## Local proxy constraints

This repository may use a local proxy remote (`http://local_proxy@127.0.0.1:41590/git/...`).

- Expected to work: `git add`, `git commit`, `git push -u origin <branch>`.
- Expected not to work in some environments: `gh pr create` (even when `git push` works), direct push to protected `main`, proxy REST API calls. When `gh` is missing or unauthenticated, open a PR from GitHub’s compare URL instead.
- Do not repoint the remote unless explicitly instructed.

## Runtime lib components

`runtime/lib/` is the task control plane and Momentum Engine. Key subsystems:

- **Task control plane:** `task-control-plane-service.mjs`, `task-store-kv.mjs`, `portable-task-lifecycle.mjs` -- KV-backed task persistence and lifecycle.
- **Momentum Engine:** `momentum-engine.mjs`, `momentum-narrator.mjs`, `momentum-observer.mjs`, `momentum-reflector.mjs`, `momentum-shelf.mjs` -- narration, observation, and intent lexicon.
- **Routing policy:** `route-capability-narrowing.mjs`, `routing-policy-validators.mjs`, `execution-selection-resolver.mjs`, `model-path-evaluator.mjs` -- model selection, capability narrowing, and execution selection for skill dispatch.
- **Progress pipeline:** `progress-event-pipeline.mjs`, `observation-event.mjs`, `runtime-action-dispatcher.mjs` -- event routing between components.

Do not edit Worker bindings or KV schemas without updating the matching contracts in `runtime/lib/contracts/`.

## Known landmines

- **`CLAUDE.md` is generated.** Editing it directly will be silently overwritten by `npm run doctrine:build`. Edit `shared/agent-doctrine/repos/ai-config-os/claude.overlay.md` instead, then rebuild.
- **`dist/` is generated.** Never hand-edit files under `dist/`. Run `npm run build` to regenerate after skill or compiler changes.
- **Version drift.** Only bump `VERSION`; hand-editing `package.json` or plugin metadata will break `npm run version:check`. Always follow with `npm run version:sync`.
- **`npm test` includes `pretest` compile.** If `dist/` is stale or compile fails, all tests will fail or produce false results. Run `npm run build` first when diagnosing test failures.
- **`gh pr create` may fail.** The local proxy does not support `gh` REST calls in all environments. Open PRs from GitHub's compare URL when `gh` is unavailable.
- **Symlinks in plugin output.** `plugins/core-skills/` may use dev symlinks on Unix. On CI or Windows these are real copies. Do not rely on symlink semantics in plugin paths.

## Living docs protocol

Use authoritative ownership for documentation updates to avoid duplicated guidance:

- `README.md`: directory structure, install steps, major capabilities
- `PLAN.md`: phase status, acceptance outcomes, next actions
- `CLAUDE.md`: developer conventions and operational workflows
- `shared/manifest.md`: skill inventory changes
- `docs/SKILLS.md`: skill format and feature contract changes
- `docs/CI_PATTERNS.md`: CI portability pitfalls and safe patterns
- `docs/SUPPORTED_TODAY.md`: current support matrix status

When in doubt, keep facts in their owning doc and remove duplicates elsewhere.
