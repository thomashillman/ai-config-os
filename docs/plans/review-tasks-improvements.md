# Plan: Outstanding Tasks Review + Repo Improvements

## Context

AI Config OS is at v0.3.2 with 6 stable skills, multi-model variants, CI validation, and multi-device sync all in place. Several Phase 2b/2d features are scaffolded but not implemented — they're facades. The user wants everything improved: harden existing infra, add new skills, and improve developer experience tooling.

---

## Part 1: Outstanding Tasks (Status Report)

### Can be done now
1. **Phase 2b: Test execution** — `ops/test-skills.sh` only counts skills with `tests:`, doesn't execute them
2. **Phase 2d: Analytics** — `shared/lib/skill-analytics.sh` `log_skill_invocation()` echoes instead of writing JSON
3. **Doc generation** — `ops/generate-docs.sh` only extracts `description`, ignores inputs/outputs/examples/variants

### Deferred (need real usage)
4. Multi-device install test (needs second device)
5. Codex integration test (needs active Codex usage)
6. Phase 2.2: hooks/.mcp.json/agents/ (no concrete use case)
7. Phase 5: Plugin splitting (no context pressure observed yet)
8. Phase 5: Sync guardrails/background auto-sync (single-user, no problems yet)

---

## Part 2: Implementation Plan (9 items, priority order)

### Step 1: Complete `ops/test-skills.sh` — Phase 2b test execution
**Files:** `ops/test-skills.sh`, `shared/lib/yaml-parser.sh`
- Add `get_test_field()` to yaml-parser.sh: extract `type`, `input`, `expected_substring`, `max_latency_ms` from each test block
- Implement `structure-check` tests: validate SKILL.md has frontmatter, all variant prompt files exist, dependencies resolve, required fields present
- Implement `prompt-validation` tests (structure only — no model calls): verify test input/expected_substring are non-empty, validate format
- Write real results JSON per-test (not just aggregate count)
- Support `--skill <name>` filter (already parsed, just not used)
- Keep `--structure-only` flag for CI (skip model-dependent tests)

### Step 2: Create `ops/context-cost.sh` — Token footprint analysis
**Files:** `ops/context-cost.sh` (new)
- For each skill: count words in SKILL.md + all files in prompts/ directory
- Estimate tokens (~0.75 words per token) for each skill and for the plugin total
- Report as a table: skill name, word count, estimated tokens, percentage of total
- Flag skills over a configurable threshold (default: 2000 tokens)
- This directly informs the Phase 5 "when to split plugins" decision

### Step 3: Create `ops/validate-all.sh` — Single validation entry point
**Files:** `ops/validate-all.sh` (new)
- Run in sequence: `validate-dependencies.sh`, `validate-variants.sh`, `test-skills.sh --structure-only`, `check-docs.sh`, `claude plugin validate .`
- Collect pass/fail for each stage, print summary table
- Exit non-zero if any stage fails
- This replaces ad-hoc running of individual validators

### Step 4: Create `code-review` skill
**Files:** `shared/skills/code-review/SKILL.md`, `shared/skills/code-review/prompts/{detailed,balanced,brief}.md`
- Use `ops/new-skill.sh code-review` to scaffold
- SKILL.md: inputs (diff, context, review_type), outputs (review with severity levels)
- Content: structured review framework — what to look for (logic errors, security, performance, readability), how to format feedback (severity: critical/warning/nit), when to approve vs request changes
- Variants: opus (thorough analysis), sonnet (balanced), haiku (quick scan)
- Update `shared/manifest.md` with new row
- Bump `plugin.json` version (derive from `origin/main`)

### Step 5: Fix analytics JSON writing
**Files:** `shared/lib/skill-analytics.sh`, `ops/analytics-report.sh`
- `log_skill_invocation()`: Use `jq` to properly append to the `skill_invocations` array in the session JSON file
- `aggregate_daily_stats()`: Read all session files for the target date, aggregate invocation counts/latency/cost per skill using `jq`
- `get_analytics_report()`: Parse aggregated file and format output
- `ops/analytics-report.sh`: Replace "Phase 2d" placeholder with actual aggregation call + formatted output

### Step 6: Enrich `ops/generate-docs.sh`
**Files:** `ops/generate-docs.sh`
- Use `yaml-parser.sh` functions to extract: inputs, outputs, examples, variants, dependencies, keywords
- Generate README sections matching what each skill's `docs.sections_to_include` requests
- Include variant table (model, description, cost factor, latency baseline)
- Include input/output table with types and descriptions
- Keep the auto-generated footer notice

### Step 7: Create `context-budget` skill
**Files:** `shared/skills/context-budget/SKILL.md`, `shared/skills/context-budget/prompts/{detailed,balanced,brief}.md`
- Use `ops/new-skill.sh context-budget` to scaffold
- Content: guidelines for managing context window — when to use subagents, when to summarize, how to structure tool calls for token efficiency, when to drop old context
- Aligns with CLAUDE.md's "token efficiency is paramount" mandate
- Variants: opus (detailed strategy), sonnet (practical rules), haiku (quick checklist)
- Update `shared/manifest.md`, bump `plugin.json`

### Step 8: Create `pr-description` skill
**Files:** `shared/skills/pr-description/SKILL.md`, `shared/skills/pr-description/prompts/{detailed,balanced,brief}.md`
- Use `ops/new-skill.sh pr-description` to scaffold
- Content: structured PR template — title conventions (under 70 chars), summary bullets, test plan checklist, breaking changes section, reviewer guidance
- Natural companion to `commit-conventions` and `git-ops`
- Update `shared/manifest.md`, bump `plugin.json`

### Step 9: Dependency graph visualization
**Files:** `ops/validate-dependencies.sh` (extend)
- Add `--graph` flag that outputs a Mermaid diagram
- Nodes = skills, edges = dependencies from frontmatter
- Composition relationships shown as dashed edges
- Output to stdout (pipe to `.md` file for GitHub rendering)

---

## Key files to reuse

| File | Reuse for |
|---|---|
| `shared/lib/yaml-parser.sh` | All frontmatter parsing (Steps 1, 6, 9) |
| `ops/new-skill.sh` | Scaffold new skills (Steps 4, 7, 8) |
| `shared/skills/_template/SKILL.md` | Base template for new skills |
| `shared/skills/commit-conventions/SKILL.md` | Pattern reference for new skills |

---

## Version bumping strategy

- Each new skill triggers a patch version bump via `new-skill.sh`
- Derive base version from `origin/main` per CLAUDE.md rules
- 3 new skills = 3 bumps total (or consolidate if committing together)
- Scripts-only changes (Steps 1-3, 5-6, 9) get a single bump at the end

---

## Verification

1. Run `ops/validate-all.sh` (once created) — all stages pass
2. Run `ops/test-skills.sh` — structure-check tests execute and produce real JSON results
3. Run `ops/context-cost.sh` — shows token footprint for all 9 skills
4. Run `ops/generate-docs.sh` — READMEs include inputs/outputs/variants tables
5. Run `ops/analytics-report.sh` — no longer shows "Phase 2d" placeholder
6. Run `adapters/claude/dev-test.sh` — full validation passes
7. Run `ops/check-docs.sh` — no missing doc updates
8. Verify `claude plugin validate .` passes
9. Verify all symlinks in `plugins/core-skills/skills/` resolve correctly
10. Commit and push to `claude/review-tasks-improvements-wFxxS`

---

## Living docs updates required

| Doc | What to update |
|---|---|
| `shared/manifest.md` | Add rows for code-review, context-budget, pr-description |
| `README.md` | Update skill count, mention new ops scripts |
| `PLAN.md` | Update "Current state" table, mark Phase 2b/2d as implemented |
| `CLAUDE.md` | Add validate-all.sh and context-cost.sh to Structure section |
