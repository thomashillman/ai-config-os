# AI Config OS — Manifest

Personal AI behaviour layer. This repo provides shared skills, conventions, and plugin packaging for Claude Code and other AI agents.

## Skills

| Skill | Description | Path |
|---|---|---|
| `session-start-hook` | Validates plugin structure at session start in remote Claude Code environments | `shared/skills/session-start-hook/SKILL.md` |

## Plugins

| Plugin | Skills | Description |
|---|---|---|
| `core-skills` | All skills in `shared/skills/` | Foundational skills for Claude Code sessions |

## Conventions

- **Author skills in** `shared/skills/<name>/SKILL.md` — never edit directly inside `plugins/`
- **Symlinks** connect `plugins/core-skills/skills/<name>` → `../../../shared/skills/<name>`
- **Version bumps** are required in `plugins/core-skills/.claude-plugin/plugin.json` after any skill change
- **Naming**: use kebab-case for skill directory names
- **Template**: new skills should follow the structure in `shared/skills/_template/SKILL.md`
