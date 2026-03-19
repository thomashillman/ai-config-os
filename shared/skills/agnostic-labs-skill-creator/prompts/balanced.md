# agnostic-labs-skill-creator — Sonnet Variant (Balanced)

Skill development environment. Infer the mode from context and execute.

## Modes

### CREATE

1. **Validate name**: `^[a-z][a-z0-9-]*$`. Fix if needed. Check `shared/skills/` for conflicts.

2. **Scaffold**:
   ```bash
   node scripts/build/new-skill.mjs <name>
   ```
   Then replace template content with real skill.

3. **Write SKILL.md** with complete Phase 2 frontmatter:
   - Required: `skill`, `description`, `type`, `status`, `version`, `capabilities`
   - Recommended: `inputs`, `outputs`, `variants` (opus/sonnet/haiku), `tests` (≥2), `docs`, `monitoring`, `tags`

4. **Claude Code extensions** (apply when relevant):
   - Side-effect skills → `disable-model-invocation: true`
   - Background knowledge → `user-invocable: false`
   - Isolated research → `context: fork` + `agent: Explore|Plan|general-purpose`
   - Runtime data → `` !`command` `` dynamic context
   - Read-only skills → `allowed-tools: Read, Grep, Glob`
   - User params → `$ARGUMENTS`, `argument-hint`
   - Hook skills → event + matcher + type + exit codes

5. **Write variant prompts** in `prompts/` — model-appropriate task instructions:
   - `detailed.md` (opus): thorough, edge cases
   - `balanced.md` (sonnet): clear, complete
   - `brief.md` (haiku): minimal, commands only

6. **Body sections** (after `---`):
   - `# <name>` + summary
   - `## Capability contract`
   - `## When to use`
   - `## Instructions`
   - `## Examples` (≥2)

7. **Validate immediately**:
   ```bash
   node scripts/lint/skill.mjs shared/skills/<name>/SKILL.md
   node scripts/build/compile.mjs --validate-only
   ```
   If either fails → fix before reporting done.

### ITERATE

1. **Read** current SKILL.md + run lint
2. **Diagnose** the issue:
   - Missing `fallback_mode` → add it when `required` capabilities exist
   - Missing required field → add it (`skill`, `description`, `type`, `status`, `version`)
   - Variant prompt missing → create the file
   - Wrong invocation control → adjust frontmatter
   - `context: fork` on guidelines → remove it
   - Platform excluded → move capability to optional, add fallback
3. **Fix** with surgical edits
4. **Re-validate** — lint + build must pass

### VALIDATE

```bash
node scripts/lint/skill.mjs shared/skills/<name>/SKILL.md
node scripts/build/compile.mjs --validate-only
npm test -- scripts/build/test/delivery-contract.test.mjs
```

Report pass/fail per stage with specific errors.

### SHIP

1. Validate (all stages must pass)
2. Check `shared/manifest.md` row
3. `node scripts/build/compile.mjs` (full compile)
4. Verify skill in `dist/clients/claude-code/` and `dist/registry/index.json`
5. Report readiness checklist

## Capability guidelines

- Only require capabilities the skill **cannot function without**
- Use optional for capabilities that enhance but aren't essential
- `fallback_mode: prompt-only` if skill can work from pasted input
- `fallback_mode: none` only if skill is useless without required capabilities

## Quality checklist

- Name is kebab-case
- Description is one clear sentence
- `type`, `status`, `version` set
- `capabilities.fallback_mode` set when required capabilities exist
- ≥2 tests in frontmatter
- All body sections present
- Manifest row in `shared/manifest.md`
- Lint passes, build passes
- Invocation control set for side-effect skills
- `context: fork` only for task skills, never guidelines
- Tool restrictions applied for read-only skills

## Hook reference (hook-type skills)

Events: `SessionStart`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `Stop`, `ConfigChange`
Types: `command` (shell), `http` (webhook), `prompt` (LLM), `agent` (multi-turn)
Exit 0 = proceed (stdout → context), Exit 2 = block (stderr → feedback)
