# Design: Cursor rules CI validation + dual-surface PR review

**Status:** Draft for implementation planning  
**Date:** 2026-03-31  
**Brainstorming lock-in:** User selected **option 3 — both** Cursor-side rules and GitHub automation for PR critique.

## 1. Problem

- Project rules live under [`.cursor/rules/*.mdc`](../../../.cursor/rules/) but **CI does not validate** frontmatter or structure; workflow path filters may **skip** jobs when only `.cursor/rules/` changes.
- **Structured PR review** exists as skills ([`shared/skills/review-pr/SKILL.md`](../../../shared/skills/review-pr/SKILL.md), [`shared/skills/code-review/SKILL.md`](../../../shared/skills/code-review/SKILL.md)) for manual/agent use, not as **Cursor project rules** or **GitHub-posted** feedback.

## 2. Goals

1. **CI validation** — Fail PRs that introduce invalid `.cursor/rules/*.mdc` (required frontmatter, activation fields, optional filename convention).
2. **Cursor review rule** — One opt-in `.mdc` (`alwaysApply: false`) so Composer/chat can `@`-invoke a **PR critique** aligned with `review-pr` / `code-review` without duplicating full skill bodies.
3. **GitHub automation** — A workflow that posts review output on pull requests **when configured** (API secret present), reusing the same review dimensions as `review-pr`.

## 3. Non-goals

- Replacing human review or required GitHub CODEOWNERS checks.
- Running the **Cursor product** inside GitHub Actions (use an HTTP model API or approved bot instead).
- **Team Rules** from Cursor org dashboard.
- Sending full repository tarballs to external APIs; scope to **PR diff + metadata** (and optional small context files with strict size caps).

## 4. Existing assets to extend

| Asset | Role |
| --- | --- |
| [`.github/workflows/pr-mergeability-gate.yml`](../../../.github/workflows/pr-mergeability-gate.yml) | Always runs validate/build/test/verify — **add** cursor-rules check step or npm script it calls. |
| [`.github/workflows/validate.yml`](../../../.github/workflows/validate.yml) | Path-filtered — **add** `.cursor/rules/**` (and `scripts/ci/**` if new script) to `paths`. |
| [`package.json`](../../../package.json) | Add e.g. `check:cursor-rules` script. |
| [`yaml`](../../../package.json) dependency | Parse YAML frontmatter in a small Node validator under `scripts/ci/`. |
| `review-pr` / `code-review` skills | **Source of truth** for review dimensions; Cursor rule and GH prompt template **reference** them by path/name. |

## 5. Component A — CI validation (`scripts/ci/`)

**Deliverable:** `scripts/ci/validate-cursor-rules.mjs` (or `.sh` if minimal; prefer Node + `yaml` for correctness).

**Checks (initial):**

- Every file in `.cursor/rules/` matching `*.mdc` is readable and has a YAML fence with:
  - `description` (non-empty string)
  - Either `alwaysApply: true|false` **or** `globs` (non-empty), per [Cursor project rules](https://cursor.com/docs/context/rules) (both may be present; define explicit rules: e.g. require `description` always; require `alwaysApply` key if no `globs`, or allow `globs` + optional `alwaysApply`).
- Optional: enforce **ordered kebab** basename pattern `^\d{3}-[a-z0-9-]+\.mdc$` to match [locked convention](../../../.cursor/rules/) from the Cursor rules system plan.

**Wiring:**

- `package.json`: `"check:cursor-rules": "node scripts/ci/validate-cursor-rules.mjs"`
- `pr-mergeability-gate.yml`: run `npm run check:cursor-rules` after `npm ci` (alongside existing validate).
- `validate.yml` / `build.yml`: extend `paths` so pushes/PRs that only touch `.cursor/rules/**` still run relevant workflows.

**Tests:** Add a small test under `scripts/build/test/` or co-located `validate-cursor-rules.test.mjs` with fixture invalid/valid snippets (optional v1: script only + manual PR).

## 6. Component B — Cursor review rule

**Deliverable:** `.cursor/rules/300-pr-review.mdc` (or next free prefix), `alwaysApply: false`.

**Content outline:**

- When to use: `@300-pr-review` (or chosen name) + paste or reference PR diff / list of changed files.
- Output shape: mirror `review-pr` sections (breaking changes, security, tests, API design) with **severity** labels and **approve / request changes** recommendation.
- **Single line** pointing authors to `shared/skills/review-pr/SKILL.md` for full skill contract and variants.

**Duplication policy:** Keep the `.mdc` under ~50 lines; do not paste entire skill prompts.

## 7. Component C — GitHub PR review automation

**Deliverable:** `.github/workflows/pr-ai-review.yml` (name TBD) + `scripts/ci/pr-review-comment.mjs` (or composite action) **or** documented use of a maintained third-party action (prefer repo-owned script for transparency).

**Behaviour:**

- Trigger: `pull_request` (`opened`, `synchronize`, `reopened`, `ready_for_review`), optional `workflow_dispatch` for dry run.
- **Guard:** Run full review job only if secret `AI_PR_REVIEW_API_KEY` (or vendor-specific name) is configured; otherwise **skip** or emit a neutral notice (avoid failing CI when secret absent).
- Gather context: `git diff` base...head for changed files; cap lines/bytes (e.g. max 200KB) to control cost; exclude generated paths via allowlist/denylist.
- Call model API (provider **TBD** in implementation — document interface: JSON in, markdown review out).
- Post result as **one** issue comment on the PR via `actions/github-script` or `gh api`, signed clearly as **automated** / non-blocking unless you later add a branch protection rule.

**Security and fork PRs:**

- **Default policy:** Document that **secrets are not available** to workflows from **fork** PRs on `pull_request`. Options: (a) same-repo PRs only for automation; (b) `pull_request_target` is **high risk** if it checks out untrusted code — if ever used, restrict to diff fetched without executing untrusted scripts and follow [GitHub hardening guidance](https://securitylab.github.com/research/github-actions-preventing-pwn-requests/).
- Do not echo secrets or full file contents in logs.

**Alignment:** System prompt / instruction block in script should reference the same headings as `review-pr` so Cursor and GitHub outputs stay comparable.

## 8. Documentation

- Optional one-line in [`AGENTS.md`](../../../AGENTS.md) or [`README.md`](../../../README.md): Cursor `@300-pr-review` + CI `check:cursor-rules` + optional GH workflow (only if maintainers agree; follow living-docs ownership in AGENTS.md).
- No duplicate long checklists across AGENTS.md and `.mdc`.

## 9. Implementation order (recommended)

1. `validate-cursor-rules.mjs` + `package.json` + mergeability gate + path filters.
2. `300-pr-review.mdc`.
3. GH workflow + comment script behind secret; start with same-repo PRs and conservative diff caps.

## 10. Open decisions (implementation phase)

- Exact frontmatter rules for `globs` vs `alwaysApply` (match Cursor behaviour as documented).
- Model provider and secret naming for Component C.
- Whether AI review comments should **request changes** via GitHub Review API or only add a comment (comment is simpler and non-blocking).
