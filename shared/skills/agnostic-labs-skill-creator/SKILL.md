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
  - name: user_invocable
    type: string
    description: "Whether the skill appears in the slash-command menu (default: true)"
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
7. **Whether it's user-invocable** — appears in `/` menu (default: true)
8. **Dependencies** — other skills, APIs, or models required

### Step 3: Create the skill directory

```bash
mkdir -p shared/skills/<skill-name>/prompts
```

### Step 4: Generate SKILL.md

Create `shared/skills/<skill-name>/SKILL.md` with complete Phase 2 frontmatter:

**Required frontmatter fields** (schema-enforced):
- `skill` — kebab-case name
- `description` — one sentence + optional paragraph
- `type` — prompt | hook | agent | workflow-blueprint
- `status` — stable | experimental | deprecated
- `version` — semver (start at "1.0.0")
- `capabilities` — with `required`, `optional`, `fallback_mode`

**Recommended frontmatter fields:**
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

**Body sections** (after frontmatter):
1. `# <skill-name>` — heading matching the skill name
2. One-line summary + context paragraph
3. `## Capability contract` — declare minimum capabilities
4. `## When to use` — trigger conditions
5. `## Instructions` — the actual instructions Claude follows
6. `## Examples` — concrete input/output examples

### Step 5: Create variant prompt files (if multi-model)

Create three prompt files in `prompts/`:
- `prompts/detailed.md` — opus: thorough, nuanced, handles edge cases
- `prompts/balanced.md` — sonnet: clear, complete, efficient
- `prompts/brief.md` — haiku: minimal, commands-only

Each variant prompt file contains the model-specific instructions that the skill body references.

### Step 6: Update the manifest

Add a row to `shared/manifest.md` in the Skills table:

```markdown
| `<skill-name>` | One-line description | `shared/skills/<skill-name>/SKILL.md` |
```

### Step 7: Validate

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
- [ ] Body has all four sections: capability contract, when to use, instructions, examples
- [ ] Manifest row added to `shared/manifest.md`
- [ ] Linter passes: `node scripts/lint/skill.mjs`

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

### Example 2: Hook skill
**Input:** "Create a hook skill called 'pre-push-lint' that runs linting before git push"

**Output:**
```
Created: shared/skills/pre-push-lint/SKILL.md
  - Type: hook
  - Capabilities: required shell.exec, git.read
  - Fallback: none (requires shell to lint)
  - Event: PreToolUse (git push)
  - Tests: 2 tests (lint pass, lint fail scenarios)

Updated: shared/manifest.md
  + | `pre-push-lint` | Run linting before git push | `shared/skills/pre-push-lint/SKILL.md` |
```
