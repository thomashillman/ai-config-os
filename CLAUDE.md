# AI Config OS

**Purpose:** Personal AI behaviour layer (skills, hooks, and conventions) for Claude Code and other AI agents. Skills are authored once in `shared/skills/`, compiled into self-sufficient packages (`dist/`), and distributed or materialised without requiring source-tree access.

Skills in this repo follow the [Agent Skills](https://agentskills.io) open standard, a portable format supported by 30+ agent products (Claude Code, Cursor, VS Code, GitHub Copilot, Gemini CLI, OpenAI Codex, and others). This repo extends the standard with multi-model variants, capability contracts, and cross-platform distribution. See `docs/SKILLS.md` for the comprehensive skills reference.

## Engineering Mindset

- Understand requirements, constraints, and context before writing any code.
- Prioritise high-value problems; say no to low-impact work.
- Take ownership from idea through to production and iteration.
- Success is measured by outcomes for users, not lines of code or feature count.

## Engineering Principles

KISS, DRY, TDD, readability over cleverness, tight error handling, ship in small increments. See `docs/ENGINEERING.md` for the full SOLID breakdown, code quality rules, delivery, and process principles.

## Autonomy and Persistence

- Once given a direction, proactively gather context, plan, implement, test, and refine without waiting for prompts at each step.
- Persist end-to-end: carry changes through implementation and verification rather than stopping at analysis or partial fixes.
- Bias to action: implement with reasonable assumptions; pause for clarification only when genuinely blocked.
- Avoid looping: if re-reading or re-editing the same files without clear progress, stop and surface a concise summary with targeted questions.

## Structure

### Source & Distribution (Portability Contract)
- **`shared/skills/`**: canonical skill definitions (author here). Compiler reads only from this directory.
- **`dist/clients/<platform>/`**: emitted packages (claude-code, cursor). Each package is **self-sufficient**: contains complete skill copies and required resources (prompts/). No symlinks, no references to source tree.
- **`dist/registry/index.json`**: cross-platform skill registry with compatibility matrix

### Metadata & Configuration
- `shared/targets/platforms/`: platform capability definitions (v0.5.2+)
- `shared/targets/clients.yaml`: DEPRECATED: use platforms/ directory instead
- `VERSION`: canonical release version (only file humans edit for version bumps)
- `.claude-plugin/marketplace.json`: marketplace manifest
- `schemas/skill.schema.json`: JSON Schema for skill package manifests
- `schemas/platform.schema.json`: JSON Schema for platform capability definitions
- `schemas/probe-result.schema.json`: JSON Schema for runtime probe output

### Tools & Runtime
- `scripts/build/`: compiler: validates skills, resolves compatibility, emits `dist/` artefacts
- `scripts/lint/`: Node-based linters for skills and platform files
- `scripts/build/lib/materialise-client.mjs`: extracts emitted packages (works from `dist/` alone, no source access)
- `adapters/claude/materialise.sh`: shell wrapper for client-side package materialization
- `worker/`: Cloudflare Worker serving compiled skills via bearer-auth REST API
- `runtime/`: desired-state tool management: config, adapters, sync, manifest, MCP server
- `dashboard/`: React SPA: tool status, skill stats, context cost, config, audit, analytics

### Development Convenience (Unix Only)
- `plugins/core-skills/skills/`: optional symlinks into shared/skills (never edit here directly). Created with `node scripts/build/new-skill.mjs` (with default --link flag). Use `--no-link` to skip on platforms without symlink support.

## Creating a new skill
Run `node scripts/build/new-skill.mjs <skill-name>` to create the skill directory, update the manifest, and optionally create a convenience symlink on Unix. Use `--no-link` to skip symlink creation. The Unix wrapper `ops/new-skill.sh` delegates to this command. It does **not** change `VERSION`, `package.json`, or `plugin.json`. Release version bumps are a separate, explicit action (edit `VERSION`, then `npm run version:sync`).

### Skill format overview

Skills follow the [Agent Skills open standard](https://agentskills.io/specification). At minimum, a SKILL.md needs `name` and `description` in YAML frontmatter. This repo extends the standard with additional fields, see `docs/SKILLS.md` for the full reference covering:
- **Invocation control** (`disable-model-invocation`, `user-invocable`), who can trigger the skill
- **Subagent execution** (`context: fork`, `agent`), run skills in isolated contexts
- **Dynamic context** (`` !`command` ``), inject shell command output into skill prompts
- **Argument substitution** (`$ARGUMENTS`, `$0`, `${CLAUDE_SKILL_DIR}`), pass data to skills
- **Capability contracts**: declare required/optional capabilities for cross-platform compatibility
- **Multi-model variants**: model-specific prompt files with cost/latency metadata
- **Testing**: automated validation in frontmatter

## Portability Contract (v0.6.0+)

`shared/skills/` is the only source of truth. Emitted packages in `dist/clients/<platform>/` are self-sufficient (no source-tree access required). Symlinks in `plugins/` are optional Unix convenience. See `docs/PORTABILITY.md` for the full contract, automated tests, and failure recovery steps.

## Testing locally
Run `adapters/claude/dev-test.sh` to validate structure and test the plugin.

## Delivery contract (v0.5.3+)

28 automated tests (scripts/build/test/delivery-contract.test.mjs) enforce that all `dist/` artifacts are complete, consistent, and valid. Build fails on any violation, blocking PR merges. See `docs/DELIVERY.md` for the full test list, enforcement details, and failure recovery steps.

## Continual self-improvement

**Your self-improvement is key.** If a task has failed or not worked efficiently, you **must** visibly state:

1. **What went wrong**: be explicit, not vague
2. **What to do differently**: concrete steps to prevent recurrence

Token efficiency is paramount. **Unnecessary token wastage is forbidden.** Prefer concise tool calls, avoid re-reading files you already have in context, and do not repeat information already established.

**Plan closure:** Before finishing any task, reconcile every previously stated intention or TODO, mark each as Done, Blocked (one-sentence reason + targeted question), or Cancelled (with reason). Do not end with in-progress or pending items.

**Promise discipline:** Do not commit to tests or broad refactors unless executing them in the same turn. Label deferred work explicitly as optional "Next steps" and exclude it from the committed plan.

## Key rules
- Always author skills in `shared/skills/`, never directly in `plugins/`
- Only bump version in the root `VERSION` file; run `npm run version:sync` to mirror it, then `npm run version:check` before committing
- The scaffold command (`scripts/build/new-skill.mjs`) must not mutate release-version mirrors (`VERSION`, `package.json`, `plugin.json`)
- Symlinks are optional Unix convenience; if created, they must use relative paths: `../../../shared/skills/<name>`
- Run `claude plugin validate .` before committing
- Start new skills from `shared/skills/_template/SKILL.md` (Phase 2: enhanced with full frontmatter)
- Default to ASCII when editing or creating files; only introduce non-ASCII characters where the file already uses them and there is clear justification.
- Add code comments only when logic is genuinely non-obvious; comments that explain *what* the code does add no value, reserve them for complex blocks that would otherwise take significant effort to parse.
- Never revert changes you did not make. If a file contains unrelated edits, work around them. If changes are in files you are actively editing, read and understand them before proceeding.
- If unexpected changes appear in files you are working on mid-session, stop immediately and ask the user how to proceed before making further edits.

## Session startup checklist

Before doing any work on a `claude/` branch:

1. **Fetch main to get latest state**
   ```sh
   git fetch origin main
   ```

2. **Rebase onto main** (if safe)
   ```sh
   git rebase origin/main
   ```
   - Skip if: branch has been reviewed, 5+ commits with likely conflicts, or deliberately cut from a historical tag
   - Use the `git-ops` skill to validate before rebasing

3. **When bumping the release version, edit only the `VERSION` file**
   ```sh
   # Edit VERSION, then sync derived files
   npm run version:sync
   npm run version:check
   ```
   - `package.json` and `plugins/core-skills/.claude-plugin/plugin.json` are derived, never edit their versions by hand
   - The parity check will fail in CI if any file is out of sync

The `git-ops` skill automates rebasing checks. Use it when rebasing.

## Session-Start Robustness Contract (v0.8.0+)

At session start, `.claude/hooks/session-start.sh` runs five steps in order: task resumption, skill validation, runtime sync, capability probe (cached at `~/.ai-config-os/probe-report.json`), and background manifest fetch. Skills are local-first, the Worker being unreachable does not break the session. See `docs/ROBUSTNESS.md` for guarantees, architecture, and failure recovery.

## Phase 2: Enhanced SKILL.md Frontmatter

All skills define metadata in YAML frontmatter. The `skill` and `description` fields follow the [Agent Skills open standard](https://agentskills.io/specification); all other fields are repo-specific extensions. Start new skills from `shared/skills/_template/SKILL.md`. See `docs/SKILLS.md` for the full reference (invocation control, subagents, hooks, dynamic context, variants, testing).

## Living docs protocol

Four docs stay in sync; each owns a distinct slice:

| Doc | Update when |
|---|---|
| `README.md` | Directory structure changes, install steps change, new major capability added |
| `PLAN.md` | A phase completes, acceptance criteria are met, recommended next steps change |
| `CLAUDE.md` | Dev conventions change, new ops scripts added, git/proxy workflow changes |
| `shared/manifest.md` | A skill is added, renamed, or removed (one row per skill) |
| `docs/SKILLS.md` | Skill format changes, new Claude Code skill features, hooks patterns, Agent Skills standard updates |
| `docs/CI_PITFALLS.md` | A new multi-platform CI pitfall is identified |
| `docs/WINDOWS_PATTERNS.md` | A new Windows/macOS-safe code pattern is established |
| `docs/PORTABILITY.md` | Portability contract changes, new automated tests added |
| `docs/DELIVERY.md` | Delivery contract changes, new delivery tests added |
| `docs/ROBUSTNESS.md` | Session-start hook behaviour changes, new robustness guarantees |
| `docs/ENGINEERING.md` | Core design or code quality principles change |

**Rules for Claude agents:**
- After any commit that creates or modifies a skill: update `shared/manifest.md` row + check if README or PLAN.md need a line.
- After any commit that changes repo structure (new top-level dir, new ops script): update README directory table + CLAUDE.md Structure section.
- After any merge to main: update PLAN.md "Current state" table and "Recommended next" section.
- Never duplicate content across docs. If you find the same fact in two places, pick the authoritative owner (table above) and remove it from the other, replacing with a link.
- Run `ops/check-docs.sh` before committing to see which docs the changed files are expected to touch.

## Distribution layer

Skills are compiled and distributed via a GitHub-authored, CI-built, Cloudflare-served pipeline. Compatibility is computed from capability contracts (v0.5.2+).

### Build
```bash
npm install                            # first time only
node scripts/build/compile.mjs         # validate + resolve compatibility + emit dist/
node scripts/build/compile.mjs --validate-only  # full validation pipeline, no file output
node scripts/build/compile.mjs --release        # emit with provenance (CI/release only)
```

The compiler reads the release version from the root `VERSION` file. Local builds are deterministic, no timestamps or git metadata are injected. Provenance (built_at, build_id, source_commit) is only added in release mode (`--release` flag or `AI_CONFIG_RELEASE=1` env var).

Output: `dist/clients/<platform>/` (claude-code, cursor) + `dist/registry/index.json`

The registry now includes `platform_definitions`: full capability definitions from `shared/targets/platforms/*.yaml` embedded at build time. This lets the Worker serve canonical capability data without YAML file access. See `docs/CAPABILITY_API.md`.

### Capability Discovery API

The Worker exposes two CORS-enabled endpoints for all platforms (web, iOS, desktop):

```
GET /v1/capabilities/platform/{platform}   → capability profile (immutable by platform)
GET /v1/skills/compatible?caps=cap1,cap2   → filtered skills (immutable by version+caps)
```

**Reference client:** `adapters/claude/capabilities-client.mjs`
**API docs:** `docs/CAPABILITY_API.md`
**Web integration guide:** `docs/WEB_INTEGRATION.md`

### Skill capability contract
Skills declare structured capability requirements in YAML frontmatter:

```yaml
capabilities:
  required: [git.read, shell.exec]     # must be supported for skill to work
  optional: [fs.write]                 # enhances skill but not essential
  fallback_mode: prompt-only           # none | manual | prompt-only
  fallback_notes: "User can paste git output manually"
```

Platform overrides are thin and optional, most skills need none:
```yaml
platforms:
  cursor:
    package: rules                     # override default package format
    mode: degraded                     # native | degraded | excluded
    notes: "No hook surface in Cursor"
  claude-web:
    allow_unverified: true             # emit even for unverified capabilities
```

Skills without a `platforms:` block are emitted to all platforms where their required capabilities are supported. See `schemas/skill.schema.json` for the full contract.

### Platform definitions
Platform capability states live in `shared/targets/platforms/*.yaml`. Each capability has a status (`supported`/`unsupported`/`unknown`), evidence date, confidence level, and source. The compiler resolves skill-platform compatibility from these.

### Linting
```bash
node scripts/lint/skill.mjs shared/skills/*/SKILL.md      # schema + custom rules
node scripts/lint/platform.mjs shared/targets/platforms/*.yaml  # schema validation
```

### Worker deployment
```bash
cd worker
wrangler secret put AUTH_TOKEN         # set bearer token
wrangler deploy                        # deploy to Cloudflare
```

### Executor Worker (Phase 1)

A separate Cloudflare Worker that serves pre-computed skill metadata and artifacts from KV/R2. Phase 0 tools (sync_tools, list_tools, etc.) are not available and return 403. See `worker/executor/README.md` for tools, architecture, deployment, and local development.

### Fetching from Worker (local)
```bash
export AI_CONFIG_TOKEN=<your-token>
export AI_CONFIG_WORKER=https://ai-config-os.workers.dev  # or local
bash adapters/claude/materialise.sh         # fetch + cache
bash adapters/claude/materialise.sh status  # compare versions
```

## Runtime

The `runtime/` layer manages tool installation and configuration:

- **Config:** Three-tier YAML (`global.yaml` < `machines/{hostname}.yaml` < `project.yaml`)
- **Sync:** `bash runtime/sync.sh`: reconciles desired config with live Claude Code environment
- **Dry run:** `bash runtime/sync.sh --dry-run`: previews changes without applying
- **Watch mode:** `bash runtime/watch.sh`: triggers sync on config file changes
- **Status:** `bash ops/runtime-status.sh`: full runtime health check

### Adding an MCP server

1. Edit `runtime/config/global.yaml` (or machine/project override)
2. Add entry under `mcps:`
3. Run `bash runtime/sync.sh`

### MCP self-management (experimental)

The MCP server at `runtime/mcp/server.js` exposes sync and skill operations as MCP tools, allowing Claude Code to manage its own configuration. Start with `bash runtime/mcp/start.sh`. Treat as experimental until validated in daily use.

## Workflow: Local Proxy Environment

This repo's remote is a local proxy (`http://local_proxy@127.0.0.1:41590/git/…`), not a direct GitHub connection. This has important implications for how Claude agents should operate:

### What works

- Edit files locally
- `git add` + `git commit` on the designated `claude/…` branch
- `git push -u origin <branch-name>`: the proxy supports git smart-HTTP push/pull

### What does NOT work: skip these immediately

- `gh pr create`: gh cannot resolve the local proxy as a known GitHub host
- Direct `git push origin main`: branch protection returns HTTP 403
- Probing the proxy REST API (e.g. `/api/v1/…`), the proxy only handles git protocol, not REST
- Temporarily repointing the remote to github.com and retrying, the GITHUB_TOKEN in the environment is not valid for that repo

### Correct approach

Do the minimum that is known to succeed:

```sh
# 1. Make changes on the designated claude/ branch
git add <files>
git commit -m "type: description"

# 2. Push the branch, this is the reliable endpoint
git push -u origin claude/<branch-name>
```

Merging to main happens outside the agent session (via the repo owner's GitHub UI or equivalent). Do not waste turns attempting `gh pr create`: REST API calls, or direct main pushes after the first failure.

## Cross-Platform Build Patterns

When writing tests, scripts, or build tools that run on multi-platform CI (Windows, macOS, Linux), see:
- `docs/CI_PITFALLS.md`, 6 common pitfalls (glob patterns, path separators, symlinks, build artifacts)
- `docs/WINDOWS_PATTERNS.md`: safe vs unsafe patterns for ESM imports, path comparisons, temp files

## Communication style

- For code changes: open with a quick explanation of what changed and why (where in the codebase, what it fixes or enables), not a "Summary:" heading.
- Suggest natural next steps briefly at the end; omit entirely if there are none.
- When offering multiple options, use a numbered list so the user can respond with a single number.
- Never reproduce large files in responses; reference paths instead.
- If you could not complete a step, state the blocker explicitly and ask a targeted question rather than leaving it implicit.

## Git Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Use for |
|--------|---------|
| `feat:` | new feature or template |
| `fix:` | bug fix |
| `style:` | CSS-only change |
| `refactor:` | restructure without behaviour change |
| `docs:` | documentation only |
| `build:` | build system / tooling |
| `chore:` | maintenance |

Examples:

```
feat: add downloads archive template
fix: guard feature_image in post-meta partial
style: enforce --color-accent on all CTA buttons
docs: add CLAUDE.md with theme coding standards
build: Ghost theme scaffold (0.1.0)
```
