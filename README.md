# AI Config OS

Personal AI behaviour layer — skills, plugins, and shared conventions for Claude Code and other AI agents.

## Prerequisites

- Claude Code
- `jq` (required by `ops/new-skill.sh` for version bumping)

## Install the plugin (new device)

1. Clone the repo: `git clone <repo-url> ~/ai-config`
2. In Claude Code: **Plugins** → **Add Marketplace** → paste repo URL → **Install core-skills**
3. Enable auto-update for the marketplace (third-party marketplaces have it disabled by default)

## Phase 2: Multi-Model Variants, Testing, and Monitoring

Phase 2 (in progress) expands the skill system with 6 integrated features:

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
| `shared/lib/` | Utility libraries (YAML parser, analytics logging) |
| `plugins/core-skills/` | Claude Code plugin (contains symlinks into `shared/skills/`) |
| `.claude-plugin/marketplace.json` | Marketplace manifest |
| `ops/` | Developer scripts: `new-skill.sh`, validators, test runner, doc generator |
| `adapters/` | Integration helpers for Claude and Codex |
| `.github/workflows/` | CI validation (symlinks, version bumps, docs) |

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

## Develop in this repo

Open in Claude Code — `CLAUDE.md` loads automatically with dev context and conventions.

## Links

- [CLAUDE.md](CLAUDE.md) — dev context loaded by Claude Code
- [PLAN.md](PLAN.md) — implementation roadmap and status
- [shared/manifest.md](shared/manifest.md) — skill index for agent discovery
