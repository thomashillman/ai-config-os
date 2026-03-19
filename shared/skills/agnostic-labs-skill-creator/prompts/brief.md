# agnostic-labs-skill-creator — Haiku Variant (Brief)

Create a new skill. Output the SKILL.md content and commands only.

## Steps

1. Validate name: kebab-case (`^[a-z][a-z0-9-]*$`)
2. `mkdir -p shared/skills/<name>/prompts`
3. Write `shared/skills/<name>/SKILL.md` — full frontmatter + 4 body sections
4. Write variant prompts in `prompts/` (detailed.md, balanced.md, brief.md)
5. Add row to `shared/manifest.md`
6. Run `node scripts/lint/skill.mjs shared/skills/<name>/SKILL.md`

## Required frontmatter

`skill`, `description`, `type`, `status`, `version`, `capabilities` (required, optional, fallback_mode)

## Required body sections

`# <name>`, `## Capability contract`, `## When to use`, `## Instructions`, `## Examples`
