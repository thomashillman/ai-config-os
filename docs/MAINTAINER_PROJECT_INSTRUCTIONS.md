# Maintainer: project instruction materialiser

Use `scripts/build/materialise-project-instructions.mjs` to generate root instruction files for an external target repository.

## What it writes

- `<target>/CLAUDE.md` from: base + Claude surface + overlays.
- `<target>/AGENTS.md` from: base + Codex surface + overlays.

Doctrine defaults are sourced from:

- `shared/agent-doctrine/base/*.md` (deterministic filename order)
- `shared/agent-doctrine/surfaces/claude.md`
- `shared/agent-doctrine/surfaces/codex.md`

## Usage

```bash
node scripts/build/materialise-project-instructions.mjs <target-repo-path> \
  --overlay /path/to/external-overlay
```

### Options

- `--dry-run`: print what would be written.
- `--claude-only`: only write `CLAUDE.md`.
- `--codex-only`: only write `AGENTS.md`.
- `--overlay <dir>`: load optional `base.md`, `claude.md`/`CLAUDE.md`, `codex.md`/`AGENTS.md`.
- Repeatable explicit overlay entries: `--overlay-file <surface>=<path>` where surface is `base`, `claude`, `codex`, or `agents`.
- Explicit per-surface overlay file flags (also supported):
  - `--base-overlay-file <path>`
  - `--claude-overlay-file <path>`
  - `--codex-overlay-file <path>`

## Sample overlay fixture

A minimal example overlay for an external repository is included at (example only, not used as a default source):

`scripts/build/fixtures/project-instructions/sample-external-repo-overlay/`
