# Skills Reference

Comprehensive reference for skills in AI Config OS — how they relate to the Agent Skills open standard, how Claude Code discovers and invokes them, and how this repo extends the format with multi-model variants, capability contracts, and cross-platform distribution.

## Agent Skills Open Standard

This project follows the [Agent Skills](https://agentskills.io) open standard — a portable, tool-agnostic format for giving AI agents new capabilities. The standard is supported by 30+ agent products including Claude Code, Cursor, VS Code (Copilot), GitHub Copilot, Gemini CLI, OpenAI Codex, Goose, Roo Code, JetBrains Junie, and many more.

### What the standard defines

A skill is a directory containing a `SKILL.md` file with YAML frontmatter and Markdown instructions:

```
my-skill/
├── SKILL.md          # Required: metadata + instructions
├── scripts/          # Optional: executable code
├── references/       # Optional: documentation
└── assets/           # Optional: templates, resources
```

**Required frontmatter fields** (per the open standard):

| Field         | Constraints                                                              |
| ------------- | ------------------------------------------------------------------------ |
| `name`        | 1–64 chars, lowercase letters/numbers/hyphens, must match directory name |
| `description` | 1–1024 chars, describes what the skill does and when to use it           |

**Optional standard fields:** `license`, `compatibility`, `metadata`, `allowed-tools`

### Progressive disclosure

Skills use a three-tier loading model to manage context efficiently:

1. **Discovery** (~100 tokens): Only `name` and `description` loaded at startup for all skills
2. **Activation** (<5000 tokens recommended): Full `SKILL.md` body loaded when skill is invoked
3. **Resources** (as needed): Supporting files (`scripts/`, `references/`, `assets/`) loaded on demand

Keep `SKILL.md` under 500 lines. Move detailed reference material to separate files.

### Why this matters for portability

Because the standard is tool-agnostic, skills authored here can work across any compatible agent. The compiler emits platform-specific packages (`dist/clients/<platform>/`), but the source skills in `shared/skills/` follow the open standard and can be consumed directly by any Agent Skills-compatible tool.

### Cursor IDE (compiler output)

When installing from this repo’s Cursor package (`dist/clients/cursor/` after `npm run build`):

- **Discovery path:** Cursor loads Agent Skills from `~/.cursor/skills` or `<project>/.cursor/skills`, not from the build output root by itself. From this repo run `npm run install:cursor-skills` to copy every **Cursor-compatible** emitted skill (or copy `dist/clients/cursor/skills/<skill-id>/` manually). See [Cursor Agent Skills](https://cursor.com/docs/context/skills). Skills excluded for the `cursor` platform in frontmatter are not present under `dist/clients/cursor/skills/`.
- **Preserved frontmatter:** Standard keys such as `allowed-tools`, `license`, `compatibility`, and `metadata` are not stripped by the Cursor emitter (only Claude-only and repo-internal keys in the build strip list are removed).
- **`prompts/` directory:** The compiler may emit `prompts/` next to `SKILL.md` for parity with the Claude Code package. Cursor’s documented optional layout includes `scripts/`, `references/`, and `assets/`; additional sibling directories are harmless on disk.

## Claude Code Skill Features

Claude Code extends the Agent Skills standard with additional capabilities. These features are specific to Claude Code but do not break compatibility with other tools (unknown frontmatter fields are ignored).

### Invocation control

Two frontmatter fields control who can invoke a skill:

| Field                            | Effect                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `disable-model-invocation: true` | Only the user can invoke via `/skill-name`. Claude won't trigger it automatically. Use for side-effect workflows like deploy, commit. |
| `user-invocable: false`          | Only Claude can invoke. Hidden from the `/` menu. Use for background knowledge that isn't actionable as a command.                    |

**Default behavior (advisory):** Both user and Claude are expected to be able to invoke the skill. Description preloading depends on the active Claude Code runtime and should be treated as expected behavior, not an enforcement guarantee from this repository alone.

| Frontmatter                      | User can invoke | Claude can invoke | Context loading                                                                                |
| -------------------------------- | --------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| (default)                        | Yes             | Yes               | Description is typically in context; full skill usually loads when invoked (runtime-dependent) |
| `disable-model-invocation: true` | Yes             | No                | Description not in context; full skill loads on user invoke                                    |
| `user-invocable: false`          | No              | Yes               | Description is typically in context; full skill usually loads when invoked (runtime-dependent) |

### Running skills in a subagent

Add `context: fork` to run a skill in an isolated subagent. The skill content becomes the subagent's task prompt. It won't have access to conversation history.

```yaml
---
name: deep-research
description: Research a topic thoroughly
context: fork
agent: Explore
---

Research $ARGUMENTS thoroughly:
1. Find relevant files using Glob and Grep
2. Read and analyze the code
3. Summarize findings with specific file references
```

The `agent` field selects the subagent type: `Explore`, `Plan`, `general-purpose`, or any custom agent from `.claude/agents/`. If omitted, uses `general-purpose`.

**When to use `context: fork`:** The skill must contain explicit task instructions. Guidelines without a task (e.g., "use these API conventions") produce no meaningful output in a subagent.

### Dynamic context injection

The `` !`command` `` syntax runs shell commands before skill content is sent to Claude. Output replaces the placeholder.

```yaml
---
name: pr-summary
description: Summarize changes in a pull request
context: fork
agent: Explore
---

## Pull request context
- PR diff: !`gh pr diff`
- PR comments: !`gh pr view --comments`

## Your task
Summarize this pull request...
```

This is preprocessing — Claude receives the final rendered prompt with actual data, not the commands.

### Argument substitution

Skills support positional arguments:

| Variable               | Description                                    |
| ---------------------- | ---------------------------------------------- |
| `$ARGUMENTS`           | All arguments passed when invoking the skill   |
| `$ARGUMENTS[N]`        | Specific argument by 0-based index             |
| `$N`                   | Shorthand for `$ARGUMENTS[N]`                  |
| `${CLAUDE_SESSION_ID}` | Current session ID                             |
| `${CLAUDE_SKILL_DIR}`  | Directory containing the skill's SKILL.md file |

If `$ARGUMENTS` is not present in content, arguments are appended as `ARGUMENTS: <value>`.

### Tool restrictions

Use `allowed-tools` to limit which tools Claude can use when a skill is active:

```yaml
---
name: safe-reader
description: Read files without making changes
allowed-tools: Read, Grep, Glob
---
```

### Additional Claude Code frontmatter

| Field           | Purpose                                                 |
| --------------- | ------------------------------------------------------- |
| `argument-hint` | Hint shown during autocomplete (e.g., `[issue-number]`) |
| `model`         | Model to use when skill is active                       |
| `hooks`         | Hooks scoped to this skill's lifecycle                  |

### Skill locations in Claude Code

| Scope      | Path                               | Applies to                |
| ---------- | ---------------------------------- | ------------------------- |
| Enterprise | Managed settings                   | All users in organization |
| Personal   | `~/.claude/skills/<name>/SKILL.md` | All your projects         |
| Project    | `.claude/skills/<name>/SKILL.md`   | This project only         |
| Plugin     | `<plugin>/skills/<name>/SKILL.md`  | Where plugin is enabled   |

Priority: enterprise > personal > project. Plugin skills use `plugin-name:skill-name` namespace.

Claude Code also discovers skills from nested `.claude/skills/` directories (monorepo support) and from directories added via `--add-dir`.

### Bundled skills (ship with Claude Code)

| Skill                       | Purpose                                                    |
| --------------------------- | ---------------------------------------------------------- |
| `/batch <instruction>`      | Orchestrate large-scale parallel changes across a codebase |
| `/claude-api`               | Load Claude API reference for your project's language      |
| `/debug [desc]`             | Troubleshoot current session by reading debug log          |
| `/loop [interval] <prompt>` | Run a prompt repeatedly on an interval                     |
| `/simplify [focus]`         | Review changed files for reuse, quality, efficiency issues |

### MCP prompts as commands

MCP servers can expose prompts that appear as commands with the format `/mcp__<server>__<prompt>`. These are dynamically discovered from connected servers.

## How This Repo Extends Skills

AI Config OS extends the Agent Skills standard with additional metadata for multi-model intelligence, capability-based compatibility, automated testing, and cross-platform distribution. These extensions live in the YAML frontmatter alongside the standard fields.

### Frontmatter mapping: standard vs extended

| Standard field  | This repo's field  | Notes                                                           |
| --------------- | ------------------ | --------------------------------------------------------------- |
| `name`          | `skill`            | Used as `skill:` internally; emitted as `name:` for Claude Code |
| `description`   | `description`      | Same                                                            |
| `allowed-tools` | `allowed-tools`    | Same                                                            |
| —               | `type`             | `prompt`, `hook`, `agent`, `workflow-blueprint`                 |
| —               | `status`           | `stable`, `experimental`, `deprecated`                          |
| —               | `capabilities`     | Structured capability requirements                              |
| —               | `platforms`        | Platform-specific overrides                                     |
| —               | `variants`         | Multi-model prompt variants                                     |
| —               | `inputs`/`outputs` | Typed parameter declarations                                    |
| —               | `dependencies`     | Skill, API, and model dependencies                              |
| —               | `tests`            | Automated validation definitions                                |
| —               | `monitoring`       | Performance tracking configuration                              |
| —               | `version`          | Skill-level semver (independent of release version)             |
| —               | `resource_budget`  | Optional resource **policy** (not precise billing); see schema below |

### Resource budget (optional)

Skills may declare a **`resource_budget`** block so the compiler and runtime share the same policy intent: subscription **pressure**, API **spend**, or **hybrid** overflow. Values are validated against [`shared/contracts/schemas/v1/resource-budget.schema.json`](../shared/contracts/schemas/v1/resource-budget.schema.json). This models **policy and headroom**, not vendor-secret quotas. Omitted on most skills until they opt in.

### Capability contract

Skills declare structured capability requirements. The compiler uses these to resolve cross-platform compatibility:

```yaml
capabilities:
  required: [git.read, shell.exec] # Must be supported for skill to work
  optional: [fs.write] # Enhances skill but not essential
  fallback_mode: prompt-only # none | manual | prompt-only
  fallback_notes: "User can paste git output manually"
```

Available capabilities: `fs.read`, `fs.write`, `shell.exec`, `shell.long-running`, `git.read`, `git.write`, `network.http`, `browser.fetch`, `mcp.client`, `env.read`, `secrets.inject`, `ui.prompt-only`.

Platform capability states live in `shared/targets/platforms/*.yaml`. The compiler computes compatibility during build/runtime checks; compatibility outcomes are enforced only where validation scripts or tests execute.

### Multi-model variants

Skills can define model-specific prompt files:

```yaml
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
  fallback_chain: [opus, sonnet, haiku]
```

### Skill testing

Skills define test cases in frontmatter:

```yaml
tests:
  - id: test-basic
    type: prompt-validation # or: structure-check, integration, performance
    input: "Example input"
    expected_substring: "expected text"
    models_to_test: [sonnet]
  - id: perf-test
    type: performance
    input: "Benchmark input"
    max_latency_ms: 2000
    iterations: 5
```

## Hooks

Hooks are configured shell commands intended to run at Claude Code lifecycle points. In practice, execution depends on host/runtime hook support and setup state. Treat hook behavior as advisory unless enforced by explicit automation checks in this repo.

### Hook types

| Type      | Behavior                                     |
| --------- | -------------------------------------------- |
| `command` | Run a shell command (default)                |
| `http`    | POST event data to a URL                     |
| `prompt`  | Single-turn LLM evaluation (yes/no decision) |
| `agent`   | Multi-turn verification with tool access     |

### Key hook events

| Event               | When it fires                      | Matcher filters                |
| ------------------- | ---------------------------------- | ------------------------------ |
| `SessionStart`      | Session begins or resumes          | `startup`, `resume`, `compact` |
| `PreToolUse`        | Before a tool executes (can block) | Tool name                      |
| `PostToolUse`       | After a tool succeeds              | Tool name                      |
| `PermissionRequest` | Permission dialog appears          | Tool name                      |
| `Notification`      | Claude needs input                 | Notification type              |
| `Stop`              | Claude finishes responding         | —                              |
| `ConfigChange`      | Settings or skills file modified   | Config source                  |

### Hook communication

- **stdin**: JSON event data
- **stdout**: Output added to Claude's context (exit 0) or structured JSON decision
- **stderr**: Feedback to Claude (exit 2 = block) or debug logging
- **Exit 0**: Action proceeds
- **Exit 2**: Action blocked (stderr message sent to Claude as feedback)

### Common patterns

**Auto-format after edits:**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write"
          }
        ]
      }
    ]
  }
}
```

**Block protected files:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/protect-files.sh"
          }
        ]
      }
    ]
  }
}
```

**Re-inject context after compaction:**

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Reminder: use Bun, not npm. Run bun test before committing.'"
          }
        ]
      }
    ]
  }
}
```

### Hook location scopes

| Location                        | Scope                   |
| ------------------------------- | ----------------------- |
| `~/.claude/settings.json`       | All your projects       |
| `.claude/settings.json`         | Single project (shared) |
| `.claude/settings.local.json`   | Single project (local)  |
| Plugin `hooks/hooks.json`       | When plugin is enabled  |
| Skill/agent frontmatter `hooks` | While skill is active   |

## Authoring Skills in This Repo

### Where to author

Always author skills in `shared/skills/`. Never edit directly in `plugins/` or `dist/`.

### Creating a new skill

```bash
node scripts/build/new-skill.mjs my-skill
# Edit the skill
vim shared/skills/my-skill/SKILL.md
# Update the index
vim shared/manifest.md
# Validate
bash adapters/claude/dev-test.sh
```

Use `shared/skills/_template/SKILL.md` as a starting point. The template includes all available frontmatter fields with comments.

### Build and distribution

```bash
npm install                            # First time only
node scripts/build/compile.mjs         # Validate + emit dist/
node scripts/build/compile.mjs --validate-only  # Validation only, no output
```

The compiler reads from `shared/skills/`, resolves platform compatibility, and emits self-sufficient packages to `dist/clients/<platform>/`. See [CLAUDE.md](../CLAUDE.md) for the portability and delivery contracts that protect this pipeline.

### Linting

```bash
node scripts/lint/skill.mjs shared/skills/*/SKILL.md
node scripts/lint/platform.mjs shared/targets/platforms/*.yaml
```

### Testing a skill

**In Claude Code — automatic invocation:** Ask something matching the description:

```
How does this code work?
```

**In Claude Code — direct invocation:**

```
/explain-code src/auth/login.ts
```

**Validation suite:**

```bash
bash adapters/claude/dev-test.sh
npm test
```

## Related Resources

- [Agent Skills specification](https://agentskills.io/specification) — The open standard
- [Claude Code skills docs](https://code.claude.com/docs/en/skills) — Official Claude Code reference
- [Claude Code hooks guide](https://code.claude.com/docs/en/hooks-guide) — Hook patterns and examples
- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks) — Full event schemas
- [Claude Code commands](https://code.claude.com/docs/en/commands) — Built-in command reference
- [Example skills](https://github.com/anthropics/skills) — Open-source skill examples
- [shared/skills/\_template/SKILL.md](../shared/skills/_template/SKILL.md) — This repo's skill template
- [shared/manifest.md](../shared/manifest.md) — Index of all skills in this repo
