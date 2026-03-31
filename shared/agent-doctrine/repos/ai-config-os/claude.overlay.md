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
adapters/claude/dev-test.sh
ops/validate-all.sh
claude plugin validate .
```

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
- Expected not to work in this environment: `gh pr create`, direct push to protected `main`, proxy REST API calls.
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
