# agnostic-labs-skill-creator — Opus Variant (Detailed)

You are creating a new skill for the ai-config-os repository. This is the detailed variant — provide thorough guidance, handle edge cases, and explain rationale for every decision.

## Full Skill Creation Protocol

### Pre-flight checks

1. **Validate the skill name** against the kebab-case pattern `^[a-z][a-z0-9-]*$`. If the user provides a name like `MySkill` or `my_skill`, suggest the corrected form (`my-skill`) and confirm before proceeding.

2. **Check for naming conflicts** — scan `shared/skills/` to ensure no directory with the same name exists. If a conflict is found, inform the user and suggest alternatives (e.g., append a qualifier).

3. **Determine the skill type** from the user's description:
   - `prompt` — provides instructions/guidance to Claude (most common)
   - `hook` — executes at specific lifecycle events (SessionStart, PreToolUse, etc.)
   - `agent` — runs as an isolated subagent with its own context
   - `workflow-blueprint` — orchestrates multiple skills in sequence

### Capability analysis

Carefully consider which capabilities the skill truly needs:

| Capability | When to require | When to make optional |
|------------|----------------|----------------------|
| `fs.read` | Skill reads files as core function | Skill can work from pasted content |
| `fs.write` | Skill creates/modifies files | Output can be shown to user instead |
| `shell.exec` | Skill runs commands | Commands can be shown for manual execution |
| `git.read` | Skill needs git history/status | User can paste git output |
| `git.write` | Skill commits/pushes | User can run git commands manually |
| `network.http` | Skill fetches from URLs | User can paste fetched content |

**Fallback mode decision tree:**
- If skill works entirely from text input/output → `prompt-only`
- If skill can provide manual steps instead of executing → `manual`
- If skill is useless without its required capabilities → `none`

### SKILL.md generation

Generate the complete SKILL.md with:

1. **Full Phase 2 frontmatter** — every applicable field populated with thoughtful defaults
2. **Capability contract section** — explain what the skill needs and why
3. **When to use section** — 3-5 bullet points describing trigger conditions
4. **Instructions section** — step-by-step instructions Claude should follow, with code blocks where relevant
5. **Examples section** — at least 2 concrete input/output examples

### Variant prompt files

Create three variant files in `prompts/`:

- **`detailed.md` (opus):** Full instructions with edge-case handling, rationale, and comprehensive output. Cost factor ~3.0.
- **`balanced.md` (sonnet):** Clear, complete instructions with sensible defaults. Cost factor 1.0.
- **`brief.md` (haiku):** Minimal output — commands or key points only. Cost factor ~0.3.

Each variant file should contain model-specific instructions that tailor the skill's behavior to the model's strengths.

### Post-creation validation

After creating the skill:

1. Run `node scripts/lint/skill.mjs shared/skills/<name>/SKILL.md` to validate schema compliance
2. Run `node scripts/build/compile.mjs --validate-only` to check the full build pipeline
3. Verify the manifest entry in `shared/manifest.md` is correctly formatted
4. Confirm all variant prompt files referenced in frontmatter exist

### Common mistakes to avoid

- **Over-requiring capabilities**: Don't mark `fs.read` as required if the skill can work from pasted input
- **Missing fallback_mode**: Schema requires this when `capabilities.required` is non-empty
- **Forgetting manifest update**: Every new skill needs a row in `shared/manifest.md`
- **Wrong test type**: Use `prompt-validation` for most skills; `structure-check` for schema tests; `integration` for end-to-end; `performance` for latency benchmarks
- **Hardcoded paths**: Use `${CLAUDE_SKILL_DIR}` for skill-relative paths in prompts
- **Missing version**: Always start at "1.0.0" with a changelog entry
