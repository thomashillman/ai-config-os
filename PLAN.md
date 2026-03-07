# AI Config OS — Implementation Plan

## Overview

Single private GitHub repo that serves as:
1. A Claude Code plugin marketplace (install and update plugins cleanly)
2. A development workspace (edit, validate, test locally)
3. A tool-agnostic library that Codex (or other agents) can read as files

Core principle: **share knowledge, not runtime wiring**.

---

## Current state — updated 2026-03-07

| Area | Status | Notes |
|---|---|---|
| Repo scaffold and .gitignore | ✅ Done | Phase 1 complete |
| marketplace.json | ✅ Done | Phase 1 complete |
| core-skills plugin.json | ✅ Done | v0.5.1 (Phase 9.1) |
| shared/manifest.md (index) | ✅ Done | 22 skills listed |
| shared/principles.md | ✅ Done | Phase 1 complete |
| adapters/claude/dev-test.sh | ✅ Done | Fixed for non-interactive environments |
| ops/new-skill.sh | ✅ Done | Phase 1 complete |
| shared/skills/_template/ | ✅ Done | Phase 2 enhanced with full frontmatter |
| .github/workflows/validate.yml | ✅ Done | Phase 1 complete |
| CLAUDE.md (dev context) | ✅ Done | Extended with self-improvement rules |
| .claude/hooks/session-start.sh | ✅ Done | SessionStart hook implemented |
| README.md | ✅ Done | Phase 2 documentation |
| All original skills (6 total) | ✅ Done | session-start-hook, web-search, commit-conventions, git-ops, principles, plugin-setup |
| Phase 2: Multi-model variants | ✅ Done | All skills have opus/sonnet/haiku variants |
| Phase 2: Testing framework | ✅ Done | Skill tests defined in frontmatter |
| Phase 2: Composition & workflows | ✅ Done | Framework present |
| Phase 2: Performance monitoring | ✅ Done | Analytics infrastructure ready |
| Phase 3: Multi-device sync | ✅ Done | ops/sync/ai-sync.sh implemented |
| Phase 4: Codex adapter | ✅ Done | adapters/codex/install.sh exists |
| Validation infrastructure | ✅ Done | yaml-parser compatible with mawk, dev-test passes |
| Phase 6: Feature expansion (14 items) | ✅ Done | 6 new skills, 3 ops tools, 2 hooks, 2 workflows, CI frontmatter validation, Cursor adapter |
| Phase 7: Code quality & workflow expansion | ✅ Done | 7 new skills (memory, test-writer, security-review, refactor, review-pr, issue-triage, simplify); 2 workflows (daily-brief, pre-commit); 2 infrastructure scripts |
| Phase 8: Runtime integration | ✅ Done | v0.5.0: Three-tier config, tool registry, adapters, sync engine, manifest, MCP server, React dashboard, ops/CI updates |
| Phase 9.1: Distribution first slice | ✅ Done | v0.5.1: skill schema, compiler, Cloudflare Worker, CI build workflow, materialiser adapter |
| Phase 9.2: Capability-driven compatibility | ✅ Done | v0.5.2: platform registry, capability contracts, compatibility resolver, runtime probe, Node linter |

---

## Phase 7: Code Quality & Workflow Expansion — 12-item implementation (COMPLETE ✅)

**Version:** v0.4.7
**Branch:** `claude/review-features-plan-omLC3`
**Completion:** 2026-02-28

### Summary

Expanded the skill library from 16 to 23 skills, added 2 multi-skill workflows, and infrastructure for skill versioning and analytics:

**Skills added:**
1. `memory` — Persistent cross-session project context
2. `test-writer` — Comprehensive test generation from code
3. `security-review` — OWASP-aware vulnerability scanning
4. `refactor` — Structured refactoring with safety checks
5. `review-pr` — Incoming PR review and quality gating
6. `issue-triage` — GitHub issue classification and response drafting
7. `simplify` — Code complexity reduction guidance

**Workflows added:**
1. `daily-brief` — Morning standup synthesis (git-ops → changelog → memory → task-decompose)
2. `pre-commit` — Quality gate before committing (security-review → code-review → commit-conventions)

**Infrastructure:**
- `ops/validate-pins.sh` — Enforce optional skill version pinning
- `.claude/hooks/post-tool-use-metrics.sh` — Analytics data collection
- Manifest and documentation updated; all skills validated

All 7 new skills include multi-model variants (opus/sonnet/haiku) with cost factors and latency baselines.

---

## Phase 8: Runtime Integration — Tool Management & Sync (COMPLETE ✅)

**Version:** v0.5.0
**Branch:** `claude/phase-8-runtime-Z3Zo4`
**Completion:** 2026-03-06

### Summary

Integrated Mycelium's runtime concepts (desired-state tool management, three-tier config merge, MCP server, dashboard) into ai-config-os. All components written from scratch using ai-config-os conventions. Resolved Mycelium's architectural problems (in-place mutation, subprocess overhead, race conditions).

**Layer model post-Phase-8:**
```
shared/skills/          authoring layer (unchanged)
shared/manifest.md      registry layer (extended)
runtime/                new: desired-state config + adapters + sync
dashboard/              new: React SPA
```

**Implementation:**
1. Three-tier config schema (global, machine, project) with field-level merge for MCPs
2. Tool registry (claude-code, cursor, codex) with adapter abstraction
3. Adapter layer: MCP, CLI, file adapters for tool management
4. Sync engine with manifest state tracking and dry-run mode
5. MCP server exposing runtime operations as Claude Code tools
6. React dashboard with 6 tabs: Tools, Skills, Context Cost, Config, Audit, Analytics
7. Updated session-start hook to validate and sync runtime
8. Ops tools: runtime-status.sh, validate-registry.sh
9. CI integration: tool registry and config schema validation

**Not included (deferred):**
- Plugin takeover injection (not needed: plugins load directly)
- Cross-session learning feedback loop (requires usage data)
- Conflict detector (single-pass check can be added later)

---

## Phase 9.1: Distribution First Slice (COMPLETE ✅)

**Version:** v0.5.1
**Branch:** `claude/plan-config-os-distribution-rjqcI`
**Completion:** 2026-03-07

### Summary

Introduced the GitHub-authored, CI-compiled, Cloudflare-distributed architecture. All existing local capability is preserved — this layer is purely additive.

**Design:** skill schema is a **package manifest + adapter hints** (not a runtime abstraction). Skills declare `platforms:` mappings and `capabilities:` hints (filesystem, network, git) — platform-agnostic.

**Components added:**
1. `schemas/skill.schema.json` — JSON Schema draft 2020-12; skills are package manifests, not runtime configs
2. `shared/targets/clients.yaml` — reference doc for known platforms (claude-code, claude-web, codex, cursor)
3. `scripts/build/compile.mjs` — compiler: scans all 22 skills, validates schema, emits `dist/`
4. `package.json` — root package with `yaml` + `ajv` dependencies
5. `worker/` — Cloudflare Worker serving skills via bearer-auth REST API
6. `.github/workflows/build.yml` — CI: validates + builds + uploads dist/ as artefact
7. `adapters/claude/materialise.sh` — fetches compiled skills from Worker to local cache

**Also fixed:** 7 YAML quoting bugs in skill frontmatters (unquoted `"foo" (extra)` descriptions).

---

## Phase 9.2: Capability-Driven Compatibility (COMPLETE ✅)

**Version:** v0.5.2
**Branch:** `claude/plan-config-os-distribution-rjqcI`
**Completion:** 2026-03-07

### Summary

Replaced flat capability hints and implicit claude-code defaulting with a structured capability contract model. Compatibility is now *computed* from platform capability states, not hand-maintained per skill.

**Core change:** Skills declare minimum viable capabilities (`required`/`optional`/`fallback_mode`), platforms declare capability states (`supported`/`unsupported`/`unknown`), and the compiler resolves compatibility automatically.

**Components added:**
1. `schemas/platform.schema.json` — schema for platform capability definitions
2. `shared/targets/platforms/*.yaml` — 5 platform files (claude-code, claude-web, claude-ios, codex, cursor) with evidence-tracked capability states
3. `scripts/lint/skill.mjs` — Node-based skill linter replacing bash parsing
4. `scripts/lint/platform.mjs` — Node-based platform file linter
5. `scripts/build/lib/load-platforms.mjs` — platform loader for compiler
6. `scripts/build/lib/resolve-compatibility.mjs` — capability-driven compatibility algorithm
7. `ops/capability-probe.sh` — runtime capability probe (tests capabilities at session start)
8. `schemas/probe-result.schema.json` — schema for probe output

**Migrated:** All 22 skills now have structured capability contracts. 14 pure prompt skills have `required: []` (work everywhere). 8 skills with required capabilities are correctly excluded or marked unverified on platforms that lack support.

**CI enforcement:** Build fails if any skill is missing `capabilities.required`. Registry includes per-skill compatibility matrix.

---

## Recommended next

1. **Deploy Worker and validate CI** — merge to main, confirm build workflow passes, deploy Worker.
2. **Run probes on Claude Web/iOS** — use `ops/capability-probe.sh` to discover real capabilities, update platform files with evidence.
3. **Add emitters for cursor and codex** — `scripts/build/lib/emit-cursor.mjs`, `emit-codex.mjs`.
4. **Wire materialiser into session-start hook** — auto-fetch latest from Worker if newer version exists.
5. **Platform-specific skill variants** — alternative prompts/workflows per platform (e.g., git-ops generates scripts on web instead of executing them).

---

## Phase 1: Scaffold and validate (get a working marketplace + one plugin)

### Step 1.1 — Repo skeleton and .gitignore

Create the directory structure and ignore patterns.

```
ai-config/
├── .claude-plugin/
│   └── marketplace.json
├── plugins/
│   └── core-skills/
│       ├── .claude-plugin/
│       │   └── plugin.json
│       └── skills/
├── shared/
│   ├── manifest.md
│   ├── principles.md
│   └── skills/
│       └── _template/
│           └── SKILL.md
├── adapters/
│   ├── claude/
│   └── codex/
├── ops/
│   ├── new-skill.sh
│   └── sync/
├── .github/
│   └── workflows/
├── CLAUDE.md
├── .gitignore
└── README.md
```

`.gitignore` should cover:
- `.claude/settings.local.json`
- `overrides/` (if any local-only files appear)
- OS junk (`.DS_Store`, `Thumbs.db`)
- Editor configs unless intentionally shared

### Step 1.2 — marketplace.json

```json
{
  "name": "ai-config-os",
  "owner": {
    "name": "thomashillman"
  },
  "metadata": {
    "description": "Personal AI behaviour layer — skills, plugins, and shared conventions"
  },
  "plugins": [
    {
      "name": "core-skills",
      "source": "./plugins/core-skills"
    }
  ]
}
```

Note: `owner.name` is required. `metadata.description` is the correct location for the marketplace description.

### Step 1.3 — core-skills plugin

`plugins/core-skills/.claude-plugin/plugin.json`:
```json
{
  "name": "core-skills",
  "description": "Foundational skills for Claude Code sessions",
  "version": "0.1.0"
}
```

Author skill content in `shared/skills/<skill-name>/SKILL.md`, then symlink into the plugin:

```
plugins/core-skills/skills/<skill-name> -> ../../../shared/skills/<skill-name>
```

Symlinks are resolved when Claude Code copies plugins into cache, so the installed plugin gets the actual content.

### Step 1.4 — Shared manifest (progressive disclosure entrypoint)

`shared/manifest.md` — a short index of what exists, kept under ~100 lines. This is the single entrypoint for any agent that needs to discover available skills. Contents:

- Repo purpose (2-3 sentences)
- Table of skills with one-line descriptions and file paths
- Table of plugins listing what each bundles
- Conventions section (naming, file structure rules)

No custom marker protocols yet. Plain markdown references are sufficient until a real interop handoff problem emerges.

### Step 1.5 — Validate immediately

Create `adapters/claude/dev-test.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "==> Validating marketplace structure..."
claude plugin validate .
echo "==> Testing core-skills plugin locally..."
claude --plugin-dir ./plugins/core-skills -p "List available skills" --max-turns 1
echo "==> Done."
```

Run this after every structural change. Wire it into CI next.

Note: `claude --plugin-dir` loads the plugin for that session only. If you edit a skill and re-run this script, you must restart Claude Code or run a fresh `claude` invocation to pick up changes.

### Step 1.6 — Version bump discipline

Claude Code caches installed plugins and compares `version` in `plugin.json` to detect updates. **If you change skill content but don't bump the version, no device will see the update through marketplace sync.**

Rules:
- Bump the patch version (`0.1.0` → `0.1.1`) on every meaningful skill change
- Bump minor (`0.1.0` → `0.2.0`) when adding new skills
- Use the scaffold script (`ops/new-skill.sh`, see Step 1.8) to auto-bump on skill creation
- CI should warn if skill files changed but `plugin.json` version didn't

### Step 1.7 — CLAUDE.md (repo development context)

Create `CLAUDE.md` at the repo root. This is loaded automatically when you open the repo in Claude Code, giving every development session context about the repo's conventions:

```markdown
# AI Config OS

## Structure
- `shared/skills/` — canonical skill definitions (author here)
- `plugins/core-skills/skills/` — symlinks into shared/skills (never edit here directly)
- `.claude-plugin/marketplace.json` — marketplace manifest
- `plugins/core-skills/.claude-plugin/plugin.json` — plugin metadata (bump version on changes)

## Creating a new skill
Run `ops/new-skill.sh <skill-name>` — this creates the skill directory, symlink, manifest entry, and bumps the plugin version.

## Testing locally
Run `adapters/claude/dev-test.sh` to validate structure and test the plugin.

## Key rules
- Always author skills in `shared/skills/`, never directly in `plugins/`
- Bump `version` in `plugins/core-skills/.claude-plugin/plugin.json` after any skill change
- Symlinks must use relative paths: `../../../shared/skills/<name>`
- Run `claude plugin validate .` before committing
```

### Step 1.8 — Skill scaffold script

`ops/new-skill.sh` — reduces the 4-step skill creation to one command:

```bash
#!/usr/bin/env bash
set -euo pipefail

SKILL_NAME="${1:?Usage: new-skill.sh <skill-name>}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
SHARED_DIR="$REPO_ROOT/shared/skills/$SKILL_NAME"
PLUGIN_DIR="$REPO_ROOT/plugins/core-skills/skills/$SKILL_NAME"

if [ -d "$SHARED_DIR" ]; then
  echo "Error: skill '$SKILL_NAME' already exists at $SHARED_DIR" >&2
  exit 1
fi

# 1. Create skill from template
mkdir -p "$SHARED_DIR"
sed "s/{{SKILL_NAME}}/$SKILL_NAME/g" "$REPO_ROOT/shared/skills/_template/SKILL.md" > "$SHARED_DIR/SKILL.md"

# 2. Symlink into plugin
mkdir -p "$(dirname "$PLUGIN_DIR")"
ln -s "../../../shared/skills/$SKILL_NAME" "$PLUGIN_DIR"

# 3. Bump patch version
PLUGIN_JSON="$REPO_ROOT/plugins/core-skills/.claude-plugin/plugin.json"
if command -v jq &>/dev/null; then
  CURRENT=$(jq -r '.version' "$PLUGIN_JSON")
  NEXT=$(echo "$CURRENT" | awk -F. '{printf "%d.%d.%d", $1, $2, $3+1}')
  jq --arg v "$NEXT" '.version = $v' "$PLUGIN_JSON" > "$PLUGIN_JSON.tmp" && mv "$PLUGIN_JSON.tmp" "$PLUGIN_JSON"
  echo "Bumped plugin version: $CURRENT → $NEXT"
fi

echo "Created skill '$SKILL_NAME'"
echo "  → $SHARED_DIR/SKILL.md (edit this)"
echo "  → $PLUGIN_DIR (symlink)"
echo ""
echo "Next: edit SKILL.md, update shared/manifest.md, then run adapters/claude/dev-test.sh"
```

### Step 1.9 — Skill template

`shared/skills/_template/SKILL.md`:

```markdown
---
skill: {{SKILL_NAME}}
---

# {{SKILL_NAME}}

<skill-description>
<!-- One sentence: what does this skill do and when should Claude invoke it? -->
</skill-description>

## When to use
<!-- Describe the trigger conditions — what user request or context activates this skill -->

## Instructions
<!-- The actual instructions Claude should follow when this skill is invoked -->

## Examples
<!-- Optional: show input/output examples to calibrate behaviour -->
```

### Step 1.10 — GitHub Actions CI

`.github/workflows/validate.yml`:
- On push to `main` and PRs
- Runs `claude plugin validate .`
- Validates all symlinks under `plugins/` resolve to real files (catches broken relative paths)
- Warns if skill files changed but `plugin.json` version wasn't bumped
- Optionally lints markdown files
- Catches structural breakage before it hits other devices

Symlink validation step:

```bash
# Fail if any symlink under plugins/ is broken
find plugins/ -type l ! -exec test -e {} \; -print | {
  if read -r broken; then
    echo "Broken symlink: $broken"
    cat <(echo "$broken") - | while read -r f; do echo "Broken symlink: $f"; done
    exit 1
  fi
}
```

---

## Phase 2: Flesh out content and add capabilities

### Step 2.1 — Write your actual skills

For each skill you want:
1. Run `ops/new-skill.sh <skill-name>` (creates directory, symlink, bumps version)
2. Edit `shared/skills/<skill-name>/SKILL.md` with your skill content
3. Update `shared/manifest.md` index
4. Run `adapters/claude/dev-test.sh`

### Step 2.2 — Add optional plugin capabilities as needed

Only add these when you have a concrete use case:
- `agents/` — subagents (when you want specialised agent personas)
- `hooks/` + `hooks/hooks.json` — lifecycle hooks (when you want auto-actions on events)
- `.mcp.json` — MCP servers (when you want tool integrations bundled with the plugin)
- `settings.json` — default agent selection (when you have agents defined)

Note: `commands/` is legacy. Use `skills/` for all new functionality.

**Important conventions for hooks and MCP configs:**
- Hook scripts must be executable: `chmod +x hooks/my-hook.sh`
- Any file paths inside hooks or `.mcp.json` must use `${CLAUDE_PLUGIN_ROOT}` instead of relative paths, because installed plugins live in `~/.claude/plugins/cache/`, not in your repo. Example:

```json
{
  "hooks": {
    "PostToolUse": [{
      "command": "${CLAUDE_PLUGIN_ROOT}/hooks/post-tool.sh"
    }]
  }
}
```

### Step 2.3 — Principles and conventions

`shared/principles.md` — your opinionated defaults for AI behaviour. Referenced by skills, not auto-loaded. Keep it under 200 lines.

---

## Phase 3: Multi-device sync

### Step 3.1 — Simple sync script (v1)

`ops/sync/ai-sync.sh` — intentionally minimal:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "${AI_CONFIG_HOME:-$HOME/ai-config}"

case "${1:-status}" in
  pull)
    git pull --rebase --autostash
    ;;
  push)
    git add -A shared/ plugins/ .claude-plugin/ adapters/ ops/ .github/
    git diff --cached --quiet && echo "Nothing to commit." && exit 0
    git commit -m "sync: $(date +%Y-%m-%d-%H%M)"
    git push
    ;;
  status)
    git fetch --quiet
    git status --short --branch
    ;;
  *)
    echo "Usage: ai-sync.sh [pull|push|status]"
    exit 1
    ;;
esac
```

That's it for v1. No locking, no coalescing, no conflict sentinels. Add those only when you actually hit concurrent-edit problems (unlikely for a single-user repo).

### Step 3.2 — Multi-device rollout

Per device:
1. `git clone <repo-url> ~/ai-config`
2. In Claude Code: add marketplace from GitHub, install `core-skills`
3. **Enable auto-update for the marketplace** — third-party (non-Anthropic) marketplaces have auto-update disabled by default. Enable it via `/plugin` → Marketplaces tab, or updates won't propagate automatically.
4. Optionally set `AI_CONFIG_HOME` in shell profile
5. Run `adapters/claude/dev-test.sh` to verify

**Update flow (device A → device B):**
1. On device A: edit skills, bump version, commit, push
2. On device B (auto-update enabled): restart Claude Code — it checks for marketplace updates at startup and pulls new versions automatically
3. On device B (auto-update disabled): manually run `claude plugin update core-skills@ai-config-os`

If auto-update is enabled, the full cycle is: edit → bump version → push → restart Claude Code on other device. No manual `plugin update` needed.

---

## Phase 4: Codex adapter (thin shim)

### Step 4.1 — Codex wrapper

`adapters/codex/install.sh` — installs a shell function or alias:

```bash
ai-codex() {
  (cd "${AI_CONFIG_HOME:-$HOME/ai-config}" && ops/sync/ai-sync.sh pull)
  echo "AI config synced. Shared manifest: ${AI_CONFIG_HOME:-$HOME/ai-config}/shared/manifest.md"
  codex "$@"
}
```

This is deliberately minimal. Codex's actual integration points will evolve, and a thin shim is easy to adapt.

### Step 4.2 — Codex context pointing

Document in the README how to tell Codex about the shared layer:
- Reference `shared/manifest.md` as the starting file
- Codex reads files directly from the repo — no plugin installation needed

---

## Phase 5: Iterate and harden (only when needed)

These are deferred improvements, not part of the initial build:

- **Interop markers**: Add structured handoff metadata between agents only when you have a real two-agent workflow that breaks without it
- **Sync guardrails**: Add locking, conflict sentinels, allowlist enforcement only when concurrent edits cause real problems
- **Plugin splitting**: Split `core-skills` into domain-specific plugins when context cost becomes noticeable. All skills in a plugin are discovered by Claude Code — a plugin with many large skills adds context overhead to every session. Watch for signs: slower response times, skills being ignored or confused, or context window pressure in long sessions. When splitting, group by domain (e.g., `coding-skills`, `writing-skills`) and keep each plugin focused on one concern. Start with one plugin and split reactively, not preemptively.
- **Background auto-sync**: Launchd/systemd timer for hands-off commits only if manual `ai-sync.sh push` becomes tedious

---

## Acceptance criteria

- [x] `claude plugin validate .` passes at repo root
- [ ] Claude Code can add the marketplace and install `core-skills` (pending device test)
- [ ] Installed plugin exposes expected skills (first skill added; awaiting full validation)
- [ ] Pushing from device A (with version bump) and restarting Claude Code on device B (with auto-update enabled) reflects changes
- [x] `adapters/claude/dev-test.sh` runs clean
- [x] CI validates plugin structure and symlink integrity on every push
- [x] `ops/new-skill.sh <name>` creates skill, symlink, and bumps version in one command
- [x] `CLAUDE.md` is loaded when opening the repo in Claude Code
- [ ] Codex can read `shared/manifest.md` and reference skill files (not tested yet)
- [x] No secrets in tracked files

---

## What this plan intentionally defers

| Deferred item | Why |
|---|---|
| Interop marker protocol | No proven need yet; plain markdown references suffice |
| Sync locking and conflict sentinels | Single-user repo; `git rebase --autostash` handles it |
| Coalescing window for commits | Premature optimisation for commit noise |
| `overrides/` directory | Env var docs belong in README |
| Plugin splitting | One plugin is fine until context pressure is observable |
| Windows support | Not needed now; watcher/service changes are isolatable |

---

## Recommended next

After each merge, update this section with what should happen in the next session.

**After Phase 9.1 (v0.5.1 — distribution layer):**

1. **Add `platforms:` blocks to skills** — existing skills default to `claude-code`. Add explicit `platforms:` + `capabilities:` to each skill to enable multi-platform distribution (cursor, codex).

2. **Deploy the Worker** — `cd worker && wrangler secret put AUTH_TOKEN && wrangler deploy`. Test with `bash adapters/claude/materialise.sh status`.

3. **Wire materialiser into session-start hook** — auto-fetch latest from Worker on session start if a newer version exists remotely.

4. **Add emitters for cursor and codex** — implement `emit-cursor.mjs` and `emit-codex.mjs` in `scripts/build/lib/`.

5. **Validate CI** — merge to main and confirm `.github/workflows/build.yml` passes; check that `dist/` artefact uploads correctly.

**After Phase 7 (v0.4.7 — 7 new skills + 2 workflows + infrastructure):**

1. **Validate Phase 7 on second device** — Merge to main, restart Claude Code on a second device with auto-update enabled, confirm version `0.4.7` is picked up and all 23 skills + 2 workflows load correctly.

2. **Test the memory skill workflow** — Use the `memory` skill to persist context across sessions:
   - At session start: `action: read` to load project state
   - During work: `action: update` to record decisions/blockers
   - At session end: verify `.memory/<project>.md` persists

3. **Pilot the daily-brief workflow** — Run the daily-brief workflow (composes git-ops → changelog → memory → task-decompose) to validate multi-skill composition:
   - Does it synthesize recent work correctly?
   - Are the composed skills executing in correct order?
   - Adjust skill ordering/variants if needed

4. **Pilot the pre-commit workflow** — Use the pre-commit workflow as a quality gate before commits:
   - Does it catch real security or code quality issues?
   - Is the gate too strict or too loose?
   - Refine severity thresholds if needed

5. **Activate analytics collection** — Ensure the `post-tool-use-metrics.sh` hook is collecting data:
   - Check `.claude/metrics.jsonl` for entries after skill invocations
   - Validate metrics include timestamp, tool name, status
   - Begin trending latency and cost by skill/variant

6. **Monitor Phase 5 deferred items** — Watch for signs that these are now needed:
   - Skill context pressure → consider plugin splitting
   - Concurrent edit issues → implement sync locking
   - Agent coordination problems → add interop markers

**After Phase 6 (v0.4.0):** Executed Phase 7 expansion.

---

## Phase 6: Feature Expansion — 14-item implementation

**Branch:** `claude/analyze-propose-features-kyrYH`
**Target version:** `0.4.0` (derive from `git show origin/main:plugins/core-skills/.claude-plugin/plugin.json | jq -r '.version'` at bump time)

### Critical files

| File | Role |
|---|---|
| `shared/skills/_template/SKILL.md` | Canonical template — all new skills follow this |
| `shared/skills/code-review/SKILL.md` | Reference implementation for full-frontmatter skill |
| `ops/new-skill.sh` | Scaffolds skill dir, symlink, version bump — will be enhanced |
| `plugins/core-skills/.claude-plugin/plugin.json` | Version bumped after all skill additions |
| `.claude/settings.json` | Hooks registry — gains PreToolUse + PostToolUse entries |
| `.github/workflows/validate.yml` | CI — gains frontmatter validation step |
| `shared/manifest.md` | Skill index — needs 6 new rows |
| `shared/workflows/` | Persona/workflow compositions live here |

---

### Commit 1 — `feat(ops): add lint-skill.sh for single-skill frontmatter validation`

**New file:** `ops/lint-skill.sh` (chmod +x)

Validates one skill by name. Checks:
- Required fields present: `skill`, `description`, `type`, `status`, `version`
- `type` ∈ `{prompt, hook, agent, workflow-blueprint}`
- `status` ∈ `{stable, experimental, deprecated}`
- `version` matches semver `X.Y.Z`
- All `dependencies.skills[].name` values resolve to real directories under `shared/skills/`
- For `type: prompt`: any `prompt_file:` referenced in variants exists on disk (warn, not error)

Uses only `awk`, `grep`, `sed` — same approach as existing `ops/validate-variants.sh`.
Exit 0 = OK, exit 1 = errors found.

```
Usage: ops/lint-skill.sh <skill-name>
Example: ops/lint-skill.sh code-review  →  OK: code-review
```

---

### Commit 2 — `feat(ops): add skill-stats.sh for library overview table`

**New file:** `ops/skill-stats.sh` (chmod +x)

Iterates `shared/skills/*/` (skip `_template`), extracts from SKILL.md frontmatter:
- `type`, `status`
- Presence of opus/sonnet/haiku variant sections (✓ or -)
- Count of test entries (`- id:` lines in tests block)

Prints a formatted table:
```
SKILL                TYPE       STATUS       OPUS     SONNET   HAIKU    TESTS
code-review          prompt     stable       ✓        ✓        ✓        3
debug                prompt     stable       ✓        ✓        ✓        3
...
```

---

### Commit 3 — `feat(ops): enhance new-skill.sh to auto-update manifest.md and run lint`

**Edit:** `ops/new-skill.sh`

After creating the skill directory and symlink, add two new steps:

- **Auto-append manifest.md row** — inserts a placeholder row in the skills table.
- **Call lint-skill.sh** — post-scaffold check; warns (does not fail) if frontmatter issues found.

---

### Commit 4 — `feat(skills): add debug, changelog, task-decompose, explain-code, skill-audit, release-checklist`

Create all 6 skills via `ops/new-skill.sh` then fill their SKILL.md. Each follows the full-frontmatter pattern from `shared/skills/code-review/SKILL.md` — all 6 Phase 2 feature blocks + body sections (When to use / Instructions / Examples).

#### `debug` (type: prompt, status: stable)
- **inputs:** `symptoms` (required), `error_message` (optional), `codebase_context` (optional)
- **outputs:** `diagnosis` object — hypothesis, root_cause, fix, regression_test
- **variants:** opus=deep multi-system, sonnet=standard loop, haiku=quick stacktrace scan; **fallback:** sonnet→opus→haiku
- **tests:** test-syntax-error, test-logic-bug, test-regression-find (3)
- **instructions:** form hypothesis → isolate → test assumption → confirm root cause → document fix + write regression test

#### `changelog` (type: workflow-blueprint, status: stable)
- **inputs:** `since_ref` (required: git ref, e.g. `v0.3.0`), `version` (required: target version string)
- **outputs:** `changelog_entry` — markdown formatted string
- **variants:** opus=detailed with migration notes, sonnet=standard, haiku=one-liner; **fallback:** sonnet→haiku→opus
- **dependencies:** `commit-conventions` skill
- **tests:** test-basic-entry, test-breaking-change (2)
- **instructions:** `git log --oneline <since_ref>..HEAD` → group by conventional prefix → flag `!` or `BREAKING CHANGE` → render markdown entry

#### `task-decompose` (type: prompt, status: stable)
- **inputs:** `task_description` (required), `constraints` (optional: time/tech/scope)
- **outputs:** `subtasks` array — each with title, acceptance_criteria, blockers
- **variants:** opus=architectural breakdown with dependency graph, sonnet=standard, haiku=quick scope check; **fallback:** sonnet→opus→haiku
- **tests:** test-vague-task, test-constrained-task (2)
- **instructions:** identify known vs unknown scope → slice into ≤1-session subtasks → write observable acceptance criteria → flag external blockers → order by dependency

#### `explain-code` (type: prompt, status: stable)
- **inputs:** `code` (required), `depth` (optional: `brief`/`detailed`/`architectural`, default `detailed`)
- **outputs:** `explanation` string
- **variants:** haiku=one-liner, sonnet=functional explanation (default), opus=architectural intent and design patterns; **fallback:** sonnet→haiku→opus
- **tests:** test-simple-function, test-complex-pattern, test-architectural (3)
- **instructions:** map `depth` to model tier → explain what before why → highlight non-obvious decisions → for `architectural`: describe patterns, trade-offs, and fit in larger system

#### `skill-audit` (type: agent, status: experimental)
- **inputs:** `scope` (optional: `"all"` or specific skill name, default `"all"`)
- **outputs:** `audit_report` object — per-skill health scores, gaps list, recommendations
- **variants:** opus=deep with prioritised recommendations, sonnet=standard gap report; **fallback:** sonnet→opus
- **tests:** test-full-audit, test-single-skill (2)
- **instructions:** read `shared/manifest.md` → for each skill: check all required frontmatter fields, all 3 variants, ≥2 tests, non-stale status, resolvable deps → produce ranked gaps list with severity + concrete fix suggestions

#### `release-checklist` (type: workflow-blueprint, status: stable)
- **inputs:** `version` (required: semver string), `release_notes` (optional)
- **outputs:** `checklist_result` object — steps_completed, steps_failed, ready_to_release bool
- **dependencies:** `git-ops`, `commit-conventions`, `changelog`
- **variants:** sonnet=standard, opus=verbose with risk assessment; **fallback:** sonnet→opus
- **tests:** test-clean-state, test-dirty-state (2)
- **instructions:** (1) validate plugin.json version matches target via `git-ops`, (2) run `adapters/claude/dev-test.sh`, (3) invoke `changelog` for entry since last tag, (4) invoke `commit-conventions` to draft release commit, (5) tag, (6) push, (7) output readiness summary

---

### Commit 5 — `feat(hooks): add PreToolUse guard and PostToolUse living-docs reminder`

**New files:**

**`.claude/hooks/pre-tool-use.sh`** (chmod +x) — reads JSON from stdin; if `tool_name` is `Write`/`Edit`/`NotebookEdit` and `file_path` matches `*/plugins/core-skills/skills/*`, emits `{"decision":"block","reason":"Author skills in shared/skills/ not plugins/ directly."}` and exits.

**`.claude/hooks/post-tool-use.sh`** (chmod +x) — reads JSON from stdin; if `file_path` is under `shared/skills/` or `ops/`, prints a reminder to run `ops/check-docs.sh`.

**Edit:** `.claude/settings.json` — add `PreToolUse` and `PostToolUse` hook entries alongside the existing `SessionStart`:
```json
"PreToolUse": [
  { "hooks": [{ "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/pre-tool-use.sh" }] }
],
"PostToolUse": [
  { "hooks": [{ "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/post-tool-use.sh" }] }
]
```

---

### Commit 6 — `feat(workflows): add code-quality and release-agent persona workflows`

**New files in `shared/workflows/`:**

**`code-quality.json`** — persona `code-quality-agent` composing `code-review` + `debug` + `explain-code` (sonnet default). Execution flow: review → debug → explain. Follows structure of `shared/workflows/research-mode/workflow.json`.

**`release-agent.json`** — persona `release-agent` composing `git-ops` + `commit-conventions` + `changelog` + `release-checklist` (sonnet/haiku). Execution flow: validate version → generate changelog → draft release commit → run checklist.

---

### Commit 7 — `feat(ci): add skill frontmatter validation step to validate.yml`

**Edit:** `.github/workflows/validate.yml`

Add a step after the existing symlink check:
```yaml
- name: Validate skill frontmatter
  run: |
    ERRORS=0
    for skill_dir in shared/skills/*/; do
      skill_name=$(basename "$skill_dir")
      [ "$skill_name" = "_template" ] && continue
      bash ops/lint-skill.sh "$skill_name" || ERRORS=$((ERRORS+1))
    done
    [ $ERRORS -eq 0 ] || { echo "::error::$ERRORS skill(s) failed frontmatter lint"; exit 1; }
```

---

### Commit 8 — `feat(adapters): add Cursor adapter`

**New file:** `adapters/cursor/install.sh` (chmod +x)

Generates/appends an `AI Config OS` section to a `.cursorrules` file in a target directory (default: `$PWD`). Exports:
1. `shared/principles.md` verbatim
2. One-line descriptions from `code-review`, `commit-conventions`, `debug`, `explain-code`

Checks for an existing AI Config OS block before appending to avoid duplicates. Follows the detection-and-append pattern of `adapters/codex/install.sh`.

---

### Commit 9 — `docs: update manifest, README, PLAN; bump plugin to 0.4.0`

- **`shared/manifest.md`** — add 6 rows for new skills; add/update Workflows table with code-quality and release-agent.
- **`plugins/core-skills/.claude-plugin/plugin.json`** — bump to `0.4.0` (7 new skills = minor bump). Derive base from `git show origin/main:…` at bump time.
- **`README.md`** — add `adapters/cursor/` row to directory table; update skill count.
- **`PLAN.md`** — update Current State table: mark Phase 6 as ✅ Done.

---

### Verification (run before pushing)

```bash
# 1. Lint all new skills
for s in debug changelog task-decompose explain-code skill-audit release-checklist; do
  bash ops/lint-skill.sh "$s"
done

# 2. Stats table — should show 15 skills
bash ops/skill-stats.sh

# 3. Full validation suite
bash ops/validate-all.sh

# 4. Dev test
bash adapters/claude/dev-test.sh

# 5. Docs consistency
bash ops/check-docs.sh

# 6. Hooks registered
grep -q "PreToolUse" .claude/settings.json && echo "PreToolUse: OK"
grep -q "PostToolUse" .claude/settings.json && echo "PostToolUse: OK"

# 7. No broken symlinks
find plugins/ -type l ! -exec test -e {} \; -print | grep . && exit 1 || echo "Symlinks: OK"
```

Expected: all commands exit 0, skill-stats shows 15 rows, settings.json has all 3 hook event types.
