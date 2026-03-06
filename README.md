# AI Config OS

**Build a personal AI behaviour layer for Claude Code and other agents.**

AI Config OS is a plugin marketplace and skill authoring system that centralizes how you configure AI agents across your devices. Instead of scattering prompts, hooks, and conventions across different tools, you define them once in a shared library and deploy them everywhere—your Claude Code workspace, Cursor, Codex, or any tool that supports plugins.

## What can you do with it?

- **Centralize AI behaviour:** Define skills, hooks, and conventions in one place; sync across devices
- **Author skills that understand themselves:** Skills include metadata (inputs, outputs, dependencies, tests) so AI agents can discover and compose them intelligently
- **Multi-model intelligence:** Tag skills with model variants (Opus for complexity, Sonnet for balance, Haiku for speed) and let the system pick the best one
- **Visualize your setup:** A React dashboard shows your installed tools, skill library, context costs, and performance metrics
- **Desired-state tool management:** Declare what tools you want, and a sync engine keeps your environment in sync across machines

This is for you if you spend time in Claude Code, Cursor, or other agent IDEs, and want consistency without repetition.

---

## Getting started

### Prerequisites

Before you begin, ensure you have:

- **Claude Code** (required for plugin installation and testing)
- **Node.js 18+** (required by MCP server and dashboard)
- **jq** (required by skill authoring script: `ops/new-skill.sh`)
- **yq** (required by config merger: `brew install yq` / `snap install yq`)
- **git** (for cloning and version control)

### Step 1: Install the plugin

The quickest way to add AI Config OS to your Claude Code setup:

```bash
# 1. Clone the repository
git clone <repo-url> ~/ai-config

# 2. Open Claude Code and navigate to Plugins
# 3. Click "Add Marketplace"
# 4. Enter the repository URL
# 5. Find "core-skills" and click Install
# 6. Enable auto-update (disabled by default for third-party marketplaces)
```

After installation, your Claude Code will have access to all skills immediately. No restart required.

### Step 2: Verify your installation

Run the validation suite to confirm everything is working:

```bash
bash adapters/claude/dev-test.sh
```

This script:
- Validates plugin structure
- Checks skill metadata
- Ensures symlinks are correct
- Confirms frontmatter syntax

You should see "All validation stages passed ✓" before proceeding.

### Step 3: Explore the dashboard

The optional visual dashboard shows your tool configuration, skills, and performance metrics:

```bash
# Start the MCP server (serves both tools and API on port 4242)
bash runtime/mcp/start.sh &

# In a new terminal, start the dashboard dev server
cd dashboard && npm run dev

# Open http://localhost:5173 in your browser
```

The dashboard provides six tabs:
- **Tools:** Runtime status and sync for Claude Code, Cursor, Codex
- **Skills:** Complete skill library with metadata and variants
- **Context Cost:** Real-time token footprint tracking
- **Config:** View merged configuration across all tiers
- **Audit:** Run validation checks on the entire setup
- **Analytics:** Track which skills you use most and their performance

---

## How to use it

### Running a skill in Claude Code

Skills are invoked like prompts. Once installed, they appear in Claude Code's skill menu:

```
Claude Code → Ask a Question or Run a Task → [skill-name]
```

Each skill's metadata tells Claude Code what inputs it needs and what it will produce. The system automatically selects the best model variant for your query.

### Adding your own skill

Create a new skill in five minutes:

```bash
# 1. Generate scaffold (creates directory, symlink, and updates marketplace)
ops/new-skill.sh my-skill

# 2. Edit the skill (use shared/skills/_template/SKILL.md as a guide)
vim shared/skills/my-skill/SKILL.md

# 3. Update the skill index
vim shared/manifest.md

# 4. Validate your work
bash adapters/claude/dev-test.sh
```

**Skill metadata structure:**

Every skill defines what it does using YAML frontmatter:

| Field | Purpose | Example |
|-------|---------|---------|
| `skill` | Unique identifier | `my-skill` |
| `description` | One-sentence summary | `Refactor code with safety checks` |
| `type` | Skill category | `prompt`, `hook`, `agent`, `workflow-blueprint` |
| `inputs` | Required parameters | `code: string`, `refactor_scope: string` |
| `outputs` | What the skill produces | `refactored_code: string`, `changes_summary: string` |
| `dependencies` | Skills, APIs, or models needed | `dependencies: [security-review]` |
| `variants` | Model-specific prompts | `opus`, `sonnet`, `haiku` |
| `tests` | Automated validation | `test: { input: "...", expected_substring: "..." }` |

[See the full template](shared/skills/_template/SKILL.md) for all available fields.

### Sync tools across machines

The runtime layer manages desired-state configuration. Instead of manually configuring each device, declare what you want and let the sync engine apply it:

```bash
# 1. Edit your desired config
vim runtime/config/global.yaml        # applies to all machines
vim runtime/config/machines/laptop.yaml  # machine-specific overrides
vim runtime/config/project.yaml        # project-local settings

# 2. Preview changes (dry-run mode)
bash runtime/sync.sh --dry-run

# 3. Apply configuration
bash runtime/sync.sh

# 4. Watch for changes (auto-sync when config changes)
bash runtime/watch.sh
```

**Example config:**

```yaml
mcps:
  - name: blockscout
    type: http
    url: https://api.blockscout.com/
    enabled: true
  - name: web-search
    type: native
    enabled: true
```

### Develop in this repository

If you're authoring or modifying skills, open the repo in Claude Code:

```bash
cd ~/ai-config
code .
```

Claude Code automatically loads `CLAUDE.md`, which includes:
- Skill authoring conventions
- Git workflow for the local proxy environment
- Session startup checklist
- Testing and validation procedures

---

## Directory structure

| Path | What goes here |
|------|----------------|
| `shared/skills/` | **Write skills here.** Each skill is a folder with SKILL.md (metadata + prompts) and optional subdirectories (prompts/, tests/) |
| `shared/workflows/` | Skill compositions: named collections of skills executed in sequence |
| `shared/lib/` | Shared utility libraries (YAML parser, analytics, config merger) |
| `plugins/core-skills/` | Claude Code plugin (contains only symlinks to `shared/skills/`) |
| `runtime/config/` | Desired-state configuration (global, machine, project overrides) |
| `runtime/adapters/` | Tool integration layer (Claude Code, Cursor, Codex) |
| `runtime/mcp/` | MCP server exposing runtime operations as Claude Code tools |
| `dashboard/` | React SPA for runtime visibility and control |
| `ops/` | Developer scripts (new-skill, lint, validate, docs generator) |
| `.claude/hooks/` | Startup and post-tool hooks for Claude Code |
| `.github/workflows/` | CI validation (structure, metadata, symlinks, docs) |

---

## Examples: Common tasks

### Example 1: Create a security-focused skill

```bash
ops/new-skill.sh security-scan

# Edit the skill to include OWASP mappings
vim shared/skills/security-scan/SKILL.md

# Add test cases
vim shared/skills/security-scan/tests.yaml

# Validate
bash adapters/claude/dev-test.sh
```

### Example 2: Set up MCP server on a new machine

```bash
# 1. Edit machine-specific config
vim runtime/config/machines/work-laptop.yaml

# 2. Add the MCP you want
# mcps:
#   - name: my-mcp
#     type: stdio
#     command: /usr/local/bin/my-mcp

# 3. Apply
bash runtime/sync.sh

# 4. Verify
bash ops/runtime-status.sh
```

### Example 3: Share a workflow across your team

Workflows compose multiple skills:

```yaml
# shared/workflows/daily-standup.yaml
name: daily-standup
description: Morning review of changes and tasks
skills:
  - git-ops       # Fetch latest, summarize commits
  - memory        # Load context from yesterday
  - task-decompose # Break down priority work
  - web-search    # Current events check (optional)
```

Run it: `Claude Code → Run Workflow → daily-standup`

---

## Status and roadmap

| Phase | Status | What it adds |
|-------|--------|-------------|
| Phase 1–7 | ✅ Complete | 23 skills, skill metadata, testing, composition, multi-device sync |
| Phase 8 | ✅ Complete | Runtime config layer, MCP server, React dashboard, desired-state sync |
| Phase 9 | 🔄 Planned | Analytics dashboard refinement, skill marketplace discovery |

See [PLAN.md](PLAN.md) for detailed implementation progress and [CLAUDE.md](CLAUDE.md) for development conventions.

---

## Troubleshooting

**Installation failed or skills don't appear:**
```bash
bash adapters/claude/dev-test.sh
```
This validates structure and shows specific errors.

**Sync engine not applying changes:**
```bash
bash runtime/sync.sh --dry-run  # Preview what would change
bash ops/runtime-status.sh      # Check overall health
```

**Plugin version mismatch after authoring:**
- After editing a skill, the version in `plugins/core-skills/.claude-plugin/plugin.json` auto-bumps
- If conflicts arise, see "Session startup checklist" in [CLAUDE.md](CLAUDE.md)

---

## Contributing

We welcome improvements, bug reports, and new skills.

**To contribute:**
1. Fork the repository
2. Create a feature branch: `git checkout -b claude/my-feature`
3. Make your changes
4. Run validation: `bash adapters/claude/dev-test.sh`
5. Commit with [conventional commit](https://www.conventionalcommits.org/) messages (e.g., `feat: add new skill`, `fix: resolve symlink issue`)
6. Push to your fork and create a pull request

**For skill contributions:** Please include multi-model variants (Opus, Sonnet, Haiku), at least one test case, and update `shared/manifest.md`.

---

## License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

---

## Acknowledgements

This project builds on the excellent work of the Mycelium project by [@bytemines](https://github.com/bytemines/mycelium). Specifically, we adopted Mycelium's architectural concepts for desired-state tool management, including:

- **Three-tier configuration merge** (global → machine → project)
- **Tool registry abstraction** for managing Claude Code, Cursor, Codex, and other agents
- **MCP server integration** for exposing configuration operations as agent tools
- **Dashboard visualization** for runtime and skill library visibility

All components in ai-config-os are implemented from scratch using ai-config-os conventions and resolved architectural challenges present in the original design (in-place mutation, subprocess overhead, race conditions). Our approach integrates these concepts seamlessly with the skill authoring system, creating a unified layer for both skill definition and tool management.

Thank you to the Mycelium team for the foundational ideas that shaped this system.

---

## Quick links

- **[CLAUDE.md](CLAUDE.md)** — Development context, conventions, and checklist (loaded automatically in Claude Code)
- **[PLAN.md](PLAN.md)** — Implementation roadmap and completion status
- **[shared/manifest.md](shared/manifest.md)** — Searchable index of all available skills and workflows
- **[shared/skills/_template/SKILL.md](shared/skills/_template/SKILL.md)** — Template for creating new skills

---

**Questions?** Open an issue. **Feedback?** Pull requests welcome. Happy building!
