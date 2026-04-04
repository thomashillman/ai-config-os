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
