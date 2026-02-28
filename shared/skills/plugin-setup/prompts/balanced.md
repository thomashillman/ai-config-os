# Standard Plugin Setup Guide (Sonnet)

You are familiar with the Claude Code skill creation workflow.

## Your task

Provide clear step-by-step guidance for creating and registering a new skill.

## Workflow

### Step 1: Scaffold
```bash
ops/new-skill.sh <skill-name>
```
Creates directory, symlink, and bumps patch version.

### Step 2: Edit SKILL.md
Open `shared/skills/<skill-name>/SKILL.md` and fill in:
- **Frontmatter:** `description`, `type` (prompt/hook/agent/workflow-blueprint), `status`, `inputs`, `outputs`, `dependencies`, `version`
- **Body:** `## When to use`, `## Instructions`, `## Examples`

**Rule:** Always edit in `shared/skills/`, never in `plugins/` (they are symlinks).

### Step 3: Create variant prompts (optional)
If your skill has multi-model variants:
```
shared/skills/<skill-name>/prompts/
├── detailed.md   ← opus (comprehensive, 3x cost)
├── balanced.md   ← sonnet (standard, 1x cost, default)
└── brief.md      ← haiku (minimal, 0.3x cost)
```

### Step 4: Update manifest
Add a row to `shared/manifest.md` Skills table:
```markdown
| `<skill-name>` | One-line description | `shared/skills/<skill-name>/SKILL.md` |
```

### Step 5: Bump version
Edit `plugins/core-skills/.claude-plugin/plugin.json`:
- **Patch bump** (0.2.3 → 0.2.4) — for skill content changes
- **Minor bump** (0.2.3 → 0.3.0) — for new skills

### Step 6: Validate
```bash
adapters/claude/dev-test.sh
```
Must show zero `[ERROR]` lines and all validations passing.

## Key rules

| Rule | Detail |
|------|--------|
| **Author location** | `shared/skills/<name>/SKILL.md` only (edit here) |
| **Symlink format** | Relative: `../../../shared/skills/<name>` |
| **Version bump** | Patch for content; minor for new skills |
| **Naming** | kebab-case: `web-search`, `commit-conventions` |
| **Variants** | opus (detailed), sonnet (balanced), haiku (brief) |

## Common issues

**Broken symlink** (red in `ls -la`):
```bash
rm plugins/core-skills/skills/<name>
ln -s ../../../shared/skills/<name> plugins/core-skills/skills/<name>
```

**Plugin validate fails:**
- Check SKILL.md has `---` delimiters
- Check `variant.prompt_file` paths exist
- Run `ops/validate-dependencies.sh` for details

**Not appearing on other device:**
- Commit and push the branch
- On other device: `git fetch origin <branch>` then checkout
- Restart Claude Code or run `claude plugin update core-skills@ai-config-os`

## Fallback chain (recommended)

```yaml
variants:
  opus:
    prompt_file: prompts/detailed.md
  sonnet:
    prompt_file: prompts/balanced.md
  haiku:
    prompt_file: prompts/brief.md
  fallback_chain:
    - sonnet
    - haiku
    - opus
```

Tries Sonnet first, falls back to Haiku, then Opus if unavailable.
