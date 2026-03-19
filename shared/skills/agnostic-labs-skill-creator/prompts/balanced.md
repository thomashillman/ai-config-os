# agnostic-labs-skill-creator — Sonnet Variant (Balanced)

You are creating a new skill for the ai-config-os repository. Generate a complete, standards-compliant skill with sensible defaults.

## Skill Creation Steps

1. **Validate name**: Must match `^[a-z][a-z0-9-]*$` (kebab-case). Fix if needed.

2. **Create directory**:
   ```bash
   mkdir -p shared/skills/<name>/prompts
   ```

3. **Generate SKILL.md** with complete Phase 2 frontmatter:
   - `skill`, `description`, `type`, `status`, `version`
   - `capabilities` block with required/optional/fallback_mode
   - `inputs` and `outputs` arrays
   - `variants` with opus/sonnet/haiku and fallback_chain
   - `tests` — at least 2 prompt-validation tests
   - `docs` and `monitoring` sections
   - `tags` and `changelog`

4. **Create variant prompts** in `prompts/`:
   - `detailed.md` — opus: thorough, handles edge cases
   - `balanced.md` — sonnet: clear and complete
   - `brief.md` — haiku: minimal, key points only

5. **Body sections** (after `---`):
   - `# <skill-name>` heading
   - One-line summary + context paragraph
   - `## Capability contract`
   - `## When to use`
   - `## Instructions`
   - `## Examples` (at least 2)

6. **Update manifest** — add row to `shared/manifest.md`:
   ```
   | `<name>` | Description | `shared/skills/<name>/SKILL.md` |
   ```

7. **Validate**:
   ```bash
   node scripts/lint/skill.mjs shared/skills/<name>/SKILL.md
   node scripts/build/compile.mjs --validate-only
   ```

## Capability guidelines

- Only require capabilities the skill **cannot function without**
- Use optional for capabilities that enhance but aren't essential
- Set `fallback_mode: prompt-only` if skill can work from pasted input
- Set `fallback_mode: none` only if skill is useless without required capabilities

## Quality checklist

- Skill name is kebab-case
- Description is a single clear sentence
- At least 2 tests in frontmatter
- All four body sections present
- Manifest updated
- Linter passes
