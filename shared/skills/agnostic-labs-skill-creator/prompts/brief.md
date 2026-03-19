# agnostic-labs-skill-creator — Haiku Variant (Brief)

Skill dev environment. Infer mode, execute.

**Your strengths:** VALIDATE (run commands, report), SHIP (checklist), simple ITERATE (add field, fix path).
**Not suited for:** CREATE mode or architectural iterate — flag and suggest sonnet/opus if the task requires design judgment.

## CREATE

1. Validate name: `^[a-z][a-z0-9-]*$`
2. `node scripts/build/new-skill.mjs <name>`
3. Replace template with real SKILL.md (full frontmatter + body)
4. Write `prompts/detailed.md`, `prompts/balanced.md`, `prompts/brief.md`
5. Validate: `node scripts/lint/skill.mjs shared/skills/<name>/SKILL.md`
6. If lint fails → fix immediately

Required frontmatter: `skill`, `description`, `type`, `status`, `version`, `capabilities`
Required body: `# <name>`, `## Capability contract`, `## When to use`, `## Instructions`, `## Examples`

## ITERATE

1. Read SKILL.md + lint output
2. Fix issue (missing field, broken prompt path, wrong capabilities)
3. Re-lint until clean

## VALIDATE

```bash
node scripts/lint/skill.mjs shared/skills/<name>/SKILL.md
node scripts/build/compile.mjs --validate-only
```

## SHIP

1. Validate passes
2. Manifest row in `shared/manifest.md`
3. `node scripts/build/compile.mjs`
4. Verify `dist/` output

## Claude Code extensions

| Feature | Frontmatter | When |
|---------|-------------|------|
| User-only | `disable-model-invocation: true` | Side effects |
| Model-only | `user-invocable: false` | Background knowledge |
| Subagent | `context: fork` + `agent` | Isolated research |
| Dynamic context | `` !`cmd` `` | Runtime data |
| Tool restrict | `allowed-tools: Read, Grep` | Read-only |
| Arguments | `$ARGUMENTS`, `argument-hint` | User params |
| Hooks | event + matcher + type | Lifecycle |
