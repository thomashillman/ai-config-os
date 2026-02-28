---
# Identity & Description
skill: plugin-setup
description: |
  Step-by-step guidance for creating and registering a new skill in this repo's Claude Code plugin.
  Use when adding a new skill, troubleshooting a broken symlink, or explaining the skill authoring workflow.

# Type & Status
type: prompt
status: stable

# Feature 1: Dependencies & Metadata
inputs:
  - name: skill_name
    type: string
    description: The kebab-case name for the new skill (e.g. "web-search", "commit-conventions")
    required: false

outputs:
  - name: setup_steps
    type: string
    description: The complete set of commands and edits needed to create and register the skill

dependencies:
  skills: []
  apis: []
  models:
    - sonnet

examples:
  - input: "How do I add a new skill called 'code-review'?"
    output: "Run: ops/new-skill.sh code-review\nThen edit shared/skills/code-review/SKILL.md\nUpdate shared/manifest.md\nBump plugin.json version (minor for new skill)\nRun adapters/claude/dev-test.sh"
    expected_model: sonnet
  - input: "What are the key rules for skill authoring?"
    output: "Author in shared/skills/ only, use relative symlinks, bump version on every change."
    expected_model: haiku

# Feature 2: Multi-Model Variants
variants:
  opus:
    prompt_file: prompts/detailed.md
    description: Full walkthrough including troubleshooting, Phase 2 frontmatter explanation, and version discipline rationale
    cost_factor: 3.0
    latency_baseline_ms: 900
  sonnet:
    prompt_file: prompts/balanced.md
    description: Default; returns all steps clearly with commands and post-script checklist
    cost_factor: 1.0
    latency_baseline_ms: 350
  haiku:
    prompt_file: prompts/brief.md
    description: Returns commands only, no explanation
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain:
    - sonnet
    - haiku
    - opus

# Feature 3: Skill Testing
tests:
  - id: test-new-skill-command
    type: prompt-validation
    input: "How do I create a new skill?"
    expected_substring: "new-skill.sh"
    models_to_test:
      - sonnet
  - id: test-symlink-rule
    type: prompt-validation
    input: "Where do I author skill files?"
    expected_substring: "shared/skills"
    models_to_test:
      - haiku
  - id: test-version-bump
    type: prompt-validation
    input: "Do I need to bump the version when adding a skill?"
    expected_substring: "version"
    models_to_test:
      - sonnet

# Feature 5: Auto-Generated Documentation
docs:
  auto_generate_readme: true
  sections_to_include:
    - description
    - inputs
    - outputs
    - examples

# Feature 6: Performance Monitoring
monitoring:
  enabled: true
  track_metrics:
    - latency
    - token_count
    - cost
    - variant_selected
  alert_threshold_latency_ms: 1500
  public_metrics: false

version: "1.0.0"
changelog:
  "1.0.0": "Initial release"

tags:
  - workflow
  - plugin
  - core
---

# plugin-setup

Step-by-step guidance for creating and registering a new skill in this repo's Claude Code plugin.

## When to use

- When adding a brand-new skill to the repo
- When explaining how the skill authoring workflow works
- When troubleshooting broken symlinks or missing manifest entries
- When onboarding a new device or development session

## Workflow

### 1. Run the scaffold script

```bash
ops/new-skill.sh <skill-name>
```

This single command:
- Creates `shared/skills/<skill-name>/SKILL.md` from the Phase 2 template
- Creates the symlink `plugins/core-skills/skills/<skill-name>` → `../../../shared/skills/<skill-name>`
- Bumps the plugin patch version in `plugins/core-skills/.claude-plugin/plugin.json`

### 2. Edit the SKILL.md

Open `shared/skills/<skill-name>/SKILL.md` and fill in:
- YAML frontmatter: `description`, `inputs`, `outputs`, `variants`, `tests`, `version`
- Body: `## When to use`, `## Instructions`, `## Examples`

**Never edit files inside `plugins/` directly** — they are symlinks; edit in `shared/skills/` only.

### 3. Update the manifest

Add a row to `shared/manifest.md` Skills table:

```markdown
| `<skill-name>` | One-line description | `shared/skills/<skill-name>/SKILL.md` |
```

### 4. Bump the plugin version (minor for new skills)

The scaffold script does a patch bump. For a new skill, do a **minor** bump instead:

```bash
# Edit plugins/core-skills/.claude-plugin/plugin.json
# e.g. 0.2.3 → 0.3.0
```

### 5. Validate and test

```bash
adapters/claude/dev-test.sh
```

This runs `claude plugin validate .` and confirms the plugin loads correctly.

## Key rules

| Rule | Detail |
|---|---|
| Author location | `shared/skills/<name>/SKILL.md` — never inside `plugins/` |
| Symlink format | Relative path: `../../../shared/skills/<name>` |
| Version bump | Patch for content edits; **minor for new skills** |
| Template | Start from `shared/skills/_template/SKILL.md` (Phase 2 frontmatter) |
| Naming | kebab-case only (e.g. `web-search`, `commit-conventions`) |

## File anatomy

```
shared/skills/<name>/
├── SKILL.md          ← canonical source (edit here)
└── prompts/          ← optional; variant-specific prompt files
    ├── detailed.md   ← used by opus variant
    ├── balanced.md   ← used by sonnet variant
    └── brief.md      ← used by haiku variant

plugins/core-skills/skills/<name>  ← symlink (do not edit)
```

## Troubleshooting

**Broken symlink** (`ls -la plugins/core-skills/skills/` shows red entry):
```bash
# Remove and recreate
rm plugins/core-skills/skills/<name>
ln -s ../../../shared/skills/<name> plugins/core-skills/skills/<name>
```

**Plugin validate fails after adding skill:**
- Check the symlink resolves: `readlink -f plugins/core-skills/skills/<name>`
- Check SKILL.md has valid YAML frontmatter (the `---` delimiters must be present)
- Re-run `adapters/claude/dev-test.sh`

**Version not picked up on other device:**
- Ensure you bumped the version in `plugin.json` and committed it
- On the other device: restart Claude Code (auto-update enabled) or run `claude plugin update core-skills@ai-config-os`
