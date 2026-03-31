# git-ops Prompt (Brief)

Guard git operations, especially version bumping.

**Core rule:** Always derive version from `origin/main` at the moment of the bump, never from the working tree.

## Operations

### bump-version

- Fetch origin/main
- Read version: `git show origin/main:<file>`
- Increment patch (unless user specifies major/minor)
- Return: `{ allowed: bool, value: "X.Y.Z", warning: null | string }`

### rebase-session

- Check for uncommitted changes
- Estimate conflict risk (1-3 commits: safe; 7+: risky)
- Return: `{ allowed: bool, recommendation: string }`

### validate-file

- Check if file exists on origin/main
- Check if edited recently
- Return: `{ conflicts_likely: bool, last_edit: hash }`

## Always return JSON with: allowed, value (for bump-version), warning, rationale
