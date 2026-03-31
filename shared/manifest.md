# AI Config OS — Manifest

Personal AI behaviour layer. This repo provides shared skills, conventions, and plugin packaging for Claude Code and other AI agents.

## Skills

| Skill | Description | Path |
|---|---|---|
| `session-start-hook` | Validates plugin structure at session start in remote Claude Code environments | `shared/skills/session-start-hook/SKILL.md` |
| `web-search` | Search the web for current information and synthesize results | `shared/skills/web-search/SKILL.md` |
| `commit-conventions` | Surfaces Conventional Commits prefix rules and helps draft well-formed commit messages | `shared/skills/commit-conventions/SKILL.md` |
| `changelog` | Generate structured changelog entries from git history, grouping by conventional prefix and flagging breaking changes | `shared/skills/changelog/SKILL.md` |
| `code-review` | Perform structured code review with severity levels and actionable feedback | `shared/skills/code-review/SKILL.md` |
| `context-budget` | Guidelines for managing context window efficiently; when to use subagents and summarization | `shared/skills/context-budget/SKILL.md` |
| `debug` | Structured debugging loop for symptoms, errors, and stack traces; diagnoses root cause and fix | `shared/skills/debug/SKILL.md` |
| `explain-code` | Explain code snippets at varying depth (brief, detailed, architectural) | `shared/skills/explain-code/SKILL.md` |
| `git-ops` | Guards git operations and version bumping; ensures single source of truth for plugin.json | `shared/skills/git-ops/SKILL.md` |
| `pr-description` | Structured PR template and review guidance for pull request descriptions | `shared/skills/pr-description/SKILL.md` |
| `principles` | Surfaces the repo's opinionated AI behaviour defaults (communication, code, decision-making) | `shared/skills/principles/SKILL.md` |
| `plugin-setup` | Step-by-step guidance for creating and registering a new skill in this repo | `shared/skills/plugin-setup/SKILL.md` |
| `release-checklist` | End-to-end release workflow checklist: version bump, changelog, release commit, tag, push | `shared/skills/release-checklist/SKILL.md` |
| `skill-audit` | Audit skill library for completeness: check required fields, variants, tests, dependencies | `shared/skills/skill-audit/SKILL.md` |
| `task-decompose` | Decompose high-level tasks into concrete, measurable subtasks with acceptance criteria | `shared/skills/task-decompose/SKILL.md` |

| `memory` | Maintain persistent cross-session project context (decisions, patterns, known issues, workarounds) | `shared/skills/memory/SKILL.md` |
| `test-writer` | Generate comprehensive unit and integration tests from function/module code | `shared/skills/test-writer/SKILL.md` |
| `security-review` | Perform OWASP-aware security review of code, dependencies, and configuration | `shared/skills/security-review/SKILL.md` |
| `refactor` | Perform structured code refactoring with safety checks (extract-method, decompose, etc.) | `shared/skills/refactor/SKILL.md` |
| `review-pr` | Review incoming pull requests for correctness, breaking changes, test coverage, and security | `shared/skills/review-pr/SKILL.md` |
| `issue-triage` | Analyze and classify GitHub issues by severity, suggest labels, identify affected areas | `shared/skills/issue-triage/SKILL.md` |
| `simplify` | Review code for complexity reduction and removal of duplication/overengineering | `shared/skills/simplify/SKILL.md` |
| `task-start` | Silently begin a portable review task, detect capability mode, auto-save findings — works in any environment | `shared/skills/task-start/SKILL.md` |
| `task-resume` | Resume a task from any prior environment; presents findings as narrative, upgrades route with one "yes" | `shared/skills/task-resume/SKILL.md` |
| `task-save` | Explicitly checkpoint task state and emit a short URL for cross-device recovery | `shared/skills/task-save/SKILL.md` |
| `momentum-reflect` | Analyzes momentum narration effectiveness and proposes improvements | `shared/skills/momentum-reflect/SKILL.md` |
| `surface-probe` | Investigates environment signals when a user manually states their surface; produces a structured report to improve automatic platform detection | `shared/skills/surface-probe/SKILL.md` |
| `list-available-skills` | List skills available on the current surface, filtered by detected runtime capabilities. | `shared/skills/list-available-skills/SKILL.md` |
| `failed-build-analysis` | Queries failed CI/CD build jobs on an open PR, identifies root causes, and produces a KISS + TDD fix plan. | `shared/skills/failed-build-analysis/SKILL.md` |
| `ci-conditional-audit` | Audits GitHub Actions workflow files for unpaired conditional steps — flags steps that consume a conditional dependency's output but run unconditionally | `shared/skills/ci-conditional-audit/SKILL.md` |
| `lockfile-audit` | Scans the repo for package.json files missing a committed lockfile, cross-references deploy configs, and classifies severity as BLOCKING or WARNING | `shared/skills/lockfile-audit/SKILL.md` |
| `skill-effectiveness` | Reports which skills are most effective by analysing output-used vs output-replaced outcome data from the skill-outcome-tracker hook | `shared/skills/skill-effectiveness/SKILL.md` |
| `autoresearch` | Autonomously optimise any skill by running it repeatedly, scoring outputs against binary evals, mutating the prompt, and keeping improvements (Karpathy autoresearch methodology) | `shared/skills/autoresearch/SKILL.md` |
| `post-merge-retrospective` | Analyzes the session conversation after a PR merge to surface friction signals, recommend new skills, and emit a machine-readable JSON artifact | `shared/skills/post-merge-retrospective/SKILL.md` |
| `claude-md-creator` | Create, audit, and improve CLAUDE.md files and their referenced documentation | `shared/skills/claude-md-creator/SKILL.md` |
| `fetch-abstraction-drift-detector` | Detects contract drift when a fetch/API client abstraction changes — cross-references component call sites, prop names, URL patterns, and response envelope shapes against test mock fixtures | `shared/skills/fetch-abstraction-drift-detector/SKILL.md` |
| `rtl-query-patterns` | Authoritative reference for React Testing Library query semantics — resolves which matcher to use and why an assertion isn't finding its element, without a test run | `shared/skills/rtl-query-patterns/SKILL.md` |
| `pr-diff-targeted-reader` | Reads a targeted subset of PR-changed files without hitting token limits — identifies relevant files from a focus hint and fetches only those via get_file_contents | `shared/skills/pr-diff-targeted-reader/SKILL.md` |

## Workflows

| Workflow | File | Format | Composed Skills | Description |
|---|---|---|---|---|
| `daily-brief` | `shared/workflows/daily-brief.json` | JSON | git-ops, changelog, memory, task-decompose | Morning standup: synthesize recent changes, open issues, blocked work |
| `pre-commit` | `shared/workflows/pre-commit.json` | JSON | security-review, code-review, commit-conventions | Quality gate before committing: security + code quality + conventions |
| `code-quality` | `shared/workflows/code-quality/workflow.json` | JSON | code-review, debug, explain-code | Full code quality loop: review, debug, and explain code changes |
| `release-agent` | `shared/workflows/release-agent/workflow.json` | JSON | git-ops, commit-conventions, changelog, release-checklist | End-to-end release workflow: version bump, changelog generation, release commit, and quality checklist |
| `research-mode` | `shared/workflows/research-mode/workflow.json` | JSON | web-search | Deep research persona for comprehensive information synthesis |

## Plugins

| Plugin | Skills | Description |
|---|---|---|
| `core-skills` | All skills in `shared/skills/` | Foundational skills for Claude Code sessions |

## Conventions

- **Author skills in** `shared/skills/<name>/SKILL.md` — never edit directly inside `plugins/`
- **Symlinks** (Unix only, optional) connect `plugins/core-skills/skills/<name>` → `../../../shared/skills/<name>`
- **Version bumps** are required in `plugins/core-skills/.claude-plugin/plugin.json` after any skill change
- **Naming**: use kebab-case for skill directory names
- **Template**: new skills should follow the structure in `shared/skills/_template/SKILL.md`

## Tools

| Tool ID | Adapter | Description |
|---|---|---|
| `claude-code` | cli | Primary AI coding assistant |
| `cursor` | file | AI code editor (Agent Skills tree under dist/clients/cursor/skills; optional legacy .cursorrules) |
| `codex` | shell | OpenAI coding assistant |
