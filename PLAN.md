# AI Config OS — Implementation Plan

## Overview

Single private GitHub repo that serves as:
1. A Claude Code plugin marketplace (install and update plugins cleanly)
2. A development workspace (edit, validate, test locally)
3. A tool-agnostic library that Codex (or other agents) can read as files

Core principle: **share knowledge, not runtime wiring**.

---

## Current state — updated 2026-02-27

| Area | Status |
|---|---|
| Repo scaffold and .gitignore | ✅ Done |
| marketplace.json | ✅ Done |
| core-skills plugin.json | ✅ Done |
| shared/manifest.md (index) | ✅ Done |
| shared/principles.md | ✅ Done |
| adapters/claude/dev-test.sh | ✅ Done |
| ops/new-skill.sh | ✅ Done |
| shared/skills/_template/ | ✅ Done |
| .github/workflows/validate.yml | ✅ Done |
| CLAUDE.md (dev context) | ✅ Done |
| .claude/hooks/session-start.sh | ✅ Done |
| README.md | ✅ Done |
| First concrete skill (session-start-hook) | ✅ Done |
| Phase 2+ skills | ✅ Done |
| ops/sync/ai-sync.sh | ✅ Done |
| adapters/codex/install.sh | ✅ Done |

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

**After this batch (3 new skills: commit-conventions, principles, plugin-setup — v0.3.0):**

1. **Verify multi-device sync** — Merge to main, restart Claude Code on a second device with auto-update enabled, confirm plugin version `0.3.0` is picked up automatically.
2. **Test `adapters/claude/dev-test.sh` end-to-end** — Run the full pipeline with all 5 skills present and confirm it validates correctly.
3. **Step 2.2 — Add optional plugin capabilities** — Evaluate whether any of the new skills benefit from `hooks/`, `.mcp.json`, or `agents/` additions now that concrete skills exist.
4. **Enable auto-update on marketplace** — Confirm Claude Code picks up version bumps without manual `plugin update` command.
5. **Test Codex context flow** — Confirm Codex can discover `shared/manifest.md` and traverse to skill files directly.
