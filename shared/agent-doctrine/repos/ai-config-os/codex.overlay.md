# ai-config-os Codex Overlay

Use this overlay with the base doctrine fragments when operating as a Codex-oriented agent in this repository.

## Repository context and purpose

- AI Config OS is a personal AI behavior layer for Claude Code and related agents.
- Skills are authored in `shared/skills/`, compiled into self-sufficient `dist/` packages, and distributed without requiring source-tree access.
- Skill format and usage reference lives in `docs/SKILLS.md`.

## Repository-specific structure

- Primary authoring surface for skills is `shared/skills/`.
- Generated outputs live in `dist/clients/<platform>/` and `dist/registry/index.json`.
- Build and emit logic lives in `scripts/build/`; supporting lint scripts live in `scripts/lint/`.
- Platform capability definitions are in `shared/targets/platforms/`.
- Canonical release version is stored in `VERSION` and synced into derived files via scripts.
- Cursor project rules live under `.cursor/rules/*.mdc`; validate with `npm run check:cursor-rules` when you change them. Prefer committing rule files without committing local `.cursor/settings.json` unless the team explicitly shares editor settings.

## Repository-specific workflows

### Create a new skill

```bash
node scripts/build/new-skill.mjs <skill-name>
node scripts/build/new-skill.mjs <skill-name> --no-link
```

Start from `shared/skills/_template/SKILL.md`.

### Verification commands

Run applicable checks before completion:

```bash
node scripts/build/compile.mjs
npm test
npm run check:cursor-rules
npm run doctrine:check
ops/validate-all.sh
```

Run `npm run doctrine:check` whenever you change `shared/agent-doctrine/**` (regenerate with `npm run doctrine:build` if the check fails).

If Claude packaging surfaces are touched, additionally run:

```bash
adapters/claude/dev-test.sh
claude plugin validate .
```

### Generated entrypoints and full `npm test`

- **`npm run build`** runs the skill compiler only (`compile.mjs`). It emits under `dist/` and does **not** emit root `CLAUDE.md` or root `AGENTS.md`.
- **`npm run doctrine:build`** emits doctrine-driven root entrypoints (root `CLAUDE.md`, root `AGENTS.md`).
- Full **`npm test`** includes a contract that, after compile, certain **tracked** files stay in sync with generator output, including root **`CLAUDE.md`**, **`dist/clients/codex/AGENTS.md`**, and **`dist/clients/claude-code/.claude-plugin/plugin.json`**. Root **`AGENTS.md`** is doctrine output; the Codex package file under **`dist/`** is compile output—keep both in mind when debugging stale instructions.
- If that contract fails, run **`npm run doctrine:build`** for doctrine-owned roots and **`npm run build`** for compile-owned `dist/` outputs, then commit or revert local edits.

Codex-oriented agents follow **AGENTS.md**; Claude-oriented workflows also use **CLAUDE.md**—use the checklist that matches your surface.

## Repository-specific rules

- Author skills only in `shared/skills/`; do not hand-edit generated distributions.
- Only bump version in `VERSION`; then run `npm run version:sync` and `npm run version:check`.
- Derived version files are script-managed and should not be edited manually.
- Use ASCII by default unless existing file content requires non-ASCII.
- Do not revert unrelated in-progress changes in touched files.

## Repository-specific git and merge safety

- Inspect branch, remote, and upstream state before synchronization actions:
  - `git status --short --branch`
  - `git remote`
  - `git branch -vv`
- Run the mandatory local gate as the final pre-PR step:

```bash
bash ops/pre-pr-mergeability-gate.sh
```

## Local proxy constraints

This repository may use a local proxy remote (`http://local_proxy@127.0.0.1:41590/git/...`).

- Expected to work: `git add`, `git commit`, `git push -u origin <branch>`.
- Expected not to work in some environments: `gh pr create` (even when `git push` works), direct push to protected `main`, proxy REST API calls. When `gh` is missing or unauthenticated, open a PR from GitHub’s compare URL instead.
- Do not repoint the remote unless explicitly instructed.

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
