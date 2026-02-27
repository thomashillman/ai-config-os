# AI Config OS — Implementation Plan

## Overview

Single private GitHub repo that serves as:
1. A Claude Code plugin marketplace (install and update plugins cleanly)
2. A development workspace (edit, validate, test locally)
3. A tool-agnostic library that Codex (or other agents) can read as files

Core principle: **share knowledge, not runtime wiring**.

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
├── adapters/
│   ├── claude/
│   └── codex/
├── ops/
│   └── sync/
├── .github/
│   └── workflows/
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
  "description": "Personal AI behaviour layer — skills, plugins, and shared conventions",
  "plugins": [
    {
      "name": "core-skills",
      "source": "./plugins/core-skills"
    }
  ]
}
```

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

### Step 1.6 — GitHub Actions CI

`.github/workflows/validate.yml`:
- On push to `main` and PRs
- Runs `claude plugin validate .`
- Optionally lints markdown files
- Catches structural breakage before it hits other devices

---

## Phase 2: Flesh out content and add capabilities

### Step 2.1 — Write your actual skills

For each skill you want:
1. Create `shared/skills/<skill-name>/SKILL.md`
2. Symlink into `plugins/core-skills/skills/<skill-name>`
3. Update `shared/manifest.md` index
4. Run `adapters/claude/dev-test.sh`

### Step 2.2 — Add optional plugin capabilities as needed

Only add these when you have a concrete use case:
- `commands/` — slash commands (when you want `/my-command` shortcuts)
- `agents/` — subagents (when you want specialised agent personas)
- `hooks/` + `hooks/hooks.json` — lifecycle hooks (when you want auto-actions on events)
- `.mcp.json` — MCP servers (when you want tool integrations bundled with the plugin)
- `settings.json` — default agent selection (when you have agents defined)

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
3. Optionally set `AI_CONFIG_HOME` in shell profile
4. Run `adapters/claude/dev-test.sh` to verify

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
- **Additional plugins**: Split `core-skills` into domain-specific plugins when it grows too large (>10 skills is a reasonable threshold)
- **Versioning strategy**: Decide on semver bump rules when you have consumers who need stability guarantees
- **Background auto-sync**: Launchd/systemd timer for hands-off commits only if manual `ai-sync.sh push` becomes tedious

---

## Acceptance criteria

- [ ] `claude plugin validate .` passes at repo root
- [ ] Claude Code can add the marketplace and install `core-skills`
- [ ] Installed plugin exposes expected skills
- [ ] Pushing from device A and reinstalling on device B reflects changes
- [ ] `adapters/claude/dev-test.sh` runs clean
- [ ] CI validates plugin structure on every push
- [ ] Codex can read `shared/manifest.md` and reference skill files
- [ ] No secrets in tracked files

---

## What this plan intentionally defers

| Deferred item | Why |
|---|---|
| Interop marker protocol | No proven need yet; plain markdown references suffice |
| Sync locking and conflict sentinels | Single-user repo; `git rebase --autostash` handles it |
| Coalescing window for commits | Premature optimisation for commit noise |
| `overrides/` directory | Env var docs belong in README |
| Plugin versioning policy | No external consumers yet |
| Windows support | Not needed now; watcher/service changes are isolatable |
