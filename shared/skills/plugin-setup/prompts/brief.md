# Quick Setup Commands (Haiku)

## Create a skill

```bash
ops/new-skill.sh <skill-name>
```

## Edit the skill

```
shared/skills/<skill-name>/SKILL.md
```

Add frontmatter (description, type, inputs, outputs, version) and body (When to use, Instructions, Examples).

## Add variant prompts (optional)

```
shared/skills/<skill-name>/prompts/
├── detailed.md   ← opus
├── balanced.md   ← sonnet
└── brief.md      ← haiku
```

## Update manifest

Add row to `shared/manifest.md`:
```
| `<skill-name>` | Description | `shared/skills/<skill-name>/SKILL.md` |
```

## Bump version

Edit `plugins/core-skills/.claude-plugin/plugin.json`:
- Patch (0.2.3 → 0.2.4) for content changes
- Minor (0.2.3 → 0.3.0) for new skills

## Validate

```bash
adapters/claude/dev-test.sh
```

All checks must pass (zero errors).

## Key rules

- Author in `shared/skills/` only
- Use relative symlinks: `../../../shared/skills/<name>`
- One commit per skill
- Bump version before committing
