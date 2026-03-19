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

## Claude Code extensions (add when needed)

| Feature | Frontmatter | When |
|---------|-------------|------|
| User-only invoke | `disable-model-invocation: true` | Side effects (deploy, commit) |
| Model-only invoke | `user-invocable: false` | Background knowledge |
| Subagent | `context: fork` + `agent: Explore` | Isolated research tasks |
| Dynamic context | `` !`git status` `` in body | Inject shell output |
| Tool restriction | `allowed-tools: Read, Grep, Glob` | Read-only skills |
| Arguments | `$ARGUMENTS`, `$0`, `argument-hint` | User-passed params |
| Hooks | `type: hook` + event + matcher | Lifecycle events |

## Required body sections

`# <name>`, `## Capability contract`, `## When to use`, `## Instructions`, `## Examples`

## Hook events (for hook-type skills)

SessionStart, PreToolUse, PostToolUse, PermissionRequest, Stop, ConfigChange.
Exit 0 = proceed, Exit 2 = block. Types: command, http, prompt, agent.
