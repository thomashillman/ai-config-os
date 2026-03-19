---
skill: agnostic-labs-skill-creator
description: |
  Create new skills that conform to the Agent Skills open standard and this repo's extended format.
  Use when authoring a brand-new skill from scratch — generates compliant SKILL.md with full frontmatter, capability contracts, multi-model variants, and tests.
type: prompt
status: stable

capabilities:
  required:
    - fs.read
    - fs.write
    - shell.exec
  optional:
    - git.read
    - git.write
  fallback_mode: prompt-only
  fallback_notes: "Can output a complete SKILL.md for the user to paste manually when filesystem access is unavailable."

platforms: {}

inputs:
  - name: skill_name
    type: string
    description: "Kebab-case name for the new skill (e.g. 'my-new-skill')"
    required: true
  - name: skill_description
    type: string
    description: "One-sentence description of what the skill does and when to use it"
    required: true
  - name: skill_type
    type: string
    description: "Skill type: prompt, hook, agent, or workflow-blueprint (default: prompt)"
    required: false
  - name: required_capabilities
    type: string
    description: "Comma-separated list of required capabilities (e.g. 'fs.read,shell.exec')"
    required: false
  - name: invocation_mode
    type: string
    description: "Who can invoke: 'both' (default), 'user-only' (disable-model-invocation: true), 'model-only' (user-invocable: false)"
    required: false
  - name: subagent
    type: string
    description: "Run in isolated subagent: 'none' (default), 'fork' (context: fork). Optionally specify agent type (Explore, Plan, general-purpose)"
    required: false
  - name: dynamic_context
    type: string
    description: "Shell commands to inject as dynamic context using !`command` syntax (e.g. 'gh pr diff')"
    required: false
  - name: allowed_tools
    type: string
    description: "Comma-separated list of tools to restrict Claude to (e.g. 'Read,Grep,Glob')"
    required: false
  - name: hook_events
    type: string
    description: "For hook-type skills: comma-separated lifecycle events (e.g. 'PreToolUse,PostToolUse')"
    required: false

outputs:
  - name: skill_directory
    type: string
    description: "Path to the created skill directory"
  - name: skill_md
    type: string
    description: "The generated SKILL.md content"
  - name: manifest_entry
    type: string
    description: "The row to add to shared/manifest.md"

dependencies:
  skills: []
  apis: []
  models:
    - sonnet

examples:
  - input: "Create a skill called 'api-monitor' that watches API endpoints for downtime"
    output: |
      Created shared/skills/api-monitor/SKILL.md with:
      - Full Phase 2 frontmatter (capability contract, variants, tests)
      - Three variant prompts (opus/sonnet/haiku)
      - Updated shared/manifest.md
    expected_model: sonnet
  - input: "Create a hook skill called 'pre-deploy-check' that validates deployments"
    output: |
      Created shared/skills/pre-deploy-check/SKILL.md with type: hook
      - Hook event bindings defined
      - Capability contract: requires shell.exec, git.read
      - Updated shared/manifest.md
    expected_model: sonnet

variants:
  opus:
    prompt_file: prompts/detailed.md
    description: "Full skill creation with thorough explanations, edge-case handling, and comprehensive variant prompts"
    cost_factor: 3.0
    latency_baseline_ms: 1200
  sonnet:
    prompt_file: prompts/balanced.md
    description: "Default; creates complete skill with all required sections and sensible defaults"
    cost_factor: 1.0
    latency_baseline_ms: 400
  haiku:
    prompt_file: prompts/brief.md
    description: "Minimal skill scaffold — frontmatter and skeleton body only"
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain:
    - sonnet
    - haiku
    - opus

tests:
  - id: test-creates-valid-frontmatter
    type: prompt-validation
    input: "Create a skill called 'test-skill' that runs automated tests"
    expected_substring: "skill: test-skill"
    models_to_test:
      - sonnet
  - id: test-includes-capability-contract
    type: prompt-validation
    input: "Create a skill called 'test-skill' that requires shell access"
    expected_substring: "capabilities"
    models_to_test:
      - sonnet
  - id: test-uses-kebab-case
    type: prompt-validation
    input: "Create a skill called 'my-new-skill'"
    expected_substring: "skill: my-new-skill"
    models_to_test:
      - haiku

docs:
  auto_generate_readme: true
  sections_to_include:
    - description
    - inputs
    - outputs
    - examples
  help_text: "Create a new skill that conforms to the Agent Skills open standard."
  keywords:
    - skill-creation
    - scaffold
    - generator
    - authoring
    - agent-skills

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

tags:
  - authoring
  - workflow
  - core
---

# agnostic-labs-skill-creator

Create new skills that conform to the Agent Skills open standard and this repo's extended format (Phase 2 frontmatter, capability contracts, multi-model variants, and tests).

## Capability contract

Requires filesystem access to create skill directories and write SKILL.md files. Requires shell access to run the scaffold script and validation. Can fall back to prompt-only mode and output the complete SKILL.md for the user to paste manually.

Available capabilities: `fs.read`, `fs.write`, `shell.exec`, `shell.long-running`,
`git.read`, `git.write`, `network.http`, `browser.fetch`, `mcp.client`, `env.read`,
`secrets.inject`, `ui.prompt-only`.

## When to use

- When the user asks to create a new skill from scratch
- When the user wants to generate a compliant SKILL.md with all required fields
- When scaffolding a new skill that must pass the delivery contract and linting
- When onboarding someone to the skill authoring process

## Instructions

### Step 1: Validate the skill name

The skill name **must** be kebab-case: lowercase letters, digits, and hyphens only. Pattern: `^[a-z][a-z0-9-]*$`. Reject names that don't match and suggest a corrected version.

### Step 2: Gather requirements

Ask the user (or infer from their request) for:

1. **Skill name** (required) — kebab-case identifier
2. **Description** (required) — one sentence: what it does and when to use it
3. **Type** — `prompt` (default), `hook`, `agent`, or `workflow-blueprint`
4. **Required capabilities** — which of the available capabilities the skill needs to function
5. **Optional capabilities** — which capabilities enhance but aren't essential
6. **Fallback mode** — `prompt-only` (default), `manual`, or `none`
7. **Invocation control** — who can invoke (see Step 4a)
8. **Subagent execution** — whether the skill runs in an isolated context (see Step 4b)
9. **Dynamic context** — shell commands to inject at invocation time (see Step 4c)
10. **Tool restrictions** — limit which tools Claude can use (see Step 4d)
11. **Hook configuration** — for hook-type skills, which events and matchers (see Step 4e)
12. **Dependencies** — other skills, APIs, or models required

### Step 3: Create the skill directory

```bash
mkdir -p shared/skills/<skill-name>/prompts
```

### Step 4: Generate SKILL.md

Create `shared/skills/<skill-name>/SKILL.md` with complete Phase 2 frontmatter.

#### Required frontmatter fields (schema-enforced)

- `skill` — kebab-case name
- `description` — one sentence + optional paragraph
- `type` — prompt | hook | agent | workflow-blueprint
- `status` — stable | experimental | deprecated
- `version` — semver (start at "1.0.0")
- `capabilities` — with `required`, `optional`, `fallback_mode`

#### Recommended frontmatter fields

- `inputs` / `outputs` — typed parameter definitions
- `dependencies` — skills, apis, models
- `examples` — input/output pairs with expected_model
- `variants` — opus/sonnet/haiku with prompt_file, description, cost_factor, latency_baseline_ms
- `fallback_chain` — model priority order
- `tests` — at least 2 prompt-validation tests
- `docs` — auto_generate_readme, help_text, keywords
- `monitoring` — track latency, token_count, cost
- `tags` — discovery tags
- `changelog` — version history

#### Step 4a: Invocation control

Two frontmatter fields control who can invoke the skill:

| Field | Effect |
|-------|--------|
| `disable-model-invocation: true` | Only the user can invoke via `/skill-name`. Claude won't trigger it automatically. Use for side-effect workflows (deploy, commit, destructive actions). |
| `user-invocable: false` | Only Claude can invoke. Hidden from `/` menu. Use for background knowledge, internal guidelines, or helper skills composed by other skills. |

**Default behavior (neither set):** Both user and Claude can invoke. The skill's description is always in context so Claude knows when to trigger it.

**Decision guide:**
- Does the skill have side effects (file writes, git operations, deployments)? → Set `disable-model-invocation: true`
- Is the skill background knowledge that isn't useful as a command? → Set `user-invocable: false`
- Is the skill a general-purpose tool? → Leave both unset (default)

```yaml
# Example: user-only deploy skill
disable-model-invocation: true

# Example: background knowledge skill
user-invocable: false
```

#### Step 4b: Subagent execution

Add `context: fork` to run a skill in an isolated subagent. The skill content becomes the subagent's task prompt — it will NOT have access to the conversation history.

```yaml
context: fork
agent: Explore  # or: Plan, general-purpose, or custom agent from .claude/agents/
```

**When to use `context: fork`:**
- The skill performs deep research that would clutter the main conversation
- The skill needs to search broadly without consuming main context tokens
- The skill body contains explicit task instructions (not just guidelines)

**When NOT to use `context: fork`:**
- The skill provides guidelines or conventions (e.g., "use these API patterns") — these produce no useful output in isolation
- The skill needs access to the current conversation history
- The skill modifies files that depend on conversation context

**Agent types:**
| Agent | Best for |
|-------|----------|
| `Explore` | Codebase research, file discovery, broad searches |
| `Plan` | Architecture planning, implementation strategy |
| `general-purpose` | Multi-step tasks with tool access (default) |
| Custom `.claude/agents/<name>.md` | Domain-specific agents |

#### Step 4c: Dynamic context injection

The `` !`command` `` syntax runs shell commands **before** skill content is sent to Claude. The command output replaces the placeholder in the rendered prompt.

```markdown
## Current state
- Git status: !`git status --short`
- Recent commits: !`git log --oneline -5`
- PR diff: !`gh pr diff`
```

**Use cases:**
- Inject current git state, branch info, or PR data
- Include environment variables or system info
- Pull in file contents or command output that changes between invocations

**Important:** This is preprocessing — Claude receives the final rendered text, not the commands. Commands run in the user's shell with their permissions.

#### Step 4d: Tool restrictions

Use `allowed-tools` to limit which tools Claude can use when the skill is active:

```yaml
allowed-tools: Read, Grep, Glob
```

**When to use:**
- Read-only skills that should never modify files → `Read, Grep, Glob`
- Skills that should only search the web → `WebSearch, WebFetch`
- Skills that need careful write control → `Read, Grep, Glob, Edit`

#### Step 4e: Hook configuration (for hook-type skills)

If the skill type is `hook`, configure the hook behavior:

**Hook types:**
| Type | Behavior |
|------|----------|
| `command` | Run a shell command (default, most common) |
| `http` | POST event data to a URL |
| `prompt` | Single-turn LLM evaluation (yes/no decision) |
| `agent` | Multi-turn verification with tool access |

**Key lifecycle events:**
| Event | When it fires | Matcher filters |
|-------|---------------|-----------------|
| `SessionStart` | Session begins or resumes | `startup`, `resume`, `compact` |
| `PreToolUse` | Before a tool executes (can block) | Tool name |
| `PostToolUse` | After a tool succeeds | Tool name |
| `PermissionRequest` | Permission dialog appears | Tool name |
| `Notification` | Claude needs input | Notification type |
| `Stop` | Claude finishes responding | — |
| `ConfigChange` | Settings or skills file modified | Config source |

**Hook communication protocol:**
- **stdin**: JSON event data (tool name, input, session info)
- **stdout**: Output added to Claude's context (exit 0) or structured JSON decision
- **stderr**: Feedback to Claude (exit 2 = block action with stderr message)
- **Exit 0**: Proceed — stdout content is added to context
- **Exit 2**: Block — stderr message sent to Claude as feedback

**Hook location scopes:**
| Location | Scope |
|----------|-------|
| `~/.claude/settings.json` | All projects (personal) |
| `.claude/settings.json` | Single project (shared with team) |
| `.claude/settings.local.json` | Single project (local only) |
| Plugin `hooks/hooks.json` | When plugin is enabled |
| Skill/agent frontmatter `hooks` | While skill is active |

**Common hook patterns:**

Auto-format after edits:
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{ "type": "command", "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write" }]
    }]
  }
}
```

Block protected files:
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/protect-files.sh" }]
    }]
  }
}
```

Re-inject context after compaction:
```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "compact",
      "hooks": [{ "type": "command", "command": "echo 'Reminder: use Bun, not npm.'" }]
    }]
  }
}
```

#### Step 4f: Argument substitution

Skills support positional arguments passed by the user:

| Variable | Description |
|----------|-------------|
| `$ARGUMENTS` | All arguments passed when invoking the skill |
| `$ARGUMENTS[N]` | Specific argument by 0-based index |
| `$N` | Shorthand for `$ARGUMENTS[N]` |
| `${CLAUDE_SESSION_ID}` | Current session ID |
| `${CLAUDE_SKILL_DIR}` | Directory containing the skill's SKILL.md |

If `$ARGUMENTS` is not present in the skill content, arguments are appended automatically as `ARGUMENTS: <value>`.

Use `argument-hint` in frontmatter to show autocomplete hints:
```yaml
argument-hint: "[file-path] [--verbose]"
```

#### Step 4g: MCP prompts as commands

MCP servers can expose prompts that appear as slash commands with the format `/mcp__<server>__<prompt>`. These are dynamically discovered from connected MCP servers. If the skill being created interacts with MCP servers, document which MCP prompts are relevant.

#### Step 4h: Skill location and discovery

Skills can live at different scopes:

| Scope | Path | Applies to |
|-------|------|------------|
| Enterprise | Managed settings | All users in org |
| Personal | `~/.claude/skills/<name>/SKILL.md` | All your projects |
| Project | `.claude/skills/<name>/SKILL.md` | This project only |
| Plugin | `<plugin>/skills/<name>/SKILL.md` | Where plugin is enabled |

Priority: enterprise > personal > project. Plugin skills use `plugin-name:skill-name` namespace. Claude Code also discovers skills from nested `.claude/skills/` directories (monorepo support) and directories added via `--add-dir`.

**For this repo:** Skills authored in `shared/skills/` are distributed via plugin. The compiler emits them to `dist/clients/<platform>/skills/`.

### Step 5: Body sections (after frontmatter)

1. `# <skill-name>` — heading matching the skill name
2. One-line summary + context paragraph
3. `## Capability contract` — declare minimum capabilities
4. `## When to use` — trigger conditions (3-5 bullet points)
5. `## Instructions` — the actual instructions Claude follows when invoked
6. `## Examples` — at least 2 concrete input/output examples

### Step 6: Create variant prompt files (if multi-model)

Create three prompt files in `prompts/`:
- `prompts/detailed.md` — opus: thorough, nuanced, handles edge cases
- `prompts/balanced.md` — sonnet: clear, complete, efficient
- `prompts/brief.md` — haiku: minimal, commands-only

Each variant prompt file contains the model-specific instructions that the skill body references.

### Step 7: Update the manifest

Add a row to `shared/manifest.md` in the Skills table:

```markdown
| `<skill-name>` | One-line description | `shared/skills/<skill-name>/SKILL.md` |
```

### Step 8: Validate

Run validation to ensure the skill passes all contracts:

```bash
node scripts/lint/skill.mjs shared/skills/<skill-name>/SKILL.md
node scripts/build/compile.mjs --validate-only
```

### Quality checklist

Before considering the skill complete, verify:

- [ ] Skill name is kebab-case
- [ ] `description` is a single clear sentence
- [ ] `type` is one of: prompt, hook, agent, workflow-blueprint
- [ ] `status` is set (use `stable` for production-ready, `experimental` for new)
- [ ] `capabilities.required` lists only truly essential capabilities
- [ ] `capabilities.fallback_mode` is set if required capabilities exist
- [ ] `version` follows semver (start at "1.0.0")
- [ ] At least 2 tests defined in frontmatter
- [ ] Body has all required sections: capability contract, when to use, instructions, examples
- [ ] Manifest row added to `shared/manifest.md`
- [ ] Linter passes: `node scripts/lint/skill.mjs`
- [ ] Invocation control set appropriately (if skill has side effects or is background knowledge)
- [ ] `context: fork` used only when skill has explicit task instructions (not guidelines)
- [ ] Dynamic context commands (`` !`cmd` ``) tested and functional
- [ ] `allowed-tools` restricts to minimum necessary (if applicable)
- [ ] Hook events and matchers configured correctly (for hook-type skills)
- [ ] `argument-hint` set if skill accepts arguments

## Examples

### Example 1: Simple prompt skill
**Input:** "Create a skill called 'summarize-pr' that summarizes pull request changes"

**Output:**
```
Created: shared/skills/summarize-pr/SKILL.md
  - Type: prompt
  - Capabilities: optional git.read
  - Fallback: prompt-only (user can paste diff)
  - Variants: opus (detailed analysis), sonnet (balanced), haiku (one-liner)
  - Tests: 2 prompt-validation tests

Updated: shared/manifest.md
  + | `summarize-pr` | Summarize pull request changes ... | `shared/skills/summarize-pr/SKILL.md` |
```

### Example 2: Hook skill with lifecycle events
**Input:** "Create a hook skill called 'pre-push-lint' that runs linting before git push"

**Output:**
```
Created: shared/skills/pre-push-lint/SKILL.md
  - Type: hook
  - Capabilities: required shell.exec, git.read
  - Fallback: none (requires shell to lint)
  - Hook event: PreToolUse (matcher: "Bash")
  - Hook type: command
  - Exit 0 = proceed, Exit 2 = block push with lint errors
  - Tests: 2 tests (lint pass, lint fail scenarios)
```

### Example 3: Subagent skill with dynamic context
**Input:** "Create a skill called 'deep-research' that researches a topic in the codebase using an Explore subagent"

**Output:**
```yaml
# Generated frontmatter includes:
context: fork
agent: Explore
```
```markdown
# Body uses dynamic context and argument substitution:
## Current codebase state
- Files matching topic: !`find . -name "*.ts" | head -20`

## Your task
Research $ARGUMENTS thoroughly:
1. Find relevant files using Glob and Grep
2. Read and analyze the code
3. Summarize findings with specific file references
```

### Example 4: User-only skill with tool restrictions
**Input:** "Create a skill called 'deploy-staging' that deploys to staging — only the user should invoke it, and it should only use Bash"

**Output:**
```yaml
# Generated frontmatter includes:
disable-model-invocation: true
allowed-tools: Bash
argument-hint: "[environment]"
```

### Example 5: Model-only background knowledge skill
**Input:** "Create a skill that teaches Claude our API conventions but isn't a command"

**Output:**
```yaml
# Generated frontmatter includes:
user-invocable: false
# Description is always in context so Claude applies these conventions
# No subagent (guidelines need conversation context)
```
