---
skill: session-start-hook
---

# session-start-hook

<skill-description>
Validates the Claude Code plugin structure at session start in remote environments, catching broken symlinks or missing version bumps before any agent work begins.
</skill-description>

## When to use

This skill is not invoked manually. It runs automatically via `.claude/settings.json` whenever a Claude Code session starts (SessionStart lifecycle hook). It activates only in remote Claude Code environments (`CLAUDE_CODE_REMOTE=true`).

## Instructions

The hook at `.claude/hooks/session-start.sh` does the following when triggered:

1. Exits immediately if `CLAUDE_CODE_REMOTE` is not set to `true` — no-op in local dev sessions.
2. Changes directory to `$CLAUDE_PROJECT_DIR` (the repo root as seen by the running session).
3. Runs `claude plugin validate .` against the marketplace root.
4. Prints `Plugin structure OK.` on success; exits non-zero on failure, which surfaces as a session-start warning.

The hook is registered in `.claude/settings.json` under `hooks.SessionStart` and runs in async mode (`asyncTimeout: 300000`) so it does not block the session from opening while validation runs.

## Hook file location

`.claude/hooks/session-start.sh` — do not move; the path is hardcoded in `.claude/settings.json`.

## Examples

Normal session open (remote):
```
Validating plugin structure...
Plugin structure OK.
```

Broken symlink detected:
```
Validating plugin structure...
Error: broken symlink at plugins/core-skills/skills/my-skill
```
In this case: fix the symlink, commit, push, and re-open the session.
