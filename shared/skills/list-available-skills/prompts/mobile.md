# list-available-skills — mobile prompt

You are helping a user on an iOS or mobile surface discover available skills.

On mobile, slash commands are not supported. Present skills as reference content
the user can invoke by describing them in natural language (e.g. "run a code review"
instead of `/code-review`).

## Step 1: Read runtime data

Read these two files:

1. **Capability probe** — `~/.ai-config-os/probe-report.json`
   - Provides: `platform_hint`, `surface_hint`, per-capability status
   - If missing: treat all skills as available; note that probe data is unavailable

2. **Skill manifest** — `~/.ai-config-os/cache/claude-code/latest.json`
   - Provides: `skills[]` array with `id`, `description`, `capabilities.required`,
     `capabilities.optional`, `capabilities.fallback_mode`
   - If missing: report that the manifest cache is not available

## Step 2: Classify skills

- **Usable**: all `required` caps met, OR a `fallback_mode` is set (`prompt-only` / `manual`)
- **Excluded**: ≥1 `required` cap not supported AND no `fallback_mode`

Count excluded skills for the trailing note. Do not list them individually.

## Step 3: Assign usable skills to categories

Read each skill's `description` field from the manifest and assign it to the most
appropriate category. Do **not** use hardcoded membership lists — classify purely
from the skill's description so new skills are picked up automatically.

Sort categories alphabetically. Sort skills within each category alphabetically.
Omit any category that has zero usable skills. If a skill fits no category well,
create a new one using the same format.

| Category | Tagline | Classify here when the skill… |
|---|---|---|
| **Code Quality & Review** | Review, refactor, test, and secure your codebase | reviews, refactors, tests, or audits code quality or security |
| **Debugging & Explanation** | Diagnose failures, explain code, analyse CI logs | diagnoses errors, explains code behaviour, or analyses failures |
| **Git & CI/CD** | Commit, review PRs, release, and track changes | involves commits, PRs, changelogs, releases, or CI pipelines |
| **Planning & Tasks** | Break down, start, save, and resume work sessions | decomposes, starts, saves, resumes, or triages tasks or issues |
| **Research & Reference** | Search the web, manage context and token budget | searches the web, manages context, or surfaces reference material |
| **Skills & Configuration** | Discover, audit, and configure your AI skills layer | manages skills, configuration, sessions, or AI tooling itself |

## Step 4: Present the output

Open with a one-line surface header, then render each category block, then the
excluded note (if non-zero).

**Surface header:**
```
Surface: <surface_hint> (<platform_hint>)
```

**Per category:**
```
**<Category Name>**
<Tagline>
`<skill-a>`, `<skill-b>`, `<skill-c>`
```

One blank line between category blocks.

**Trailing excluded note** (omit if count is zero):
```
> <N> skill(s) excluded on this surface — require shell or filesystem access not available on iOS.
```

### Example output

```
Surface: mobile-app (claude-ios)

**Code Quality & Review**
Review, refactor, test, and secure your codebase
`code-review`, `refactor`, `security-review`, `simplify`, `test-writer`

**Debugging & Explanation**
Diagnose failures, explain code, analyse CI logs
`debug`, `explain-code`, `failed-build-analysis`

**Git & CI/CD**
Commit, review PRs, release, and track changes
`changelog`, `commit-conventions`, `git-ops`, `pr-description`, `release-checklist`, `review-pr`

**Planning & Tasks**
Break down, start, save, and resume work sessions
`issue-triage`, `task-decompose`, `task-resume`, `task-save`, `task-start`

**Research & Reference**
Search the web, manage context and token budget
`context-budget`, `web-search`

**Skills & Configuration**
Discover, audit, and configure your AI skills layer
`list-available-skills`, `memory`, `momentum-reflect`, `plugin-setup`, `principles`, `session-start-hook`, `skill-audit`, `surface-probe`

> 3 skills excluded on this surface — require shell or filesystem access not available on iOS.
```
