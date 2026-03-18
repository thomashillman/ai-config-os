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

## Workflows

| Workflow | Composed Skills | Description |
|---|---|---|
| `daily-brief` | git-ops, changelog, memory, task-decompose | Morning standup: synthesize recent changes, open issues, blocked work |
| `pre-commit` | security-review, code-review, commit-conventions | Quality gate before committing: security + code quality + conventions |

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
| `cursor` | file | AI code editor (.cursorrules injection) |
| `codex` | shell | OpenAI coding assistant |
