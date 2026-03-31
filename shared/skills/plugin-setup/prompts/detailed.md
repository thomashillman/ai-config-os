# Detailed Plugin Setup Guide (Opus)

You are an expert in the Claude Code skill creation workflow, familiar with all steps and common pitfalls.

## Your task

Provide complete step-by-step guidance for creating a new skill, including:

1. **Full workflow** with all commands and file locations
2. **Phase 2 frontmatter explanation** — what each field means
3. **Troubleshooting** for common issues
4. **Version discipline** — when to bump major/minor/patch
5. **File anatomy** — directory structure and symlink rules

## Output format

```
## Creating a New Skill: [skill-name]

### Step 1: Run scaffold
[command and explanation]

### Step 2: Edit SKILL.md
[frontmatter fields and what they mean]

### Step 3: Add prompts (if multi-model)
[directory structure and variant guidance]

### Step 4: Update manifest
[manifest table entry]

### Step 5: Bump version
[version change rationale]

### Step 6: Validate
[validation commands]

## Troubleshooting
[Common issues and solutions]

## Version discipline
[Major/minor/patch guidance]
```

## Full Guide

### Step 1: Run the scaffold script

```bash
ops/new-skill.sh <skill-name>
```

This single command:

- Creates `shared/skills/<skill-name>/` with SKILL.md from Phase 2 template
- Creates the symlink `plugins/core-skills/skills/<skill-name>` → `../../../shared/skills/<skill-name>`
- Bumps the patch version in `plugins/core-skills/.claude-plugin/plugin.json`

### Step 2: Edit shared/skills/<skill-name>/SKILL.md

Fill in the YAML frontmatter (between `---` markers):

**Required fields:**

- `skill:` — kebab-case name (e.g., "web-search", "commit-conventions")
- `description:` — one sentence; one paragraph context max
- `type:` — "prompt", "hook", "agent", or "workflow-blueprint"
- `status:` — "stable", "experimental", or "deprecated"
- `inputs:` — array of input definitions (can be empty [])
- `outputs:` — array of output definitions (can be empty [])
- `dependencies:` — object with skills, apis, models arrays
- `version:` — semantic version string (e.g., "1.0.0")
- `changelog:` — object mapping versions to descriptions

**Optional but recommended:**

- `variants:` — multi-model variant definitions (opus/sonnet/haiku)
- `tests:` — array of test definitions
- `examples:` — array of input/output examples
- `docs:` — documentation generation config
- `monitoring:` — metrics tracking config
- `tags:` — array of category tags

**Body content (after closing `---`):**

- `# [skill-name]` — title matching the skill name
- `## When to use` — use cases
- `## Instructions` — detailed guidance or reference material
- `## Examples` — concrete examples

**Never edit files inside `plugins/` directly** — they are symlinks pointing to `shared/skills/`.

### Step 3: Create variant prompts (optional but recommended)

If your skill uses variants (Opus/Sonnet/Haiku), create:

```
shared/skills/<skill-name>/prompts/
├── detailed.md   ← used when variant: opus is selected
├── balanced.md   ← used when variant: sonnet is selected
└── brief.md      ← used when variant: haiku is selected
```

**Variant guidance:**

- **Opus (detailed.md)**: Comprehensive, includes rationale and edge cases. 3x cost, ~800ms latency.
- **Sonnet (balanced.md)**: Standard; balanced depth and speed. 1x cost, ~300ms latency. (default fallback)
- **Haiku (brief.md)**: Minimal, bullet points only. 0.3x cost, ~150ms latency.

**Fallback chain** (recommended):

```yaml
fallback_chain:
  - sonnet
  - haiku
  - opus
```

This tries Sonnet first, falls back to Haiku if Sonnet unavailable, then Opus.

### Step 4: Update shared/manifest.md

Add a row to the Skills table:

```markdown
| `<skill-name>` | One-line description | `shared/skills/<skill-name>/SKILL.md` |
```

Example:

```markdown
| `web-search` | Search the web for current information and synthesize results | `shared/skills/web-search/SKILL.md` |
```

### Step 5: Bump the plugin version

The scaffold script performs a **patch** bump. Decide if you need **minor** instead:

- **Patch (0.2.3 → 0.2.4)**: For skill content changes, bug fixes, documentation updates
- **Minor (0.2.3 → 0.3.0)**: For new skills (introduces new capability)
- **Major**: Reserved for breaking changes (rare)

Edit `plugins/core-skills/.claude-plugin/plugin.json` and update the `version` field.

### Step 6: Validate and test

```bash
adapters/claude/dev-test.sh
```

This runs:

1. `ops/validate-dependencies.sh` — checks skill dependencies
2. `ops/validate-variants.sh` — validates variant definitions
3. `claude plugin validate .` — checks plugin marketplace structure
4. `claude --plugin-dir ./plugins/core-skills -p "List available skills"` — live plugin test

All four steps must pass (zero `[ERROR]` lines).

## File anatomy

```
shared/skills/<name>/
├── SKILL.md                ← canonical source; edit here
├── prompts/                ← optional; multi-model variant files
│   ├── detailed.md         ← opus variant (comprehensive)
│   ├── balanced.md         ← sonnet variant (standard, default)
│   └── brief.md            ← haiku variant (minimal)
└── README.md               ← auto-generated if docs.auto_generate_readme: true

plugins/core-skills/skills/<name>
└── [symlink → ../../../shared/skills/<name>]
```

**Key rule:** Edit only in `shared/skills/<name>/`. The `plugins/` directory is symlinks; edits there are lost on sync.

## Troubleshooting

### Broken symlink (red entry in `ls -la`)

**Problem:** `ls -la plugins/core-skills/skills/` shows red or "cannot access"

**Solution:**

```bash
# Remove and recreate
rm plugins/core-skills/skills/<name>
ln -s ../../../shared/skills/<name> plugins/core-skills/skills/<name>
```

**Verify:** `readlink -f plugins/core-skills/skills/<name>` should resolve to the absolute path of `shared/skills/<name>`.

### Plugin validation fails

**Problem:** `claude plugin validate .` exits non-zero

**Checklist:**

1. Check SKILL.md has `---` delimiters and valid YAML frontmatter
2. Check `variant.prompt_file` paths exist (if variants declared)
3. Check skill name in frontmatter matches directory name
4. Run `ops/validate-dependencies.sh` manually to see detailed errors
5. Check the symlink resolves: `readlink plugins/core-skills/skills/<name>`

### Live plugin test fails

**Problem:** `claude --plugin-dir ./plugins/core-skills -p "List available skills"` exits non-zero

**Cause:** Plugin structure is valid but the Claude CLI can't communicate with the plugin.

**Troubleshooting:**

1. Ensure Claude Code is up-to-date: `claude --version`
2. Check if the plugin loads: `claude plugin list`
3. Try again with a fresh session

### Symlink on different device not recognized

**Problem:** Created the skill on one device; another device doesn't see it

**Solution:**

1. Ensure you committed and pushed the branch
2. On the other device: `git fetch origin <branch>` then `git checkout <branch>`
3. Verify symlinks resolved: `ls -la plugins/core-skills/skills/`
4. Restart Claude Code (auto-update enabled) or run `claude plugin update core-skills@ai-config-os`

## Version discipline

**When to bump:**

| Trigger                           | Bump  | Example       |
| --------------------------------- | ----- | ------------- |
| New skill added                   | Minor | 0.2.3 → 0.3.0 |
| Skill content/frontmatter changed | Patch | 0.3.0 → 0.3.1 |
| Variant prompt files updated      | Patch | 0.3.1 → 0.3.2 |
| Bug fix (symlink, manifest)       | Patch | 0.3.2 → 0.3.3 |
| Breaking change (rare)            | Major | 0.3.3 → 1.0.0 |

**Always update `plugins/core-skills/.claude-plugin/plugin.json` before committing.**
