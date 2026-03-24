# AI Config OS

**Purpose:** Personal AI behaviour layer (skills, hooks, and conventions) for Claude Code and other AI agents. Skills are authored once in `shared/skills/`, compiled into self-sufficient packages (`dist/`), and distributed without requiring source-tree access. Skills follow the [Agent Skills](https://agentskills.io) open standard. See `docs/SKILLS.md` for the comprehensive reference.

## Critical constraints

- Always author skills in `shared/skills/`, never directly in `plugins/`
- Only bump version in the root `VERSION` file; run `npm run version:sync` to mirror it, then `npm run version:check` before committing
- The scaffold command (`scripts/build/new-skill.mjs`) must not mutate release-version mirrors (`VERSION`, `package.json`, `plugin.json`)
- Symlinks are optional Unix convenience; if created, use relative paths: `../../../shared/skills/<name>`
- Run `claude plugin validate .` before committing
- Start new skills from `shared/skills/_template/SKILL.md`
- Default to ASCII in all files; only introduce non-ASCII where already used and justified
- Add code comments only when logic is genuinely non-obvious; never to describe what code does
- Never revert changes you did not make; understand unrelated edits before working around them
- Stop and ask if unexpected changes appear in files you are actively editing

## Before you code

On every `claude/` branch, before starting work:

1. `git fetch origin main`
2. `git rebase origin/main` (skip if: branch reviewed, 5+ commits with likely conflicts, or cut from historical tag). Use the `git-ops` skill to validate before rebasing.
3. Version bumps only: edit `VERSION`, then `npm run version:sync && npm run version:check`. Never hand-edit `package.json` or `plugin.json` versions.

## Agent working style

- Proactively gather context, plan, implement, test, and refine without waiting for prompts.
- Persist end-to-end; carry changes through verification rather than stopping at analysis.
- Bias to action with reasonable assumptions; pause only when genuinely blocked.
- Avoid looping: if re-reading or re-editing without clear progress, surface a summary with targeted questions.
- On failure: explicitly state (1) what went wrong and (2) concrete steps to prevent recurrence.
- Token efficiency: no redundant reads; don't repeat information already established.
- Plan closure: before finishing, reconcile every stated intention as Done, Blocked, or Cancelled.
- Promise discipline: don't commit to tests or refactors unless executing them in the same turn.

## Engineering principles

KISS, DRY, TDD, readability over cleverness, tight error handling, ship in small increments. See `docs/ENGINEERING.md` for the full SOLID breakdown, code quality, delivery, and process principles.

## File structure

```
shared/skills/            canonical skill definitions (author here only)
dist/clients/<platform>/  self-sufficient emitted packages (claude-code, cursor)
dist/registry/            cross-platform skill registry + capability matrix
shared/targets/platforms/ platform capability definitions
VERSION                   canonical version (edit this; run npm run version:sync after)
schemas/                  JSON Schemas for skills, platforms, probe results
scripts/build/            compiler: validate + emit dist/
scripts/lint/             skill and platform linters
adapters/claude/          materialise.sh: fetch + cache packages from Worker
worker/                   Cloudflare Worker (skills API + capability endpoints)
runtime/                  desired-state tool management (config, sync, MCP)
dashboard/                React SPA (tool status, skills, analytics)
plugins/core-skills/      convenience symlinks to shared/skills/ (Unix only)
```

## Creating a skill

```bash
node scripts/build/new-skill.mjs <skill-name>   # creates dir, updates manifest, Unix symlink
```

Start from `shared/skills/_template/SKILL.md`. Does **not** touch `VERSION`, `package.json`, or `plugin.json`. See `docs/SKILLS.md` for the full frontmatter reference (invocation control, subagents, dynamic context, variants, testing).

## Build and distribute

```bash
npm install
node scripts/build/compile.mjs              # validate + emit dist/
node scripts/build/compile.mjs --release    # emit with provenance (CI only)
bash adapters/claude/dev-test.sh            # validate plugin structure locally
```

`shared/skills/` is the only source of truth; emitted packages need no source access. See `docs/PORTABILITY.md`, `docs/DELIVERY.md`, and `docs/DISTRIBUTION.md` for the full build pipeline, Worker API, and capability contracts.

## Runtime

`runtime/` manages desired-state tool configuration via three-tier YAML (`global.yaml` < `machines/{hostname}.yaml` < `project.yaml`).

- Sync: `bash runtime/sync.sh` | Dry run: add `--dry-run` | Status: `bash ops/runtime-status.sh`
- Add MCP server: add entry under `mcps:` in `runtime/config/global.yaml`, then `bash runtime/sync.sh`

At session start, `.claude/hooks/session-start.sh` runs: task resumption, validation, sync, capability probe, and background manifest fetch. Skills are local-first; Worker unavailability does not break the session. See `docs/ROBUSTNESS.md`.

## Known landmine: local proxy

This repo's remote is a local proxy, not direct GitHub. Only these work:

```sh
git add <files> && git commit -m "type: description"
git push -u origin claude/<branch-name>
```

These **never** work; skip immediately:
- `gh pr create` (proxy is not a GitHub host)
- `git push origin main` (branch protection: 403)
- REST API calls to the proxy (git smart-HTTP only)
- Repointing the remote to github.com (GITHUB_TOKEN not valid for this repo)

Merging to main happens via the repo owner's GitHub UI.

## Cross-platform build

See `docs/CI_PITFALLS.md` (6 pitfalls) and `docs/WINDOWS_PATTERNS.md` (safe ESM imports, path comparisons, symlinks, temp files).

## Living docs protocol

Each doc owns a distinct slice; never duplicate content across them.

| Doc | Update when |
|---|---|
| `README.md` | Directory structure or install steps change |
| `PLAN.md` | A phase completes or recommended next steps change |
| `CLAUDE.md` | Dev conventions, ops scripts, or proxy workflow change |
| `shared/manifest.md` | A skill is added, renamed, or removed |
| `docs/SKILLS.md` | Skill format or Claude Code skill features change |
| `docs/ENGINEERING.md` | Core design or code quality principles change |
| `docs/PORTABILITY.md` | Portability contract or automated tests change |
| `docs/DELIVERY.md` | Delivery contract or delivery tests change |
| `docs/ROBUSTNESS.md` | Session-start behaviour or robustness guarantees change |
| `docs/DISTRIBUTION.md` | Build pipeline, Worker, or capability API details change |
| `docs/CI_PITFALLS.md` | A new multi-platform CI pitfall is identified |
| `docs/WINDOWS_PATTERNS.md` | A new Windows/macOS-safe code pattern is established |

Rules for Claude agents:
- After adding/modifying a skill: update `shared/manifest.md` + check README and PLAN.md.
- After changing repo structure: update README directory table + CLAUDE.md File structure section.
- After merging to main: update PLAN.md "Current state" and "Recommended next" sections.
- Run `ops/check-docs.sh` before committing.

## Communication style

- Open code-change responses with what changed and why; skip "Summary:" headings.
- Numbered lists for multiple options so the user can reply with a single number.
- Never reproduce large files in responses; reference paths instead.
- State blockers explicitly with a targeted question rather than leaving them implicit.

## Git commit conventions

`feat:` new feature | `fix:` bug fix | `refactor:` restructure | `docs:` docs only | `build:` tooling | `style:` CSS only | `chore:` maintenance

Examples: `feat: add skill-name`, `fix: guard VERSION sync`, `docs: update CLAUDE.md`
