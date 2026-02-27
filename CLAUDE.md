# AI Config OS

## Structure
- `shared/skills/` — canonical skill definitions (author here)
- `plugins/core-skills/skills/` — symlinks into shared/skills (never edit here directly)
- `.claude-plugin/marketplace.json` — marketplace manifest
- `plugins/core-skills/.claude-plugin/plugin.json` — plugin metadata (bump version on changes)

## Creating a new skill
Run `ops/new-skill.sh <skill-name>` — this creates the skill directory, symlink, manifest entry, and bumps the plugin version.

## Testing locally
Run `adapters/claude/dev-test.sh` to validate structure and test the plugin.

## Key rules
- Always author skills in `shared/skills/`, never directly in `plugins/`
- Bump `version` in `plugins/core-skills/.claude-plugin/plugin.json` after any skill change
- Symlinks must use relative paths: `../../../shared/skills/<name>`
- Run `claude plugin validate .` before committing
