# Design: Cursor rules CI validation + dual-surface PR review

**Status:** Ready for implementation  
**Date:** 2026-03-31  
**Brainstorming lock-in:** User selected **option 3 — both** Cursor-side rules and GitHub automation for PR critique.  
**Spec review (2026-03-31):** Critical/major amendments applied (permissions, frontmatter matrix, diff safety, comment UX, fork default).

## 1. Problem

- Project rules live under [`.cursor/rules/*.mdc`](../../../.cursor/rules/) but **CI does not validate** frontmatter or structure; workflow path filters may **skip** jobs when only `.cursor/rules/` changes.
- **Structured PR review** exists as skills ([`shared/skills/review-pr/SKILL.md`](../../../shared/skills/review-pr/SKILL.md), [`shared/skills/code-review/SKILL.md`](../../../shared/skills/code-review/SKILL.md)) for manual/agent use, not as **Cursor project rules** or **GitHub-posted** feedback.

## 2. Goals

1. **CI validation** — Fail PRs that introduce invalid `.cursor/rules/*.mdc` (required frontmatter, activation fields, optional filename convention).
2. **Cursor review rule** — One opt-in `.mdc` (`alwaysApply: false`) so Composer/chat can `@`-invoke a **PR critique** aligned with `review-pr` / `code-review` without duplicating full skill bodies.
3. **GitHub automation** — A **separate** workflow that posts review output on pull requests **when configured** (API secret present), reusing the same review dimensions as `review-pr`.

## 3. Non-goals

- Replacing human review or required GitHub CODEOWNERS checks.
- Running the **Cursor product** inside GitHub Actions (use an HTTP model API or approved bot instead).
- **Team Rules** from Cursor org dashboard.
- Sending full repository tarballs to external APIs; scope to **PR diff + metadata** (and optional small context files with strict size caps).

## 4. Existing assets to extend

| Asset                                                                                               | Role                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`.github/workflows/pr-mergeability-gate.yml`](../../../.github/workflows/pr-mergeability-gate.yml) | Always runs validate/build/test/verify — **add** `npm run check:cursor-rules` after `npm ci`. **Do not** raise `GITHUB_TOKEN` permissions here; mergeability gate stays read-only for PR metadata. |
| [`.github/workflows/validate.yml`](../../../.github/workflows/validate.yml)                         | Path-filtered — **add** `.cursor/rules/**` and `.github/workflows/pr-ai-review.yml` (and `scripts/ci/**` as needed).                                                                               |
| [`.github/workflows/build.yml`](../../../.github/workflows/build.yml)                               | Same path extensions so rules-only or workflow-only changes trigger CI.                                                                                                                            |
| [`package.json`](../../../package.json)                                                             | `check:cursor-rules` script.                                                                                                                                                                       |
| [`yaml`](../../../package.json) dependency                                                          | Parse YAML frontmatter in `scripts/ci/validate-cursor-rules.mjs`.                                                                                                                                  |
| `review-pr` / `code-review` skills                                                                  | **Source of truth** for review dimensions; Cursor rule and GH prompt **reference** them by path/name.                                                                                              |

## 5. Component A — CI validation (`scripts/ci/`)

**Deliverable:** [`scripts/ci/validate-cursor-rules.mjs`](../../../scripts/ci/validate-cursor-rules.mjs).

### Frontmatter matrix (locked; matches [Cursor Rules](https://cursor.com/docs/context/rules))

| Field         | Rule                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `description` | **Required.** Non-empty string (after trim).                                                                                                                     |
| `alwaysApply` | **Required** for every `*.mdc` under `.cursor/rules/`. Must be boolean `true` or `false`.                                                                        |
| `globs`       | **Optional.** If present, must be a non-empty string (after trim) or a non-empty array of non-empty strings. Omit the key entirely when not file-scoping a rule. |
| Other keys    | Allowed if Cursor adds them later; validator does not fail on unknown keys (YAGNI).                                                                              |

**Filename convention (enforced):** Basename must match `^\d{3}-[a-z0-9-]+\.mdc$` (ordered kebab). Only `*.mdc` files are validated; other files under `.cursor/rules/` (e.g. a future `README.md`) are ignored by the validator.

**Wiring:**

- `package.json`: `"check:cursor-rules": "node scripts/ci/validate-cursor-rules.mjs"`
- `pr-mergeability-gate.yml`: run after `npm ci` (read-only job; no permission changes).
- `validate.yml` / `build.yml`: extend `paths` for `.cursor/rules/**`, `scripts/ci/**`, and `.github/workflows/pr-ai-review.yml`.

**Tests:** Golden tests in `scripts/build/test/validate-cursor-rules.test.mjs` (valid + invalid fixtures) so regressions fail `npm test`.

## 6. Component B — Cursor review rule

**Deliverable:** `.cursor/rules/300-pr-review.mdc`, `alwaysApply: false`.

**Content outline:**

- When to use: `@300-pr-review` + paste or reference PR diff / changed files.
- Output shape: mirror `review-pr` sections (breaking changes, security, tests, API design) with **severity** labels and **approve / request changes** recommendation.
- One line pointing to `shared/skills/review-pr/SKILL.md` for full contract and variants.

**Duplication policy:** Keep under ~50 lines; do not paste full skill prompts.

## 7. Component C — GitHub PR review automation

**Deliverable:** [`.github/workflows/pr-ai-review.yml`](../../../.github/workflows/pr-ai-review.yml) + [`scripts/ci/pr-ai-review.mjs`](../../../scripts/ci/pr-ai-review.mjs).

### Permissions (critical)

- **New workflow only.** Grant **`issues: write`** (PR comments use the issues comments API), **`contents: read`**, **`pull-requests: read`**.
- **Do not** widen permissions on [`pr-mergeability-gate.yml`](../../../.github/workflows/pr-mergeability-gate.yml).

### Behaviour

- **Trigger:** `pull_request` (`opened`, `synchronize`, `reopened`, `ready_for_review`). No `workflow_dispatch` in v1 (avoids ambiguous PR context); re-run via GitHub “Re-run jobs” on the PR event.
- **Draft PRs:** Skip (same spirit as mergeability gate).
- **Fork default:** Run **only** when `github.event.pull_request.head.repo.full_name == github.repository`. Fork PRs get **no** bot comment and **no** secret exposure (`pull_request` from forks does not receive repo secrets).
- **Secret guard:** If `AI_PR_REVIEW_API_KEY` is unset, exit **0** and print a single line (do not fail CI).
- **Provider (v1):** OpenAI-compatible Chat Completions HTTP API. Env: `AI_PR_REVIEW_API_KEY` (required when job runs meaningfully), optional `AI_PR_REVIEW_MODEL` (default `gpt-4o-mini`). Document optional future providers separately.
- **Comment UX:** **One** bot comment per PR, **updated in place** on each push: body must contain HTML marker `<!-- ai-pr-review-bot -->`. If a comment with that marker exists from this workflow, **PATCH** it; otherwise **POST** a new comment. Reduces noise versus a new comment every sync.
- **Merge blocking:** Use **issue comment** only (not GitHub “request changes” review state) unless maintainers explicitly change policy later.

### Diff gathering and safety

- Compute diff: `git diff` between `pull_request.base.sha` and `pull_request.head.sha` (full SHAs from the event; requires `fetch-depth: 0` checkout + `git fetch` of both refs).
- **Byte cap:** Max **200KB** of diff text after filtering (truncate with a visible notice in the posted review).
- **File cap:** Max **100** files worth of hunks after filtering (configurable constant in script).
- **Path denylist** (drop entire file hunk if any path matches): `**/.env`, `**/.env.*`, `**/*.pem`, `**/secrets/**`, paths containing `credential` (case-insensitive), `id_rsa`, `**/*.key` (SSH/private key convention). Extend in code as needed.
- **Logging:** Do not print raw diff or secret values to `stdout`/`stderr` in CI (short summaries only, e.g. byte length and file count).

### Alignment

- System prompt in `pr-ai-review.mjs` must use the same section headings as `review-pr` (BREAKING CHANGES, SECURITY, TEST COVERAGE, API DESIGN, etc.) so Cursor and GitHub outputs stay comparable.

### `pull_request_target`

- **Out of scope for v1.** If ever considered for fork automation, follow [GitHub hardening guidance](https://securitylab.github.com/research/github-actions-preventing-pwn-requests/) and do not execute untrusted code from the PR checkout.

## 8. Documentation

- After adding `scripts/ci/` validators, run [`ops/check-docs.sh`](../../../ops/check-docs.sh) before commit; if `check:cursor-rules` becomes a canonical check, update [`README.md`](../../../README.md) directory/verification table and [`CLAUDE.md`](../../../CLAUDE.md) / [`AGENTS.md`](../../../AGENTS.md) per the living-docs table when maintainers agree.
- Optional one-liner: Cursor `@300-pr-review`, `npm run check:cursor-rules`, optional `pr-ai-review` workflow + `AI_PR_REVIEW_API_KEY` secret.

## 9. Implementation order

1. `validate-cursor-rules.mjs` + tests + `package.json` + mergeability gate + workflow path filters.
2. `300-pr-review.mdc` (run `check:cursor-rules` after adding).
3. `pr-ai-review.yml` + `pr-ai-review.mjs` behind secret; same-repo PRs only; caps and denylist as above.

## 10. Resolved decisions

| Topic           | Decision                                                                      |
| --------------- | ----------------------------------------------------------------------------- |
| Frontmatter     | See §5 matrix (`description` + `alwaysApply` required; optional `globs`).     |
| GH comment type | Issue comment, updated in place via marker.                                   |
| Fork PRs        | No automation unless a future hardened design is approved.                    |
| Model           | OpenAI-compatible v1; `AI_PR_REVIEW_API_KEY` + optional `AI_PR_REVIEW_MODEL`. |
