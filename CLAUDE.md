# AI Config OS

**Purpose:** Personal AI behaviour layer — skills, hooks, and conventions for Claude Code and other AI agents. Skills are authored once in `shared/skills/`, compiled into self-sufficient packages (`dist/`), and distributed or materialised without requiring source-tree access.

## Structure

### Source & Distribution (Portability Contract)
- **`shared/skills/`** — canonical skill definitions (author here). Compiler reads only from this directory.
- **`dist/clients/<platform>/`** — emitted packages (claude-code, cursor). Each package is **self-sufficient**: contains complete skill copies and required resources (prompts/). No symlinks, no references to source tree.
- **`dist/registry/index.json`** — cross-platform skill registry with compatibility matrix

### Metadata & Configuration
- `shared/targets/platforms/` — platform capability definitions (v0.5.2+)
- `shared/targets/clients.yaml` — DEPRECATED: use platforms/ directory instead
- `VERSION` — canonical release version (only file humans edit for version bumps)
- `.claude-plugin/marketplace.json` — marketplace manifest
- `schemas/skill.schema.json` — JSON Schema for skill package manifests
- `schemas/platform.schema.json` — JSON Schema for platform capability definitions
- `schemas/probe-result.schema.json` — JSON Schema for runtime probe output

### Tools & Runtime
- `scripts/build/` — compiler: validates skills, resolves compatibility, emits `dist/` artefacts
- `scripts/lint/` — Node-based linters for skills and platform files
- `scripts/build/lib/materialise-client.mjs` — extracts emitted packages (works from `dist/` alone, no source access)
- `adapters/claude/materialise.sh` — shell wrapper for client-side package materialization
- `worker/` — Cloudflare Worker serving compiled skills via bearer-auth REST API
- `runtime/` — desired-state tool management: config, adapters, sync, manifest, MCP server
- `dashboard/` — React SPA: tool status, skill stats, context cost, config, audit, analytics

### Development Convenience (Unix Only)
- `plugins/core-skills/skills/` — optional symlinks into shared/skills (never edit here directly). Created with `node scripts/build/new-skill.mjs` (with default --link flag). Use `--no-link` to skip on platforms without symlink support.

## Creating a new skill
Run `node scripts/build/new-skill.mjs <skill-name>` — this creates the skill directory, updates the manifest, and optionally creates a convenience symlink on Unix. Use `--no-link` to skip symlink creation. The Unix wrapper `ops/new-skill.sh` delegates to this command. It does **not** change `VERSION`, `package.json`, or `plugin.json`. Release version bumps are a separate, explicit action (edit `VERSION`, then `npm run version:sync`).

## Portability Contract (v0.6.0+)

The **portability contract** guarantees that skills authored in source are emitted as self-sufficient packages that do not require source-tree access:

**Definition:**
1. **Canonical source:** `shared/skills/` is the only source of truth. Compiler reads directly from it.
2. **Self-sufficient packages:** `dist/clients/<platform>/` contains complete skill copies (SKILL.md, prompts/, etc.). No relative references to source tree.
3. **Materialisation:** Emitted packages can be extracted and used on any system (CI, cache, offline) without access to source code.
4. **No symlink dependency:** Symlinks in `plugins/core-skills/skills/` are optional authoring convenience on Unix only. All builds work with `--no-link` flag.

**Protected by automated tests:**
- Canonical source contract: compiler reads only from `shared/skills/`
- Materialisation contract: emitted packages extract without source access
- Source-to-output flow: changes to source produce predictable, deterministic changes in emitted packages
- Determinism: identical source → identical bytes in `dist/` (no timestamps in SKILL.md)

**When you see a portability contract failure:**
1. Check test suite: `npm test -- scripts/build/test/materialisation-contract.test.mjs`
2. Verify emitted package has all referenced resources (prompts/, etc.)
3. Ensure no source-tree paths are embedded in emitted files
4. Run `bash adapters/claude/materialise.sh` to test extraction locally

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
- The scaffold command (`scripts/build/new-skill.mjs`) must not mutate release-version mirrors (`VERSION`, `package.json`, `plugin.json`)
- Symlinks are optional Unix convenience; if created, they must use relative paths: `../../../shared/skills/<name>`
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

### Executor Worker (Phase 1)

The executor Worker is a separate Cloudflare Worker that implements Phase 1 tools only:
- **health_check** — Worker health status
- **list_phase1_tools** — Available Phase 1 tools
- **get_skill_metadata** — Fetch skill metadata from KV
- **get_artifact** — Fetch versioned artifacts from R2
- **skill_stats_cached** — Pre-computed statistics from KV

Phase 0 tools (sync_tools, list_tools, get_config, context_cost, validate_all) are **not** available and return 403 TOOL_NOT_SUPPORTED (they require shell/filesystem access).

**Architecture:**
- Service binding from main Worker to executor Worker (primary Phase 1 path)
- HTTP proxy fallback to `EXECUTOR_PROXY_URL` (Phase 0 legacy, being phased out)
- Timeout clamped to 15s maximum
- All data pre-computed and stored in KV/R2

**Deployment (Phase 1 primary path):**
```bash
# Deploy executor Worker first
cd worker/executor
npm install
wrangler deploy

# Then deploy main Worker (includes service binding)
cd ../
wrangler deploy
```

See `worker/executor/README.md` for configuration and local development.

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

## Common CI Pitfalls to Avoid

When building for multi-platform CI (Windows, macOS, Linux), avoid these mistakes:

### 1. Shell glob patterns in npm scripts
**Problem:** `npm test` with `node --test scripts/build/test/*.test.mjs` fails on Windows CMD (doesn't expand globs).
**Solution:** Use Node.js `glob()` in a dedicated test runner script instead.
```json
"test": "node scripts/build/test/run-tests.mjs"
```
Create `run-tests.mjs` using `import { globSync } from 'glob'` to discover test files on all platforms.

### 2. Platform-specific code in test suites run on all OSes
**Problem:** Tests using `execFileSync("bash", ...)` or depending on `jq`/`yq` fail on Windows or minimal CI images.
**Solution:** Test Node.js code across all platforms. Keep bash script testing local-only.
- Don't test shell adapters in multi-platform CI
- Focus CI on portable Node.js code
- Document local testing procedures for shell scripts

### 3. Build artifacts not available to tests
**Problem:** Tests fail because pretest build didn't complete or dist/ was cleaned up.
**Solution:**
- Ensure `pretest` hook runs before tests (already in package.json: `"pretest": "node scripts/build/compile.mjs"`)
- Make tests independent of build artifacts when possible
- If tests need dist/, verify the pretest step completes before tests start

### 4. Platform-specific path separators in config
**Problem:** Test code assumes forward slashes; fails on Windows with backslashes.
**Solution:** Use `path.join()` and normalize paths early in tests.
```javascript
import { join, normalize } from 'path';
const safePath = normalize(rawPath); // Converts to platform-native separators
```

### 5. Comparing resolved paths against raw Unix-style string literals
**Problem:** `path.resolve('/home/user/project', 'sub/file')` returns
`C:\home\user\project\sub\file` on Windows (the drive letter and backslashes are
injected). Any subsequent `result.startsWith('/home/user/project')` check will
**always fail on Windows**, even though the path is logically correct.
```javascript
// WRONG — fails on Windows
assert.ok(result.startsWith(repoRoot), '...');

// RIGHT — platform-neutral
import { resolve, sep } from 'node:path';
const resolvedRoot = resolve(repoRoot);
assert.ok(
  result.startsWith(resolvedRoot + sep) || result === resolvedRoot,
  `path ${result} should be inside ${resolvedRoot}`
);
```
**Rule:** In tests that check whether a resolved path is inside a boundary, always
call `resolve()` on the boundary constant before comparing — never compare against
a raw Unix-style string literal.

### 6. Unconditional symlink creation in tests on macOS CI
**Problem:** `fs.symlinkSync()` without a try/catch causes a test failure on macOS
CI runners where unprivileged symlink creation can return `EPERM`. The test exits
immediately, making the build fail very fast (≈18 s).
**Solution:** Wrap symlink creation in try/catch and skip the test gracefully if the
OS rejects the operation:
```javascript
import { test } from 'node:test';
test('symlink test', (t) => {
  try {
    fs.symlinkSync(target, link);
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'ENOTSUP') {
      t.skip('symlink creation not permitted on this platform');
      return;
    }
    throw err;
  }
  // ... rest of test
});
```

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
