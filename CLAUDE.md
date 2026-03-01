# AI Config OS

**Purpose:** Personal AI behaviour layer — skills, hooks, and conventions for Claude Code and other AI agents. All skill authoring happens in `shared/skills/`; `plugins/` contains only symlinks.

## Structure
- `shared/skills/` — canonical skill definitions (author here)
- `plugins/core-skills/skills/` — symlinks into shared/skills (never edit here directly)
- `.claude-plugin/marketplace.json` — marketplace manifest
- `plugins/core-skills/.claude-plugin/plugin.json` — plugin metadata (bump version on changes)

## Creating a new skill
Run `ops/new-skill.sh <skill-name>` — this creates the skill directory, symlink, manifest entry, and bumps the plugin version.

## Testing locally
Run `adapters/claude/dev-test.sh` to validate structure and test the plugin.

## Continual self-improvement

**Your self-improvement is key.** If a task has failed or not worked efficiently, you **must** visibly state:

1. **What went wrong** — be explicit, not vague
2. **What to do differently** — concrete steps to prevent recurrence

Token efficiency is paramount. **Unnecessary token wastage is forbidden.** Prefer concise tool calls, avoid re-reading files you already have in context, and do not repeat information already established.

## Key rules
- Always author skills in `shared/skills/`, never directly in `plugins/`
- Bump `version` in `plugins/core-skills/.claude-plugin/plugin.json` after any skill change
- Symlinks must use relative paths: `../../../shared/skills/<name>`
- Run `claude plugin validate .` before committing
- Start new skills from `shared/skills/_template/SKILL.md` (Phase 2: enhanced with full frontmatter)

## Session startup checklist

Before doing any work on a `claude/` branch:

1. **Fetch main to get latest state**
   ```sh
   git fetch origin main
   ```

2. **Rebase onto main** (if safe)
   ```sh
   git rebase origin/main
   ```
   - Skip if: branch has been reviewed, 5+ commits with likely conflicts, or deliberately cut from a historical tag
   - Use the `git-ops` skill to validate before rebasing

3. **When bumping `plugin.json` version, derive from `origin/main` at bump-time**
   ```sh
   # Read canonical version, don't trust the working tree
   git show origin/main:plugins/core-skills/.claude-plugin/plugin.json | jq -r '.version'
   ```
   - Parse that version and increment the patch component (unless major/minor bump needed)
   - Never read the working tree's version as the base; it reflects an older merge-base

4. **If another `claude/` branch is known to be open and also touching `plugin.json`**
   - Flag the conflict to the user rather than guessing the version
   - Use the `git-ops` skill's race-condition detection
   - Recommendation: coordinate with the other session or escalate to user

The `git-ops` skill automates these checks. Use it whenever bumping versions or rebasing.

## Phase 2: Enhanced SKILL.md Frontmatter

All skills define metadata in YAML frontmatter (between `---` markers):

```yaml
---
# Identity
skill: skill-name
description: One sentence summary; one paragraph context max.
type: prompt  # or: hook, agent, workflow-blueprint
status: stable  # or: experimental, deprecated

# Feature 1: Dependencies & Metadata
inputs:
  - name: input_name
    type: string
    description: Description
    required: true

outputs:
  - name: output_name
    type: string
    description: Description

dependencies:
  skills:
    - name: dependency-skill
      version: "^1.0"  # semver constraint
      optional: false
  apis:
    - external-api-name
  models:
    - opus  # or: sonnet, haiku

examples:
  - input: "User input"
    output: "Skill output"
    expected_model: sonnet

# Feature 2: Multi-Model Variants
variants:
  opus:
    prompt_file: prompts/detailed.md
    description: For complex topics
    cost_factor: 3.0
    latency_baseline_ms: 800
  sonnet:
    prompt_file: prompts/balanced.md
    description: Default; balanced
    cost_factor: 1.0
    latency_baseline_ms: 300
  haiku:
    prompt_file: prompts/brief.md
    description: For quick lookups
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain:
    - opus
    - sonnet
    - haiku

# Feature 3: Skill Testing
tests:
  - id: test-id
    type: prompt-validation  # or: structure-check, integration, performance
    input: "Test input"
    expected_substring: "expected text"
    models_to_test:
      - sonnet

# Feature 4: Skill Composition
composition:
  personas:
    - name: persona-name
      skills:
        - skill-name

# Feature 5: Auto-Generated Documentation
docs:
  auto_generate_readme: true
  sections_to_include:
    - description
    - inputs
    - outputs

# Feature 6: Performance Monitoring
monitoring:
  enabled: true
  track_metrics:
    - latency
    - token_count
    - cost
    - variant_selected

version: "1.0.0"
changelog:
  "1.0.0": "Initial release"
---
```

See `shared/skills/_template/SKILL.md` for complete template.

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
