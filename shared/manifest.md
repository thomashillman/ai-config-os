# AI Config OS — Manifest

Personal AI behaviour layer. This repo provides shared skills, conventions, and plugin packaging for Claude Code and other AI agents.

## Skills

| Skill | Description | Path |
|---|---|---|
| `session-start-hook` | Validates plugin structure at session start in remote Claude Code environments | `shared/skills/session-start-hook/SKILL.md` |
| `web-search` | Search the web for current information and synthesize results | `shared/skills/web-search/SKILL.md` |
| `commit-conventions` | Surfaces Conventional Commits prefix rules and helps draft well-formed commit messages | `shared/skills/commit-conventions/SKILL.md` |
| `git-ops` | Guards git operations and version bumping; ensures single source of truth for plugin.json | `shared/skills/git-ops/SKILL.md` |
| `principles` | Surfaces the repo's opinionated AI behaviour defaults (communication, code, decision-making) | `shared/skills/principles/SKILL.md` |
| `plugin-setup` | Step-by-step guidance for creating and registering a new skill in this repo | `shared/skills/plugin-setup/SKILL.md` |

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
