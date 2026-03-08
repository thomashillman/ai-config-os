# AI Config OS

**Purpose:** Personal AI behaviour layer — skills, hooks, and conventions for Claude Code and other AI agents. All skill authoring happens in `shared/skills/`; `plugins/` contains only symlinks.

## Structure
- `shared/skills/` — canonical skill definitions (author here)
- `shared/targets/platforms/` — platform capability definitions (v0.5.2+)
- `shared/targets/clients.yaml` — DEPRECATED: use platforms/ directory instead
- `plugins/core-skills/skills/` — symlinks into shared/skills (never edit here directly)
- `.claude-plugin/marketplace.json` — marketplace manifest
- `VERSION` — canonical release version (only file humans edit for version bumps)
- `plugins/core-skills/.claude-plugin/plugin.json` — plugin metadata (mirrors VERSION; do not edit version by hand)
- `schemas/skill.schema.json` — JSON Schema for skill package manifests
- `schemas/platform.schema.json` — JSON Schema for platform capability definitions
- `schemas/probe-result.schema.json` — JSON Schema for runtime probe output
- `scripts/build/` — compiler: validates skills, resolves compatibility, emits `dist/` artefacts
- `scripts/lint/` — Node-based linters for skills and platform files
- `worker/` — Cloudflare Worker serving compiled skills via bearer-auth REST API
- `runtime/` — desired-state tool management: config, adapters, sync, manifest, MCP server
- `dashboard/` — React SPA: tool status, skill stats, context cost, config, audit, analytics

## Creating a new skill
Run `ops/new-skill.sh <skill-name>` — this creates the skill directory, symlink, and manifest entry. It does **not** change `VERSION`, `package.json`, or `plugin.json`. Release version bumps are a separate, explicit action (edit `VERSION`, then `npm run version:sync`).

## Testing locally
Run `adapters/claude/dev-test.sh` to validate structure and test the plugin.

## Delivery contract (v0.5.3+)

The **delivery contract** guarantees that all distributed artifacts (`dist/`) are complete, consistent, and valid:

**Protected by 28 automated tests** (scripts/build/test/delivery-contract.test.mjs):
- All emitted files exist and are non-empty
- Distributed SKILL.md files have required frontmatter (skill, description, type, status, version)
- Plugin.json files for each platform are valid JSON with correct structure
- Registry index.json is complete with all metadata (version, skill_count, platform_count)
- All file paths referenced in plugin.json and registry exist on disk
- Version is consistent across all platforms and artefacts
- Cross-file references are valid (no dangling links)
- Prompt files referenced in skill variants are present

**Enforcement:**
- Tests run on every `npm test` invocation
- Tests are run automatically on all PRs via `.github/workflows/build.yml`
- Build fails if delivery contract is violated (blocks merging to main)

**What this prevents:**
- Incomplete distributions (missing skills, prompts, or metadata)
- Mismatched versions across platforms
- Broken file references
- Malformed JSON/YAML in distribution

**When you see a delivery contract failure:**
1. Check the error message for which test failed
2. Run `npm test -- scripts/build/test/delivery-contract.test.mjs` locally
3. Fix the underlying issue (missing file, malformed JSON, inconsistent version, etc.)
4. Re-run tests to verify

## Continual self-improvement

**Your self-improvement is key.** If a task has failed or not worked efficiently, you **must** visibly state:

1. **What went wrong** — be explicit, not vague
2. **What to do differently** — concrete steps to prevent recurrence

Token efficiency is paramount. **Unnecessary token wastage is forbidden.** Prefer concise tool calls, avoid re-reading files you already have in context, and do not repeat information already established.

## Key rules
- Always author skills in `shared/skills/`, never directly in `plugins/`
- Only bump version in the root `VERSION` file; run `npm run version:sync` to mirror it, then `npm run version:check` before committing
- `ops/new-skill.sh` must not mutate release-version mirrors (`VERSION`, `package.json`, `plugin.json`)
- Symlinks must use relative paths: `../../../shared/skills/<name>`
- Run `claude plugin validate .` before committing
- Start new skills from `shared/skills/_template/SKILL.md` (Phase 2: enhanced with full frontmatter)

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
   - `package.json` and `plugins/core-skills/.claude-plugin/plugin.json` are derived — never edit their versions by hand
   - The parity check will fail in CI if any file is out of sync

The `git-ops` skill automates rebasing checks. Use it when rebasing.

## Phase 2: Enhanced SKILL.md Frontmatter

All skills define metadata in YAML frontmatter (between `---` markers):

```yaml
---
# Identity
skill: skill-name
description: One sentence summary; one paragraph context max.
type: prompt  # or: hook, agent, workflow-blueprint
status: stable  # or: experimental, deprecated

# Feature 1: Dependencies & Metadata
inputs:
  - name: input_name
    type: string
    description: Description
    required: true

outputs:
  - name: output_name
    type: string
    description: Description

dependencies:
  skills:
    - name: dependency-skill
      version: "^1.0"  # semver constraint
      optional: false
  apis:
    - external-api-name
  models:
    - opus  # or: sonnet, haiku

examples:
  - input: "User input"
    output: "Skill output"
    expected_model: sonnet

# Feature 2: Multi-Model Variants
variants:
  opus:
    prompt_file: prompts/detailed.md
    description: For complex topics
    cost_factor: 3.0
    latency_baseline_ms: 800
  sonnet:
    prompt_file: prompts/balanced.md
    description: Default; balanced
    cost_factor: 1.0
    latency_baseline_ms: 300
  haiku:
    prompt_file: prompts/brief.md
    description: For quick lookups
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain:
    - opus
    - sonnet
    - haiku

# Feature 3: Skill Testing
tests:
  - id: test-id
    type: prompt-validation  # or: structure-check, integration, performance
    input: "Test input"
    expected_substring: "expected text"
    expected_not_null: true  # assert non-empty output
    models_to_test:
      - sonnet
  - id: perf-test
    type: performance
    input: "Benchmark input"
    max_latency_ms: 2000
    iterations: 5
    model: sonnet
    track_metrics:
      - latency

# Feature 4: Skill Composition
composition:
  personas:
    - name: persona-name
      skills:
        - skill-name

# Feature 5: Auto-Generated Documentation
docs:
  auto_generate_readme: true
  sections_to_include:
    - description
    - inputs
    - outputs
  help_text: "One-line contextual help with {placeholders}"
  keywords:
    - search-term
    - discovery-tag

# Feature 6: Performance Monitoring
monitoring:
  enabled: true
  track_metrics:
    - latency
    - token_count
    - cost
    - variant_selected
  alert_threshold_latency_ms: 5000
  public_metrics: false

version: "1.0.0"
changelog:
  "1.0.0": "Initial release"
---
```

See `shared/skills/_template/SKILL.md` for complete template.

## Living docs protocol

Three docs stay in sync; each owns a distinct slice:

| Doc | Update when |
|---|---|
| `README.md` | Directory structure changes, install steps change, new major capability added |
| `PLAN.md` | A phase completes, acceptance criteria are met, recommended next steps change |
| `CLAUDE.md` | Dev conventions change, new ops scripts added, git/proxy workflow changes |
| `shared/manifest.md` | A skill is added, renamed, or removed (one row per skill) |

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

The compiler reads the release version from the root `VERSION` file. Local builds are deterministic — no timestamps or git metadata are injected. Provenance (built_at, build_id, source_commit) is only added in release mode (`--release` flag or `AI_CONFIG_RELEASE=1` env var).

Output: `dist/clients/<platform>/` (claude-code, cursor) + `dist/registry/index.json`

### Skill capability contract
Skills declare structured capability requirements in YAML frontmatter:

```yaml
capabilities:
  required: [git.read, shell.exec]     # must be supported for skill to work
  optional: [fs.write]                 # enhances skill but not essential
  fallback_mode: prompt-only           # none | manual | prompt-only
  fallback_notes: "User can paste git output manually"
```

Platform overrides are thin and optional — most skills need none:
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
- **Sync:** `bash runtime/sync.sh` — reconciles desired config with live Claude Code environment
- **Dry run:** `bash runtime/sync.sh --dry-run` — previews changes without applying
- **Watch mode:** `bash runtime/watch.sh` — triggers sync on config file changes
- **Status:** `bash ops/runtime-status.sh` — full runtime health check

### Adding an MCP server

1. Edit `runtime/config/global.yaml` (or machine/project override)
2. Add entry under `mcps:`
3. Run `bash runtime/sync.sh`

### MCP self-management (experimental)

The MCP server at `runtime/mcp/server.js` exposes sync and skill operations as MCP tools, allowing Claude Code to manage its own configuration. Start with `bash runtime/mcp/start.sh`. Treat as experimental until validated in daily use.

## Workflow — Local Proxy Environment

This repo's remote is a local proxy (`http://local_proxy@127.0.0.1:41590/git/…`), not a direct GitHub connection. This has important implications for how Claude agents should operate:

### What works

- Edit files locally
- `git add` + `git commit` on the designated `claude/…` branch
- `git push -u origin <branch-name>` — the proxy supports git smart-HTTP push/pull

### What does NOT work — skip these immediately

- `gh pr create` — gh cannot resolve the local proxy as a known GitHub host
- Direct `git push origin main` — branch protection returns HTTP 403
- Probing the proxy REST API (e.g. `/api/v1/…`) — the proxy only handles git protocol, not REST
- Temporarily repointing the remote to github.com and retrying — the GITHUB_TOKEN in the environment is not valid for that repo

### Correct approach

Do the minimum that is known to succeed:

```sh
# 1. Make changes on the designated claude/ branch
git add <files>
git commit -m "type: description"

# 2. Push the branch — this is the reliable endpoint
git push -u origin claude/<branch-name>
```

Merging to main happens outside the agent session (via the repo owner's GitHub UI or equivalent). Do not waste turns attempting `gh pr create`, REST API calls, or direct main pushes after the first failure.

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
