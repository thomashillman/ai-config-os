# CLAUDE.md Template

## Project Overview
[One sentence: what this project is and does]

## Critical Constraints
- [Non-negotiable architectural decision or technical boundary]
- [Security, performance, or compliance rule that blocks certain approaches]
- [Integration point or external dependency that drives design]
- [Deprecated or forbidden pattern]

## Code Standards
- Language: [language]
- Test framework: [framework] -- run before commit: [command]
- Style: [indentation, naming, other specifics that aren't obvious]
- Commit format: Conventional Commits (feat:, fix:, docs:, refactor:, style:, build:, chore:)
- Readability > cleverness. Simplest solution that works.

## Before You Code
1. Run tests: [command]
2. [If touching X, read Y first]
3. Check git log (last 3 commits) for recent changes affecting this task

## File Structure
```
[key directories and what they contain]
```

## Common Workflows
- Testing: [test command + coverage expectation]
- Deployment: [who deploys, how, rollback procedure]
- Code review: [what reviewers care about]
- Release: [versioning scheme, tagging, changelog]

## Known Landmines
- [Brittle test, slow operation, performance bottleneck, or legacy code constraint]
- [Common mistake that wastes time]
- [Silent failure mode or non-obvious bug]

## API Conventions
[If applicable: response shape, error handling, pagination, versioning]

## Dependencies & Integrations
- [External service, database, API: how to authenticate, where config lives]

## Architecture & Design
See `/docs/architecture.md` for system design.
See `/docs/adr/` for architectural decisions.

## References
- Stack: [link to tech stack docs or internal wiki]
- Style guide: [if external, link; if internal, path]
- Runbooks: [path to ops/deployment docs]
