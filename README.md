# AI Config OS

**Build a personal AI behaviour layer for Claude Code and other agents.**

AI Config OS is a plugin marketplace and skill authoring system that centralizes how you configure AI agents across your devices. Instead of scattering prompts, hooks, and conventions across different tools, you define them once in a shared library and deploy them everywhere—your Claude Code workspace, Cursor, Codex, or any tool that supports plugins.

Skills follow the [Agent Skills](https://agentskills.io) open standard — a portable format supported by 30+ agent products including Claude Code, Cursor, VS Code (Copilot), GitHub Copilot, Gemini CLI, OpenAI Codex, and many others. This repo extends the standard with multi-model variants, capability contracts, automated testing, and cross-platform distribution. See [`docs/SKILLS.md`](docs/SKILLS.md) for the comprehensive skills reference.

## What can you do with it?

- **Centralize AI behaviour:** Define skills, hooks, and conventions in one place; sync across devices
- **Author skills that understand themselves:** Skills include metadata (inputs, outputs, dependencies, tests) so AI agents can discover and compose them intelligently
- **Multi-model intelligence:** Tag skills with model variants (Opus for complexity, Sonnet for balance, Haiku for speed) and let the system pick the best one
- **Visualize your setup:** A React dashboard shows your installed tools, skill library, context costs, and performance metrics
- **Desired-state tool management:** Declare what tools you want, and a sync engine keeps your environment in sync across machines

This is for you if you spend time in Claude Code, Cursor, or other agent IDEs, and want consistency without repetition.

---

## Architecture: Source → Build → Distribution

AI Config OS follows a clean **portability contract**:

1. **Source:** Skills are authored once in `shared/skills/` as self-contained SKILL.md files with full metadata
2. **Build:** The compiler reads only from source, validates skills, and emits **self-sufficient packages** to `dist/clients/<platform>/`
3. **Distribution:** Emitted packages are complete and independent—no symlinks, no source-tree references, no external dependencies
4. **Materialisation:** Packages can be extracted (cached, archived, offline) and materialized on any system without source access

This architecture ensures:
- **Portability:** Same skill package works in CI, on your laptop, or an air-gapped device
- **Determinism:** Same source always produces identical emitted packages (no timestamps in build output)
- **Scalability:** Packages can be distributed via Worker, S3, package manager, or Git without modification

## Architecture: Runtime Execution (Phase 1 Cloudflare-first)

**Phase 1 is Cloudflare-first. No external executor host is required.**

The main execution flow:

1. **Main Worker** (`worker/src/`) — API gateway serving artifacts, routing requests
2. **Executor Worker** (`worker/executor/`) — Executes Phase 1 tools via service binding (KV/R2 metadata queries only, 15s timeout)
3. **Task control plane** (`runtime/lib/`) — Portable task state, route resolution, continuation

All execution is contained within Cloudflare Workers. The two Workers communicate via **service binding** (no external HTTP overhead).

### Phase 1 Constraints (by design)

Phase 1 does **not** support:
- Shell execution (`bash`, `sh`, etc.)
- Filesystem read/write
- Git operations
- Long-lived processes
- External subprocess spawning

Phase 1 **does** support:
- KV/R2 queries (metadata, artifacts)
- Service binding between Workers (fast, no HTTP)
- Portable task state and continuation

### Supporting Components

- `runtime/mcp/` — Local development MCP server (exposes runtime operations)
- `runtime/remote-executor/` — Reference Phase 0 HTTP executor (preserved for Phase 2 seam only)
- `dashboard/` — Operator UI over runtime API

### Phase 2 (future, not implemented)

A future phase may add VPS-backed executor for shell, filesystem, git, and long-running tasks. The seam for Phase 2 is preserved in code but not implemented yet. Phase 1 will remain the primary fast path for metadata operations.

## Current state

The `review_repository` portable task journey is complete end-to-end:

- start in a weaker environment (web, mobile, pasted diff, uploaded bundle)
- create a canonical task object with route-specific inputs
- continue in a stronger environment (`local_repo`)
- preserve findings with explicit provenance (`verified`, `reused`, `hypothesis`)
- finish without asking the user to restate the task

The **Momentum Engine** (Phase 10 milestone) is now complete — it adds the experience layer on top of the task control plane:

- **Narrator:** produces structured prose from task state at start, resume, finding-evolution, and upgrade-available moments
- **Observer:** records narrations and user responses via the existing ProgressEventPipeline
- **Shelf:** ranks continuable tasks by environment-aware continuation value
- **Intent Lexicon:** resolves natural language phrases to task types and route hints
- **Reflector:** analyzes observation data and proposes narrator/lexicon improvements; invoke via `/momentum-reflect` or `/loop 10m /momentum-reflect`

Task state is now persisted cross-session via **Cloudflare KV** (`runtime/lib/task-store-kv.mjs`). The session-start hook queries the Worker for active tasks and surfaces resume prompts automatically.

### Operational validation snapshot (2026-03-24)

Current operational verification status is aligned with `PLAN.md` acceptance criteria:
- **Marketplace add + Claude Code install:** partially validated (local package build/extract complete; interactive Claude Code marketplace flow blocked in this runner due missing `claude` binary/UI).
- **Installed skill exposure:** validated on two environments (`claude-code` package extraction + `codex` install with skill presence checks in `~/.codex/AGENTS.md`).
- **Cross-device sync (A push → B restart):** push/pull sync verified across separate A/B clones; full post-sync restart validation on B is still blocked pending fresh-device dependency bootstrap.

The detailed planning notes live in `PLAN.md`, with supporting research documents in `specs/`.

---

## Getting started

### Prerequisites

Before you begin, ensure you have:

- **Claude Code** (required for plugin installation and testing)
- **Node.js 18+** (required by MCP server and dashboard)
- **jq** (optional; used by some adapter scripts)
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
- Validates skill structure and source integrity
- Confirms frontmatter syntax

You should see "All validation stages passed ✓" before proceeding.

### Step 3: Explore the dashboard

The optional visual dashboard shows your tool configuration, skills, and performance metrics:

```bash
# Start the MCP server (serves tools + dashboard API on 127.0.0.1:4242 by default)
bash runtime/mcp/start.sh &

# In a new terminal, start the dashboard dev server
cd dashboard && npm run dev

# Open http://localhost:5173 in your browser
```


Security note: dashboard API requests are denied by default unless they originate from loopback or provide tunnel assertions (`X-Tunnel-Token`, trusted forwarding headers, or optional mTLS verification header). CORS follows the same tunnel policy: loopback origins stay enabled for local development, and you can allow a public dashboard origin with `DASHBOARD_PUBLIC_ORIGINS`. Configure `TUNNEL_SHARED_TOKEN`, `TRUSTED_FORWARDER_IPS`, and `REQUIRE_TUNNEL_MTLS=1` as needed.

The dashboard provides eight top-level tabs:
- **Tools:** Runtime status and sync for Claude Code, Cursor, Codex
- **Skills:** Complete skill library with metadata and variants
- **Context Cost:** Real-time token footprint tracking
- **Config:** View merged configuration across all tiers
- **Audit:** Run validation checks on the entire setup
- **Analytics:** Track which skills you use most and their performance; Friction Signals section shows signal-type breakdown and top-5 skill recommendations from retrospective data
- **Tasks:** Active task shelf ranked by environment-aware continuation value
- **Bootstrap Runs:** Observability timeline for bootstrap execution runs

Within **Tasks**, selecting a task opens the nested **Task Detail** view with task state, route history, findings provenance, and readiness context.

---

## Installation & Setup by Platform

Choose your primary Claude surface(s) and follow the setup steps:

### Claude Code CLI (local)

**Best for:** Local development, terminal-first workflow, offline usage.

#### 1. Obtain your Worker credentials

You have two options:

**Option A: Use the public shared Worker (recommended for most users)**
- No setup needed — the public Worker is shared and already deployed
- Token is available in the repo secrets or documentation
- If using in this repository, the token is typically in CI secrets or a credentials file

**Option B: Deploy your own Worker (for customization)**
```bash
cd worker
wrangler secret put AUTH_TOKEN         # Set your chosen secret token
wrangler deploy                         # Deploy to Cloudflare
```
After deployment, note your Worker URL from the deploy output (e.g., `https://your-worker.workers.dev`)

#### 2. Configure environment variables

Store the token and Worker URL persistently so Claude Code can access them:

**For bash/zsh (recommended):**
```bash
# Add to ~/.bashrc, ~/.zshrc, or ~/.bash_profile:
export AI_CONFIG_TOKEN="<your-token-here>"
export AI_CONFIG_WORKER="https://ai-config-os.workers.dev"

# Reload your shell
source ~/.bashrc  # or ~/.zshrc
```

**For fish shell:**
```fish
# Add to ~/.config/fish/config.fish:
set -gx AI_CONFIG_TOKEN "<your-token-here>"
set -gx AI_CONFIG_WORKER "https://ai-config-os.workers.dev"

# Reload
source ~/.config/fish/config.fish
```

**For Windows (PowerShell):**
```powershell
# Set environment variables permanently
[Environment]::SetEnvironmentVariable("AI_CONFIG_TOKEN", "<your-token-here>", "User")
[Environment]::SetEnvironmentVariable("AI_CONFIG_WORKER", "https://ai-config-os.workers.dev", "User")

# Restart PowerShell to apply changes
```

**For one-time use (testing only):**
```bash
export AI_CONFIG_TOKEN="<your-token-here>"
export AI_CONFIG_WORKER="https://ai-config-os.workers.dev"
# Commands in this terminal session will use these values
```

#### 3. Verify your credentials

```bash
# Test that the Worker is reachable
curl -H "Authorization: Bearer $AI_CONFIG_TOKEN" \
  "$AI_CONFIG_WORKER/v1/manifest/latest" \
  | head -50  # Show first 50 lines

# You should see JSON with skill metadata, not a 403 or 401 error
```

#### 4. Fetch and cache skills

```bash
bash adapters/claude/materialise.sh
# Downloads skills and caches them to ~/.ai-config-os/cache/claude-code/latest.json
```

#### 5. Verify installation

```bash
bash adapters/claude/materialise.sh status
# Shows: Local cache version vs remote version
# Example: "Local cache: v1.0.0, Remote: v1.0.0 ✓"
```

#### 6. Use skills in Claude Code

```bash
claude ask "your question"  # Skills now available as slash commands
```

**Offline fallback:** Skills are cached at `~/.ai-config-os/cache/claude-code/latest.json`. If the Worker is unreachable, Claude Code automatically uses the last-known-good manifest.

---

### Claude Code CLI (remote environments)

**Best for:** Cloud development, SSH sessions, GitHub Codespaces, AWS CodeSpaces, CI/CD agents.

#### Setup by environment

**GitHub Codespaces (recommended for most cloud workflows):**

1. Open your Codespace settings:
   - Click your avatar → **Codespaces** → Select your Codespace → Click the gear icon (⚙)
   - Or go to **Settings** → **Codespaces** → **Environment variables** (top-right "New secret" button)

2. In **Environment variables**, add these as **Codespace secrets** (visible to all your Codespaces):
   ```
   AI_CONFIG_TOKEN=<your-token>
   AI_CONFIG_WORKER=https://ai-config-os.workers.dev
   ```
   Codespaces automatically injects these into all new sessions.

3. Optional: Add a setup script to `.devcontainer/devcontainer.json` if you need to run commands at session start:
   ```json
   {
     "postCreateCommand": "echo 'Codespace ready for AI Config OS'"
   }
   ```

**SSH / VPS / Cloud VM (any remote server):**

1. SSH into your remote machine and edit your shell startup file:
   ```bash
   # For bash:
   echo 'export AI_CONFIG_TOKEN="<your-token>"' >> ~/.bashrc
   echo 'export AI_CONFIG_WORKER="https://ai-config-os.workers.dev"' >> ~/.bashrc
   source ~/.bashrc

   # For zsh:
   echo 'export AI_CONFIG_TOKEN="<your-token>"' >> ~/.zshrc
   echo 'export AI_CONFIG_WORKER="https://ai-config-os.workers.dev"' >> ~/.zshrc
   source ~/.zshrc
   ```

2. Verify the variables are set:
   ```bash
   echo $AI_CONFIG_TOKEN
   echo $AI_CONFIG_WORKER
   ```

#### Automatic session-start behavior

When Claude Code starts in a remote environment, the session-start hook automatically:

1. **Validates skill structure** (early error detection)
2. **Probes platform capabilities** (filesystem, shell, MCP)
3. **Fetches latest manifest in background** (non-blocking)
4. **Refreshes retrospectives aggregate cache** in background (non-blocking; skipped if cache is <6 days old)
5. **Falls back to cached manifest** if Worker is unreachable

This means skills are available **immediately**, even if:
- Network is slow or partitioned
- Worker is temporarily down
- Manifest cache is >7 days old

#### Robustness guarantees

| Scenario | Behavior | Fallback |
|----------|----------|----------|
| Worker unavailable | Cached manifest available indefinitely | Continue using last-known-good |
| Network partition | All cached skills work offline | Session continues with cached skills |
| Manifest stale (>1 day) | Still usable; versions are immutable | No breaking changes retroactively applied |
| New skill published | Available next session | Current session uses cached skills |

#### Testing robustness locally

Simulate offline scenarios:
```bash
# Clear the cache to test fallback behavior
rm ~/.ai-config-os/cache/claude-code/latest.json

# Check status (should show "no cache" warning)
bash adapters/claude/materialise.sh status

# Fetch new manifest
bash adapters/claude/materialise.sh

# Verify it's cached
bash adapters/claude/materialise.sh status
```

---

### Claude.ai web (browser)

**Status:** Not yet supported by the skill system.

Claude.ai web is currently tracked for capability compatibility modeling only. There is no Worker serving it, no runtime adapter, and no plugin system for skill discovery. Skills are not available in the browser version.

If you need cloud-based agent access, use **Claude Code CLI in a remote environment** (above) with Codespaces or SSH.

---

### Cursor IDE

**Best for:** Full-featured IDE development, multi-file edits.

```bash
# 1. Build Cursor-specific skill packages
npm run build

# 2. Cursor loads from dist/clients/cursor/
# Add the path to Cursor settings:
# - Open Cursor settings (Cmd/Ctrl + ,)
# - Search "plugins"
# - Add: /path/to/ai-config/dist/clients/cursor

# 3. Restart Cursor

# Troubleshooting:
bash adapters/claude/dev-test.sh   # Validate dist/ structure
```

---

### VS Code

**Best for:** VS Code with GitHub Copilot, lightweight IDE workflow.

```bash
# 1. Build VS Code-specific skill packages
npm run build

# 2. Install the CLI extension (one-time):
npm install -g @anthropic-ai/vs-code-extension

# 3. Configure VS Code:
# - Add to .vscode/settings.json:
{
  "anthropic.skillsPath": "/path/to/ai-config/dist/clients/vscode"
}

# 4. Reload VS Code window

# Verify:
bash adapters/claude/dev-test.sh
```

---

### JetBrains IDEs (IntelliJ, PyCharm, WebStorm, etc.)

**Best for:** JetBrains-native development, polyglot projects.

```bash
# 1. Build for JetBrains
npm run build

# 2. In JetBrains:
# - Go to Settings → Plugins → (gear icon) → Manage Plugin Repositories
# - Add: file:///path/to/ai-config/dist/clients/jetbrains

# 3. Install the plugin

# 4. Restart IDE
```

---

### Windsurf

**Best for:** Agentic IDE, multi-file coordinated edits.

```bash
# 1. Build for Windsurf
npm run build

# 2. Windsurf reads from .windsurf/settings.json
# Create or update it:
{
  "skills": {
    "source": "file:///path/to/ai-config/dist/clients/windsurf"
  }
}

# 3. Restart Windsurf
```

---

## Choosing Your Setup

| Surface | Setup time | Offline | Sync | Status |
|---------|-----------|--------|------|--------|
| **Claude Code CLI** (local) | 2 min | ✅ Yes | Auto via Worker | **Production** |
| **Claude Code CLI** (remote/Codespaces/SSH) | 2 min | ✅ Yes (with robustness guarantees) | Auto via Worker | **Production** |
| **Cursor** | 3 min | ✅ Yes | Manual rebuild | **Partial** |
| **VS Code** | 3 min | ✅ Yes | Manual rebuild | **Partial** |
| **JetBrains** | 3 min | ✅ Yes | Manual rebuild | **Partial** |
| **Windsurf** | 3 min | ✅ Yes | Manual rebuild | **Partial** |



**Recommendation:** Start with **Claude Code CLI** (2 min setup) to verify everything works, then add your IDE of choice. For cloud environments, Claude Code CLI in Codespaces or SSH is fully supported with offline fallbacks.

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
# 1. Generate scaffold (creates directory, updates manifest; symlink on Unix)
node scripts/build/new-skill.mjs my-skill

# 2. Edit the skill (use shared/skills/_template/SKILL.md as a guide)
vim shared/skills/my-skill/SKILL.md

# 3. Update the skill index
vim shared/manifest.md

# 4. Validate your work
bash adapters/claude/dev-test.sh
```

**Skill metadata structure:**

Every skill defines what it does using YAML frontmatter. The `name`/`skill` and `description` fields follow the [Agent Skills open standard](https://agentskills.io/specification); this repo adds extensions for multi-model intelligence and cross-platform distribution:

| Field | Standard | Purpose | Example |
|-------|----------|---------|---------|
| `skill`/`name` | Yes | Unique identifier | `my-skill` |
| `description` | Yes | What the skill does and when to use it | `Refactor code with safety checks` |
| `type` | Extended | Skill category | `prompt`, `hook`, `agent`, `workflow-blueprint` |
| `capabilities` | Extended | Required/optional platform capabilities | `required: [git.read, shell.exec]` |
| `inputs` | Extended | Required parameters | `code: string`, `refactor_scope: string` |
| `outputs` | Extended | What the skill produces | `refactored_code: string` |
| `dependencies` | Extended | Skills, APIs, or models needed | `dependencies: [security-review]` |
| `variants` | Extended | Model-specific prompts | `opus`, `sonnet`, `haiku` |
| `tests` | Extended | Automated validation | `test: { input: "...", expected_substring: "..." }` |

[See the full template](shared/skills/_template/SKILL.md) for all available fields, or [`docs/SKILLS.md`](docs/SKILLS.md) for the comprehensive reference.

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
  blockscout:
    type: http
    url: https://api.blockscout.com/
    enabled: true
  web-search:
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
| **`shared/skills/`** | **Canonical source.** Write skills here. Each skill is a folder with SKILL.md (metadata + prompts) and optional subdirectories (prompts/, tests/). Compiler reads *only* from this directory. |
| **`dist/clients/`** | **Emitted packages (self-sufficient, source-independent).** Each platform (claude-code, cursor) has a complete package: plugin.json + skill copies + resources (prompts/, etc.). These packages work standalone without source access. |
| **`dist/registry/`** | Cross-platform skill registry (index.json) with compatibility matrix. Single source of truth for what skills are available and which platforms support them. |
| **`dist/runtime/`** | Runtime control-plane metadata documents (manifest, outcomes, routes, tool-registry, task-route-definitions, task-route-input-definitions) consumed by Worker/MCP/dashboard adapters. Authoritative emitted surface for task orchestration metadata. |
| `shared/workflows/` | Skill compositions: named collections of skills executed in sequence |
| `shared/targets/` | Platform reference docs (capability definitions for v0.5.2+) |
| `shared/lib/` | Shared utility libraries (YAML parser, analytics, config merger) |
| `schemas/` | JSON Schemas for skill package manifests and related structures |
| `scripts/build/` | Compiler that validates skills and emits `dist/` artefacts |
| `scripts/build/lib/materialise-client.mjs` | Materialiser: extracts emitted packages without source access (portability contract) |
| `worker/` | Cloudflare Worker serving compiled skills via signed-request REST API |
| `worker/executor/` | Phase 1 executor Worker (Cloudflare-only, invoked via service binding; supports KV/R2 queries only) |
| `plugins/core-skills/` | Claude Code plugin (optional local symlinks to `shared/skills/` on Unix only) |
| `runtime/config/` | Desired-state configuration (global, machine, project overrides) |
| `runtime/adapters/` | Tool integration layer (Claude Code, Cursor, Codex) |
| `runtime/mcp/` | MCP server exposing runtime operations as Claude Code tools |
| `runtime/remote-executor/` | HTTP service that executes proxied tool requests from the worker (Phase 0, being phased out) |
| `runtime/lib/` | Task-control-plane core: route resolution, task lifecycle, findings provenance, continuation, runtime contracts, and Momentum Engine (narrator, observer, shelf, lexicon, reflector) |
| `dashboard/` | React SPA for runtime visibility and control |
| `ops/` | Developer scripts (new-skill, merge-open-prs, lint, validate, docs generator) |
| `.claude/hooks/` | Startup and post-tool hooks for Claude Code |
| `.github/workflows/` | CI validation (structure, metadata, source integrity, docs, build, portability contracts) |

---

## Examples: Common tasks

### Example 0: Merge all open PRs (sequentially)

```bash
bash ops/merge-open-prs.sh
```

This attempts to merge each open PR in order using GitHub CLI. If a merge fails due to conflicts, it rebases the PR branch on `origin/main`, pushes, and retries.

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
#   my-mcp:
#     type: stdio
#     command: /usr/local/bin/my-mcp

# 3. Apply
bash runtime/sync.sh

# 4. Verify
bash ops/runtime-status.sh
```

### Example 3: Share a workflow across your team

Workflows compose multiple skills. Use a checked-in workflow definition from `shared/workflows/daily-brief.json` so teammates can open the exact file:

```json
{
  "name": "daily-brief",
  "description": "Morning standup: synthesize recent changes, open issues, blocked work",
  "type": "workflow",
  "version": "1.0.0",
  "composed_skills": [
    { "skill": "git-ops", "variant": "sonnet" },
    { "skill": "changelog", "variant": "sonnet" },
    { "skill": "memory", "variant": "sonnet" },
    { "skill": "task-decompose", "variant": "sonnet" }
  ]
}
```

Run it: `Claude Code → Run Workflow → daily-brief`

Other checked-in workflow names you can run immediately:
- `pre-commit` (`shared/workflows/pre-commit.json`)
- `code-quality` (`shared/workflows/code-quality/workflow.json`)
- `release-agent` (`shared/workflows/release-agent/workflow.json`)
- `research-mode` (`shared/workflows/research-mode/workflow.json`)

---

## Status and roadmap

| Phase | Status | What it adds |
|-------|--------|-------------|
| Phase 1–7 | ✅ Complete | 22 skills, skill metadata, testing, composition, multi-device sync |
| Phase 8 | ✅ Complete | Runtime config layer, MCP server, React dashboard, desired-state sync |
| Phase 9.1–9.7 | ✅ Complete | Build compiler, distribution pipeline, capability contracts, delivery contract (28 tests), portability contract (76 tests), manifest feature flags |
| Phase 10 milestone | ✅ Complete | KV-backed task persistence, Codex emitter, Tasks tab + nested Task Detail view, Momentum Engine (narrator, observer, shelf, lexicon, reflector), 4 new skills |

> Versioning note: `VERSION` is the canonical repository release number (see `./VERSION`), while phase/milestone labels are internal roadmap checkpoints.

Canonical skill count declaration format (for deterministic CI parsing in docs): `Installable skill count: <number> (source: shared/skills/*/SKILL.md; excluding _template).`

### Platform maturity

| Platform | Compiler | Worker | Runtime sync | Status |
|----------|----------|--------|-------------|--------|
| Claude Code | Full emitter | Serves latest bundle | Full desired-state sync | **Production** |
| Cursor | Emits rules | Not served | No runtime adapter | **Partial** |
| Codex | Emits Codex package | Not served | `adapters/codex/materialise.sh` | **Partial** |
| claude-web, claude-ios | Capability model loaded | Not served | No adapter | **Model only** |

The capability contract and compatibility model cover all platforms. Operational tooling (Worker distribution, runtime sync, materialise) is complete for Claude Code. Cursor and Codex get compiler output but no runtime management. Other platforms are tracked for compatibility only.

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

**Plugin version mismatch:**
- The root `VERSION` file is the single source of truth for the release version
- Run `npm run version:sync` to mirror it into `package.json` and `plugin.json`, then `npm run version:check` to verify parity
- Note: `ops/new-skill.sh` does not change the release version — if you expected a version bump after scaffolding a skill, that is a separate step

---

## Versioning

The root `VERSION` file is the canonical release version. All other version references are derived from it:

- `package.json` and `plugins/core-skills/.claude-plugin/plugin.json` mirror `VERSION` (run `npm run version:sync` after editing)
- Skill versions stay in each skill's YAML frontmatter (independent of the release version)
- Creating or editing a skill does not bump the release version — release version bumps are explicit and separate
- `dist/` artefacts use the release version from `VERSION`
- Local builds are deterministic and contain no provenance; release builds (`--release`) add consistent provenance (built_at, build_id, source_commit) to all emitted artefacts

To bump the version: edit `VERSION`, run `npm run version:sync`, commit all three changed files.

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
- **[docs/SKILLS.md](docs/SKILLS.md)** — Comprehensive skills reference (Agent Skills standard, Claude Code features, hooks, authoring guide)
- **[PLAN.md](PLAN.md)** — Implementation roadmap and completion status
- **[shared/manifest.md](shared/manifest.md)** — Searchable index of all available skills and workflows
- **[shared/skills/_template/SKILL.md](shared/skills/_template/SKILL.md)** — Template for creating new skills
- **[Agent Skills standard](https://agentskills.io)** — The open standard this project follows

---

**Questions?** Open an issue. **Feedback?** Pull requests welcome. Happy building!
