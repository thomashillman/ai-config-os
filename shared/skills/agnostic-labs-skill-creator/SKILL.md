---
skill: agnostic-labs-skill-creator
description: |
  Skill development environment: scaffold new skills, iterate on existing ones, validate against contracts, and ship to distribution.
  Use when creating a skill from scratch, refining an in-progress skill, debugging lint/build failures, or preparing a skill for release.
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
  fallback_notes: "Can output complete SKILL.md content for the user to paste manually when filesystem access is unavailable."

platforms: {}

inputs:
  - name: skill_name
    type: string
    description: "Kebab-case name for the skill (e.g. 'my-new-skill'). Required for create mode."
    required: false
  - name: mode
    type: string
    description: "Operating mode: create (default), iterate, validate, ship. Inferred from context if not specified."
    required: false
  - name: skill_description
    type: string
    description: "One-sentence description of what the skill does and when to use it"
    required: false
  - name: skill_type
    type: string
    description: "Skill type: prompt (default), hook, agent, or workflow-blueprint"
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
    description: "Run in isolated subagent: 'none' (default), 'fork' (context: fork). Optionally specify agent type."
    required: false
  - name: dynamic_context
    type: string
    description: "Shell commands to inject as dynamic context using !`command` syntax"
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
    description: "Path to the created or modified skill directory"
  - name: skill_md
    type: string
    description: "The generated or updated SKILL.md content"
  - name: validation_result
    type: string
    description: "Lint and build validation output"

dependencies:
  skills: []
  apis: []
  models:
    - sonnet

examples:
  - input: "Create a skill called 'api-monitor' that watches API endpoints for downtime"
    output: |
      Created shared/skills/api-monitor/ with SKILL.md, prompts/, manifest entry.
      Lint: OK. Build: OK.
    expected_model: sonnet
  - input: "The lint says my skill is missing fallback_mode — fix it"
    output: |
      Read shared/skills/api-monitor/SKILL.md → capabilities block missing fallback_mode.
      Added fallback_mode: prompt-only. Re-lint: OK.
    expected_model: sonnet
  - input: "Ship the api-monitor skill"
    output: |
      Validated: lint OK, compile OK, delivery contract OK.
      Manifest up to date. Ready to commit.
    expected_model: sonnet

variants:
  opus:
    prompt_file: prompts/detailed.md
    description: >
      Use for CREATE mode with hook-type or agent-type skills, complex capability contracts,
      or when the user's request is ambiguous and requires design judgment. Also use for
      ITERATE on architectural issues (wrong fallback strategy, capability misclassification).
      Overkill for simple prompt skills or VALIDATE/SHIP modes.
    cost_factor: 3.0
    latency_baseline_ms: 1200
  sonnet:
    prompt_file: prompts/balanced.md
    description: >
      Default for most work. Handles CREATE for prompt-type skills, all ITERATE fixes,
      and full SHIP workflows. Sufficient for capability contract design on straightforward
      skills. Falls short on nuanced hook lifecycle design or multi-skill composition.
    cost_factor: 1.0
    latency_baseline_ms: 400
  haiku:
    prompt_file: prompts/brief.md
    description: >
      Use for VALIDATE mode (just running commands and reporting results), SHIP mode
      (checklist execution), and simple ITERATE fixes (add a missing field, fix a path).
      Not suitable for CREATE mode — lacks the judgment to design good capability contracts.
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain:
    - opus
    - sonnet
    - haiku

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
  - id: test-iterate-mode
    type: prompt-validation
    input: "Fix the lint errors in my skill"
    expected_substring: "lint"
    models_to_test:
      - sonnet

composition:
  personas:
    - name: "skill-author"
      description: "Skill authoring and maintenance persona"
      skills:
        - "agnostic-labs-skill-creator"
        - "plugin-setup"
        - "skill-audit"

docs:
  auto_generate_readme: true
  sections_to_include:
    - description
    - inputs
    - outputs
    - examples
  help_text: "Create, iterate, validate, and ship skills conforming to the Agent Skills open standard."
  keywords:
    - skill-creation
    - scaffold
    - generator
    - authoring
    - agent-skills
    - iterate
    - validate

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
  "1.0.0": "Initial release — scaffold + iterate + validate + ship lifecycle"

tags:
  - authoring
  - workflow
  - core
---

# agnostic-labs-skill-creator

Skill development environment for the Agent Skills open standard. Scaffolds new skills, iterates on in-progress ones, validates against repo contracts, and prepares skills for distribution.

Unlike a one-shot scaffolder, this skill treats skill authoring as iterative development — the same way you'd build any feature in Claude Code. Create the skeleton, try it, fix what the linter catches, refine the prompts, validate the build, ship it.

## Capability contract

Requires filesystem access to create/modify skill directories and write SKILL.md files. Requires shell access to run the scaffold script, linter, and compiler. Falls back to prompt-only mode: outputs complete SKILL.md content for the user to paste manually.

Available capabilities: `fs.read`, `fs.write`, `shell.exec`, `shell.long-running`,
`git.read`, `git.write`, `network.http`, `browser.fetch`, `mcp.client`, `env.read`,
`secrets.inject`, `ui.prompt-only`.

## When to use

- Creating a new skill from scratch ("create a skill that does X")
- Fixing lint or build errors on an existing skill ("the linter says X is missing")
- Refining a skill's capability contract, prompts, or tests ("tighten the capability requirements")
- Preparing a skill for release ("validate and ship this skill")
- Understanding why a skill isn't working on a particular platform ("why doesn't this skill show up on cursor?")

## Model routing

The quality of the outcome depends heavily on matching model to task. This skill's four modes have different complexity profiles:

| Mode | Complexity driver | Best model | Acceptable | Avoid |
|------|------------------|------------|------------|-------|
| **CREATE** hook/agent skill | Hook lifecycle design, capability contract judgment, subagent architecture | **opus** | sonnet (with iteration) | haiku |
| **CREATE** prompt skill | Straightforward template fill with sensible defaults | **sonnet** | opus (overkill but safe) | haiku |
| **ITERATE** architectural | Capability misclassification, wrong fallback strategy, platform compatibility | **opus** | sonnet | haiku |
| **ITERATE** mechanical | Add missing field, fix path, adjust value | **sonnet** | haiku | — |
| **VALIDATE** | Run commands, report results | **haiku** | sonnet | opus (waste) |
| **SHIP** | Checklist execution | **haiku** | sonnet | opus (waste) |

**Key insight:** CREATE mode for non-trivial skills (hooks, agents, complex capability contracts) is where model choice matters most. The design decisions — which capabilities to require vs make optional, whether to fork into a subagent, how to structure hook communication — require judgment that cheaper models lack. A sonnet-created hook skill will often need multiple iterate cycles that an opus creation would have gotten right the first time.

**Fallback chain rationale:** `opus → sonnet → haiku`. The dominant use case (creating and iterating on skills) benefits from stronger reasoning. For pure validation/shipping, the cost difference is negligible because those modes are fast.

## Instructions

### Mode detection

Determine the operating mode from context. Do not ask — infer:

| Signal | Mode |
|--------|------|
| "Create a skill…", "new skill…", skill name that doesn't exist | **create** |
| "Fix…", "update…", "change…", lint errors, an existing skill path | **iterate** |
| "Validate…", "check…", "does this pass…", "lint…" | **validate** |
| "Ship…", "release…", "is this ready…", "compile…" | **ship** |

Multiple modes can chain in a single session: create → validate → iterate → validate → ship.

---

### CREATE mode

#### Step 1: Validate the skill name

Must match `^[a-z][a-z0-9-]*$`. If the user provides `MySkill` or `my_skill`, suggest the corrected form and confirm.

Check `shared/skills/` for naming conflicts.

#### Step 2: Gather requirements

Infer from the user's request — do not interrogate. Fill gaps with sensible defaults:

1. **Name** (required) — kebab-case
2. **Description** (required) — one sentence: what + when
3. **Type** — `prompt` (default), `hook`, `agent`, `workflow-blueprint`
4. **Required capabilities** — only what the skill cannot function without
5. **Optional capabilities** — what enhances but isn't essential
6. **Fallback mode** — `prompt-only` (default), `manual`, `none`

Claude Code extensions (apply only when relevant):
7. **Invocation control** — side-effect skills → `disable-model-invocation: true`; background knowledge → `user-invocable: false`
8. **Subagent** — `context: fork` + agent type for isolated research (never for guidelines)
9. **Dynamic context** — `` !`command` `` for runtime data injection
10. **Tool restrictions** — `allowed-tools` for read-only or limited skills
11. **Hook config** — event, matcher, type, exit codes (hook-type only)
12. **Arguments** — `$ARGUMENTS`, `argument-hint` if skill takes parameters

#### Step 3: Create the skill

```bash
node scripts/build/new-skill.mjs <skill-name>
```

This creates the directory, writes a template SKILL.md, updates `shared/manifest.md`, and creates a convenience symlink (Unix). Then **replace** the template content with the real skill content.

If the scaffold script is unavailable:
```bash
mkdir -p shared/skills/<skill-name>/prompts
```

#### Step 4: Write SKILL.md

Generate complete Phase 2 frontmatter and all body sections. See the variant prompt for format details.

**Required frontmatter:** `skill`, `description`, `type`, `status`, `version`, `capabilities`
**Required body sections:** `# <name>`, `## Capability contract`, `## When to use`, `## Instructions`, `## Examples`

#### Step 5: Write variant prompts

Create three files in `prompts/`:
- `detailed.md` — opus: thorough, handles edge cases, explains rationale
- `balanced.md` — sonnet: clear, complete, efficient
- `brief.md` — haiku: minimal, commands-only

Each variant should contain model-appropriate instructions for the skill's task — not a copy of the SKILL.md body.

#### Step 6: Validate immediately

Run lint and build validation right after creating:

```bash
node scripts/lint/skill.mjs shared/skills/<skill-name>/SKILL.md
node scripts/build/compile.mjs --validate-only
```

If either fails → enter **iterate** mode to fix the issues. Do not leave a broken skill for the user to debug.

---

### ITERATE mode

Work on an existing skill. Read the current state, understand the problem, fix it.

#### Step 1: Read current state

```bash
# Read the skill
cat shared/skills/<skill-name>/SKILL.md

# Check lint status
node scripts/lint/skill.mjs shared/skills/<skill-name>/SKILL.md

# Check build status
node scripts/build/compile.mjs --validate-only
```

#### Step 2: Diagnose

Common issues and fixes:

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| `missing fallback_mode` | `capabilities.required` is non-empty but no fallback_mode | Add `fallback_mode: prompt-only` (or `manual`/`none`) |
| `missing required field` | Schema requires `skill`, `description`, `type`, `status`, `version` | Add the missing field |
| `platform warning` | Platform has `unknown` for a required capability | Expected for unverified platforms — not an error |
| Skill doesn't appear in `/` menu | `user-invocable: false` or not compiled | Check frontmatter; run compiler |
| Skill triggers unexpectedly | Missing `disable-model-invocation: true` | Add it for side-effect skills |
| Variant prompt not found | `prompt_file` path wrong or file missing | Create the file or fix the path |
| `context: fork` skill produces no output | Skill body is guidelines, not a task | Remove `context: fork` |
| Dynamic context empty | `` !`command` `` failed silently | Test the command in shell |

#### Step 3: Apply fixes

Edit the SKILL.md (or prompt files) to fix the issue. Use the Edit tool for surgical changes.

#### Step 4: Re-validate

Run lint and build again. Repeat until clean.

---

### VALIDATE mode

Run the full validation pipeline and report results.

```bash
# 1. Lint the specific skill
node scripts/lint/skill.mjs shared/skills/<skill-name>/SKILL.md

# 2. Full build validation (all skills)
node scripts/build/compile.mjs --validate-only

# 3. Delivery contract tests (if applicable)
npm test -- scripts/build/test/delivery-contract.test.mjs
```

Report: pass/fail for each stage, with specific errors and suggested fixes.

---

### SHIP mode

Prepare a skill for distribution.

#### Step 1: Validate (run validate mode first)

All three checks must pass: lint, build, delivery contract.

#### Step 2: Verify manifest

Check `shared/manifest.md` has a correct row for the skill. If missing, add it.

#### Step 3: Compile

```bash
node scripts/build/compile.mjs
```

Verify the skill appears in:
- `dist/clients/claude-code/skills/<skill-name>/SKILL.md`
- `dist/registry/index.json`

#### Step 4: Report readiness

```
Ship checklist:
  ✓ Lint passes
  ✓ Build passes
  ✓ Delivery contract passes
  ✓ Manifest entry present
  ✓ Compiled to dist/
  → Ready to commit
```

---

### Claude Code extension reference

These features are Claude Code-specific (ignored by other Agent Skills consumers).

#### Invocation control

| Scenario | Frontmatter | Context loading |
|----------|-------------|-----------------|
| General tool (default) | — | Description always in context |
| Side-effect ops (deploy, commit) | `disable-model-invocation: true` | Description NOT in context |
| Background knowledge | `user-invocable: false` | Description always in context |

#### Subagent execution

Add `context: fork` + `agent: Explore|Plan|general-purpose` for isolated tasks.

**Use:** broad research, explicit task deliverables, self-contained analysis.
**Don't use:** guidelines, conventions, anything needing conversation context.

#### Dynamic context

`` !`command` `` runs before the prompt is sent. Output replaces the placeholder.

```markdown
## Current state
- Branch: !`git branch --show-current`
- Status: !`git status --short`
```

#### Tool restrictions

`allowed-tools: Read, Grep, Glob` — limits which tools Claude can use.

#### Arguments

`$ARGUMENTS`, `$0`, `$1` for user-passed params. Set `argument-hint` for autocomplete.

#### Hooks (hook-type skills)

Events: `SessionStart`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `Stop`, `ConfigChange`.
Types: `command`, `http`, `prompt`, `agent`.
Exit 0 = proceed, Exit 2 = block with stderr feedback.

#### Skill location

| Scope | Path |
|-------|------|
| Personal | `~/.claude/skills/<name>/SKILL.md` |
| Project | `.claude/skills/<name>/SKILL.md` |
| Plugin | `<plugin>/skills/<name>/SKILL.md` |
| This repo | `shared/skills/<name>/SKILL.md` → compiled to `dist/` |

### Quality checklist

Before considering any mode complete:

- [ ] Skill name is kebab-case
- [ ] `description` is a single clear sentence
- [ ] `type`, `status`, `version` are set
- [ ] `capabilities.required` lists only truly essential capabilities
- [ ] `capabilities.fallback_mode` is set when required capabilities exist
- [ ] At least 2 tests defined in frontmatter
- [ ] Body has all required sections
- [ ] Manifest row present in `shared/manifest.md`
- [ ] Linter passes
- [ ] Build passes (`--validate-only`)

## Examples

### Example 1: Create → validate → iterate → ship in one session

**User:** "Create a skill called 'summarize-pr' that summarizes pull request changes"

**Flow:**
1. **CREATE** — scaffold, write SKILL.md + prompts, update manifest
2. **VALIDATE** — lint finds `fallback_mode` missing
3. **ITERATE** — add `fallback_mode: prompt-only`, re-lint → OK
4. **SHIP** — compile, verify dist/, report ready

### Example 2: Fix a broken skill

**User:** "The build says my-skill has a missing prompt file"

**Flow:**
1. **ITERATE** — read SKILL.md, find `variants.opus.prompt_file: prompts/detailed.md` but file doesn't exist
2. Create `prompts/detailed.md` with appropriate opus-level content
3. **VALIDATE** — lint OK, build OK

### Example 3: Refine capability contract

**User:** "Make api-monitor work on cursor too"

**Flow:**
1. **ITERATE** — read SKILL.md, check platform definitions for cursor
2. Cursor doesn't support `shell.exec` → move from required to optional
3. Add `fallback_mode: manual` with notes about manual execution
4. **VALIDATE** — lint OK, build OK, cursor now included in compatibility matrix
