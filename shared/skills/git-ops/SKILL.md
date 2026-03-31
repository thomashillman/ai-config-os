---
skill: "git-ops"
description:
  "Guards and guides git operations for this repo, especially version bumping.

  Ensures single-source-of-truth for monotonically-incrementing values like plugin.json.\n"
type: "hook"
status: "stable"
inputs:
  - name: "operation"
    type: "string"
    description: "Git operation being performed: bump-version, rebase-session, etc."
    required: true
  - name: "file"
    type: "string"
    description: "File being modified (e.g., plugins/core-skills/.claude-plugin/plugin.json)"
    required: false
  - name: "new_value"
    type: "string"
    description: "New value being set (e.g., version string)"
    required: false
outputs:
  - name: "guard_result"
    type: "object"
    description: "Approval, computed value, or warning; { allowed: bool, value?: string, warning?: string }"
dependencies:
  skills: []
  apis: []
  models:
    - "sonnet"
examples:
  - input: "operation: bump-version, file: plugin.json, new_value: 0.3.2"
    output: "{ allowed: true, value: '0.3.2', warning: null }"
    expected_model: "sonnet"
variants:
  sonnet:
    prompt_file: "prompts/balanced.md"
    description: "Guard logic for git operations"
    cost_factor: 1
    latency_baseline_ms: 300
  fallback_chain:
    - "sonnet"
tests:
  - id: "test-version-bump-guard"
    type: "structure-check"
    input: "operation: bump-version, file: plugin.json"
    expected_substring: "origin/main"
    models_to_test:
      - "sonnet"
composition: {}
docs:
  auto_generate_readme: true
  sections_to_include:
    - "description"
    - "examples"
  help_text: "Guard git operations and validate version bumps"
  keywords:
    - "git"
    - "version"
    - "guard"
    - "plugin.json"
monitoring:
  enabled: false
  track_metrics: []
version: "1.0.0"
changelog:
  1.0.0: "Initial release"
tags:
  - "utility"
  - "core"
  - "guards"
capabilities:
  required:
    - "git.read"
  optional:
    - "git.write"
    - "fs.read"
    - "shell.exec"
  fallback_mode: "manual"
  fallback_notes: "Can advise steps from pasted repo state."
platforms:
  claude-web:
    mode: "excluded"
    notes: "No hook surface"
  claude-ios:
    mode: "excluded"
    notes: "No hook surface"
  cursor:
    mode: "excluded"
    notes: "No hook surface"
  codex:
    mode: "excluded"
    notes: "No hook packaging in v0.5.2"
---

# git-ops

Guard git operations, especially version bumping in shared files like `plugin.json`.

Ensures that monotonically-incrementing values (version, etc.) derive from `origin/main` at the moment of the bump, not from the working tree. This prevents merge conflicts and race conditions when multiple agent sessions operate on the same repo.

## When to use

- **Before bumping `plugin.json` version**: ask git-ops what the next version should be (derives from `origin/main`, not local tree)
- **At session start**: ask git-ops to validate whether a rebase onto `origin/main` is safe
- **Before committing changes to shared files**: ask git-ops if the change conflicts with recent main commits

## Instructions

When called with `operation: bump-version`:

1. Fetch `origin/main` to get latest state
2. Read the current version from `git show origin/main:<file>`
3. Parse the version string (semver format: MAJOR.MINOR.PATCH)
4. Increment the patch component (or ask user for major/minor bump preference)
5. Return `{ allowed: true, value: "<incremented>", warning: null }` (no conflicts detected)
6. If multiple `claude/` branches are known to be open and also modifying the same file, return `{ allowed: false, warning: "Race condition: multiple sessions open. Escalate to user." }`

When called with `operation: rebase-session`:

1. Check if the current branch has uncommitted changes → warn user
2. Check if the branch is already rebased onto `origin/main` → skip if true
3. Check if there are 5+ commits with likely conflicts → ask user for merge instead
4. Check if another person/agent has been tracking the branch → warn about force-push
5. If safe, return `{ allowed: true, warning: null }`

When called with `operation: validate-file`:

1. Check if the file exists on `origin/main`
2. Check if there are recent edits to that file on `origin/main` (within last 3 commits)
3. If yes, hint that a rebase may surface new conflicts
4. Return status for user decision

## Examples

### Example 1: Bump plugin.json for a new skill

**Input:** `operation: bump-version, file: plugins/core-skills/.claude-plugin/plugin.json`

**Output:**

```
{
  allowed: true,
  value: "0.3.3",
  warning: null,
  rationale: "origin/main is at 0.3.2; incremented patch to 0.3.3"
}
```

### Example 2: Session start, rebase requested

**Input:** `operation: rebase-session, branch: claude/my-feature, commits: 3`

**Output:**

```
{
  allowed: true,
  warning: null,
  rationale: "Branch has 3 commits, no tracked reviews. Safe to rebase."
}
```

### Example 3: Multiple sessions race condition

**Input:** `operation: bump-version, file: plugin.json, known_open_branches: [claude/feature-a, claude/feature-b]`

**Output:**

```
{
  allowed: false,
  warning: "Two or more claude/ branches are open and likely to compete for the same version number. Defer to user to choose bump strategy.",
  value: null
}
```
