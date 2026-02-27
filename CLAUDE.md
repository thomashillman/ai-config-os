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

## Living docs protocol

Three docs stay in sync; each owns a distinct slice:

| Doc | Update when |
|---|---|
| `README.md` | Directory structure changes, install steps change, new major capability added |
| `PLAN.md` | A phase completes, acceptance criteria are met, recommended next steps change |
| `CLAUDE.md` | Dev conventions change, new ops scripts added, git/proxy workflow changes |
| `shared/manifest.md` | A skill is added, renamed, or removed (one row per skill) |

**Rules for Claude agents:**
- After any commit that creates or modifies a skill: update `shared/manifest.md` row + check if README or PLAN.md need a line.
- After any commit that changes repo structure (new top-level dir, new ops script): update README directory table + CLAUDE.md Structure section.
- After any merge to main: update PLAN.md "Current state" table and "Recommended next" section.
- Never duplicate content across docs. If you find the same fact in two places, pick the authoritative owner (table above) and remove it from the other, replacing with a link.
- Run `ops/check-docs.sh` before committing to see which docs the changed files are expected to touch.

## Workflow — Local Proxy Environment

This repo's remote is a local proxy (`http://local_proxy@127.0.0.1:41590/git/…`), not a direct GitHub connection. This has important implications for how Claude agents should operate:

### What works

- Edit files locally
- `git add` + `git commit` on the designated `claude/…` branch
- `git push -u origin <branch-name>` — the proxy supports git smart-HTTP push/pull

### What does NOT work — skip these immediately

- `gh pr create` — gh cannot resolve the local proxy as a known GitHub host
- Direct `git push origin main` — branch protection returns HTTP 403
- Probing the proxy REST API (e.g. `/api/v1/…`) — the proxy only handles git protocol, not REST
- Temporarily repointing the remote to github.com and retrying — the GITHUB_TOKEN in the environment is not valid for that repo

### Correct approach

Do the minimum that is known to succeed:

```sh
# 1. Make changes on the designated claude/ branch
git add <files>
git commit -m "type: description"

# 2. Push the branch — this is the reliable endpoint
git push -u origin claude/<branch-name>
```

Merging to main happens outside the agent session (via the repo owner's GitHub UI or equivalent). Do not waste turns attempting `gh pr create`, REST API calls, or direct main pushes after the first failure.

## Git Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Use for |
|--------|---------|
| `feat:` | new feature or template |
| `fix:` | bug fix |
| `style:` | CSS-only change |
| `refactor:` | restructure without behaviour change |
| `docs:` | documentation only |
| `build:` | build system / tooling |
| `chore:` | maintenance |

Examples:

```
feat: add downloads archive template
fix: guard feature_image in post-meta partial
style: enforce --color-accent on all CTA buttons
docs: add CLAUDE.md with theme coding standards
build: Ghost theme scaffold (0.1.0)
```
