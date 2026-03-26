> Generated file. Edit doctrine fragments, not this file.

# AI Config OS

**Purpose:** Personal AI behaviour layer - skills, hooks, and conventions for Claude Code and other AI agents. Skills are authored in `shared/skills/`, compiled into self-sufficient packages (`dist/`), and distributed without requiring source-tree access. See `docs/SKILLS.md` for the skills reference.

## Engineering Principles

mindset:  prioritise high-value problems; take ownership end-to-end; success = user outcomes not lines of code
design:   KISS/YAGNI | DRY | high-cohesion/low-coupling | SOLID-as-refactoring-lens
quality:  readability>cleverness | TDD-by-default | conform-to-conventions | tight-error-handling/no-broad-catch | search-before-adding
delivery: small-increments | instrument-observability | quality-built-in
process:  source-control-is-truth | done=production-value-not-QA | fix-systems-not-people

## Autonomy and Persistence

- Once given a direction, proactively gather context, plan, implement, test, and refine without waiting for prompts at each step.
- Persist end-to-end: carry changes through implementation and verification rather than stopping at analysis or partial fixes.
- Bias to action: implement with reasonable assumptions; pause for clarification only when genuinely blocked.
- Avoid looping: if re-reading or re-editing the same files without clear progress, stop and surface a concise summary with targeted questions.

## Structure

- `shared/skills/` - canonical skill definitions (author here only; compiler reads only from this directory)
- `dist/clients/<platform>/` - emitted packages (claude-code, cursor); self-sufficient, no source-tree references
- `dist/registry/index.json` - cross-platform skill registry
- `shared/targets/platforms/` - platform capability definitions
- `VERSION` - canonical release version (only file humans edit for version bumps)
- `scripts/build/` - compiler: validates skills, resolves compatibility, emits `dist/`
- `scripts/lint/` - Node-based linters for skills and platform files
- `adapters/claude/materialise.sh` - shell wrapper for client-side package materialization
- `worker/` - Cloudflare Worker serving compiled skills via bearer-auth REST API
- `runtime/` - desired-state tool management: config, adapters, sync, manifest, MCP server
- `dashboard/` - React SPA: tool status, skill stats, context cost, config, audit, analytics
- `plugins/core-skills/skills/` - optional symlinks into shared/skills (never edit here directly)

## Creating a new skill

```bash
node scripts/build/new-skill.mjs <skill-name>            # creates dir, updates manifest, optional symlink
node scripts/build/new-skill.mjs <skill-name> --no-link  # skip symlink (non-Unix)
```

Start from `shared/skills/_template/SKILL.md`. See `docs/SKILLS.md` for frontmatter reference (invocation control, subagents, capability contracts, multi-model variants).

## Build and test

```bash
npm install                                     # first time only
node scripts/build/compile.mjs                  # validate + resolve compatibility + emit dist/
npm test                                        # delivery contract + portability tests
adapters/claude/dev-test.sh                     # validate plugin structure
ops/validate-all.sh                             # pre-commit gate (all validators)
```

See `docs/DEPLOYMENT.md` for Worker deployment and Executor Worker architecture.
See `docs/SESSION_START.md` for session-start robustness contract.

## Key rules

- Always author skills in `shared/skills/`, never directly in `plugins/`
- Only bump version in `VERSION`; run `npm run version:sync` then `npm run version:check` before committing
- `package.json` and `plugins/core-skills/.claude-plugin/plugin.json` versions are derived - never edit by hand
- Symlinks are optional Unix convenience; if created, use relative paths: `../../../shared/skills/<name>`
- Run `claude plugin validate .` before committing
- Default to ASCII when editing or creating files; only introduce non-ASCII where already present with clear justification
- Add code comments only when logic is genuinely non-obvious; comments that explain what the code does add no value
- Never revert changes you did not make; work around unrelated edits in files you touch
- If unexpected changes appear in files you are editing mid-session, stop and ask before proceeding

## Session startup checklist

Before doing any work on a `claude/` branch:

1. **Fetch main**
   ```sh
   git fetch origin main
   ```
2. **Rebase onto main** (skip if branch has been reviewed, 5+ commits with likely conflicts, or cut from historical tag)
   ```sh
   git rebase origin/main
   ```
3. **Version bump** - edit `VERSION` only, then sync derived files:
   ```sh
   npm run version:sync
   npm run version:check
   ```

Use the `git-ops` skill to validate before rebasing.

## Workflow - Local Proxy Environment

Remote is `http://local_proxy@127.0.0.1:41590/git/...` - not a direct GitHub connection.

**Works:**
- `git add` + `git commit` + `git push -u origin <branch-name>`

**Does NOT work - skip these immediately:**
- `gh pr create` - gh cannot resolve the local proxy as a known GitHub host
- `git push origin main` - branch protection returns HTTP 403
- Proxy REST API calls (`/api/v1/...`) - proxy handles git protocol only, not REST
- Repointing remote to github.com - the GITHUB_TOKEN in the environment is not valid for that repo

Merging to main happens via the repo owner's GitHub UI. Do not retry failing approaches.

## Cross-Platform CI Patterns

See `docs/CI_PATTERNS.md` for the full reference (pitfalls, safe patterns, reusable utilities).

**Critical landmine:** Never pass `path.resolve()` output to `import()`. Use `new URL('../path.mjs', import.meta.url).href` instead - on Windows, `path.resolve()` produces `D:\...` paths that Node treats as a URL scheme and rejects.

## Living docs protocol

Each doc owns a distinct slice - never duplicate content across them:

| Doc | Update when |
|-----|-------------|
| `README.md` | Directory structure changes, install steps change, new major capability added |
| `PLAN.md` | A phase completes, acceptance criteria are met, recommended next steps change |
| `CLAUDE.md` | Dev conventions change, new ops scripts added, git/proxy workflow changes |
| `shared/manifest.md` | A skill is added, renamed, or removed (one row per skill) |
| `docs/SKILLS.md` | Skill format changes, new Claude Code skill features, hooks patterns |
| `docs/CI_PATTERNS.md` | New CI pitfall found, new platform added to matrix, Windows portability pattern updated |
| `docs/SUPPORTED_TODAY.md` | Platform support status changes, new surface confirmed or deprecated |

**Rules for Claude agents:**
- After any commit that creates or modifies a skill: update `shared/manifest.md` row + check if README or PLAN.md need a line.
- After any commit that changes repo structure (new top-level dir, new ops script): update README directory table + CLAUDE.md Structure section.
- After any merge to main: update PLAN.md "Current state" table and "Recommended next" section.
- Never duplicate content across docs. If you find the same fact in two places, pick the authoritative owner above and remove it from the other.
- Run `ops/check-docs.sh` before committing to see which docs the changed files are expected to touch.

## Continual self-improvement

If a task failed or ran inefficiently, state explicitly: (1) what went wrong, (2) what to do differently next time.
Token efficiency is paramount. Prefer concise tool calls; avoid re-reading files already in context.
**Plan closure:** Reconcile every stated TODO before finishing - mark each Done, Blocked (one sentence + question), or Cancelled.
**Promise discipline:** Do not commit to tests or broad refactors unless executing them in the same turn.

## Communication style

- For code changes: open with what changed and why - not a "Summary:" heading.
- Suggest next steps briefly at the end; omit entirely if there are none.
- When offering options, use a numbered list so the user can respond with a single number.
- Never reproduce large files in responses; reference paths instead.
- If blocked, state the blocker explicitly and ask a targeted question rather than leaving it implicit.

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

## Surface Adapter: Codex

This entrypoint is loaded from `AGENTS.md` by Codex-compatible clients.

Delta-only local repo contract:

- Execute explicitly: inspect state, apply minimal change, run checks, report results.
- Keep guidance local to this repository and this task.
- Prefer deterministic, auditable command sequences over implicit behavior.

## Repository Overlay: ai-config-os

- Run the repository mergeability gate before PR preparation.
- Keep runtime and build scripts portable across CI environments.

# ai-config-os Codex Overlay

Use this overlay with the base doctrine fragments when operating as a Codex-oriented agent in this repository.

## Repository-specific structure

- Primary authoring surface for skills is `shared/skills/`.
- Build and emit logic lives in `scripts/build/`.
- Claude adapter materialization logic lives in `adapters/claude/`; Codex adapter logic lives in `adapters/codex/`.
- Canonical release version is stored in `VERSION` and synced into derived files via scripts.

## Repository-specific verification commands

Run applicable checks before completion:

```bash
node scripts/build/compile.mjs
npm test
ops/validate-all.sh
```

If Claude packaging surfaces are touched, additionally run:

```bash
adapters/claude/dev-test.sh
claude plugin validate .
```

## Repository-specific git and merge safety

- Inspect branch, remote, and upstream state before synchronization actions:
  - `git status --short --branch`
  - `git remote`
  - `git branch -vv`
- Run the mandatory local gate as the final pre-PR step:

```bash
bash ops/pre-pr-mergeability-gate.sh
```

- For version updates, edit `VERSION` and then run:

```bash
npm run version:sync
npm run version:check
```
