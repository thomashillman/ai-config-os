# AI Config OS

Personal AI behaviour layer — skills, plugins, and shared conventions for Claude Code and other AI agents.

## Prerequisites

- Claude Code
- `jq` (required by `ops/new-skill.sh` for version bumping)
- `yq` (required by runtime config merger): `brew install yq` / `snap install yq`
- Node.js 18+ (required by MCP server and dashboard)

## Install the plugin (new device)

1. Clone the repo: `git clone <repo-url> ~/ai-config`
2. In Claude Code: **Plugins** → **Add Marketplace** → paste repo URL → **Install core-skills**
3. Enable auto-update for the marketplace (third-party marketplaces have it disabled by default)

## Phase 2 & 6: Multi-Model Variants, Testing, Monitoring, and Feature Expansion

Phase 2 (complete) expanded the skill system with 6 integrated features. Phase 6 (complete) added 6 new high-value skills, 3 ops tools, and 2 lifestyle hooks:

1. **Skill Dependencies & Metadata** — Declare inputs, outputs, dependencies, examples
2. **Multi-Model Variants** — Opus/Sonnet/Haiku variants with automatic selection
3. **Skill Testing Framework** — Automated prompt validation, structure checks, performance benchmarks
4. **Skill Composition** — Bundle skills into named workflows (personas, execution flows)
5. **Auto-Generated Documentation** — README files and manifest entries generated from metadata
6. **Performance Monitoring** — Local analytics tracking usage, latency, costs, variant selection

See [PLAN.md](PLAN.md) for Phase 2 details and [CLAUDE.md](CLAUDE.md) for the enhanced SKILL.md frontmatter schema.

## Directory overview

| Path | Purpose |
|------|---------|
| `shared/skills/` | Canonical skill definitions; author here |
| `shared/skills/_template/SKILL.md` | Enhanced template with full frontmatter schema (Phase 2) |
| `shared/workflows/` | Skill composition workflows (named personas and execution flows) |
| `shared/lib/` | Utility libraries (YAML parser, analytics logging, config merger) |
| `plugins/core-skills/` | Claude Code plugin (contains symlinks into `shared/skills/`) |
| `.claude-plugin/marketplace.json` | Marketplace manifest |
| `ops/` | Developer scripts: `new-skill.sh`, `lint-skill.sh`, `skill-stats.sh`, validators, test runner, doc generator |
| `adapters/claude/` | Claude Code integration (dev-test.sh) |
| `adapters/codex/` | Codex integration (install.sh) |
| `adapters/cursor/` | Cursor integration (install.sh for .cursorrules) |
| `.github/workflows/` | CI validation (symlinks, version bumps, frontmatter lint, docs) |
| `runtime/` | Desired-state tool management: config, adapters, sync engine, manifest, MCP server |
| `runtime/config/` | Three-tier YAML config (global, machine, project) |
| `runtime/mcp/` | MCP server exposing runtime operations to Claude Code |
| `dashboard/` | React SPA for runtime and skill library visibility |

## Add a skill

```bash
# 1. Create (scaffolds from template, creates symlink, bumps version)
ops/new-skill.sh <skill-name>

# 2. Edit the skill
vim shared/skills/<skill-name>/SKILL.md

# 3. Update the index
vim shared/manifest.md

# 4. Validate
adapters/claude/dev-test.sh
```

## Dashboard

```bash
# Start the MCP server (also serves dashboard API on port 4242)
bash runtime/mcp/start.sh &

# In a separate terminal, start the dashboard dev server
cd dashboard && npm run dev
# Open http://localhost:5173
```

The dashboard provides six tabs: Tools (runtime status + sync), Skills (library inventory), Context Cost (token footprint), Config (merged config viewer), Audit (validation runner), Analytics (invocation metrics).

## Develop in this repo

Open in Claude Code — `CLAUDE.md` loads automatically with dev context and conventions.

## Links

- [CLAUDE.md](CLAUDE.md) — dev context loaded by Claude Code
- [PLAN.md](PLAN.md) — implementation roadmap and status
- [shared/manifest.md](shared/manifest.md) — skill index for agent discovery
