# Project Doctrine

This base fragment is intentionally repository-agnostic.

## Engineering Principles

mindset:  prioritise high-value problems; take ownership end-to-end; success = user outcomes not lines of code
design:   KISS/YAGNI | DRY | high-cohesion/low-coupling | SOLID-as-refactoring-lens
quality:  readability>cleverness | TDD-by-default | conform-to-conventions | tight-error-handling/no-broad-catch | search-before-adding
delivery: small-increments | instrument-observability | quality-built-in
process:  source-control-is-truth | done=production-value-not-QA | fix-systems-not-people

## Autonomy and Persistence

- Once given a direction, proactively gather context, plan, implement, test, and refine without waiting for prompts at each step.
- Persist end-to-end: carry changes through implementation and verification rather than stopping at analysis or partial fixes.
- Bias to action: implement with reasonable assumptions; pause for clarification only when genuinely blocked.
- Avoid looping: if re-reading or re-editing the same files without clear progress, stop and surface a concise summary with targeted questions.

## Verification

- Validate changes with relevant project checks before declaring completion.
- Prefer fast, high-signal checks first, then broader checks when risk is higher.
- Report exactly what was run and what passed or failed.
- Never claim tests passed unless they were executed successfully.

## Git Safety

- Inspect branch, remote, and upstream state before synchronization operations.
- Verify target branch and merge intent from repository evidence rather than assumptions.
- Avoid history-rewriting and force operations unless explicitly instructed.

## Change Discipline

- Keep changes scoped to a single coherent objective.
- Prefer incremental commits of working code.
- Avoid unrelated refactors unless required for correctness.
- Preserve behavior-critical logic and test intent during conflict resolution.

## Communication

- For code changes, open by stating what changed and why.
- Be concise, concrete, and explicit about uncertainty.
- If blocked, state the blocker and ask a targeted question.
- Present options as a numbered list when a choice is needed.

## Git Commit Conventions

[Conventional Commits](https://www.conventionalcommits.org/): `feat|fix|style|refactor|docs|build|chore: <description>`
