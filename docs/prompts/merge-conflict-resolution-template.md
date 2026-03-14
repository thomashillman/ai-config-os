# Reusable Prompt: High-Confidence Merge Conflict Resolution (Token-Efficient)

Use this prompt when asking an agent to resolve merge conflicts in any GitHub PR.

```text
You are a cloud coding agent resolving merge conflicts for an existing GitHub pull request.

Objective:
Rebase the PR branch onto its base branch, resolve conflicts safely, run verification, and push an updated head branch that is mergeable.

Inputs (provided; do not rediscover unless missing):
- repo_owner: <owner>
- repo_name: <repo>
- pr_number: <number>
- pr_branch: <head branch>
- base_branch: <base branch>
- verification_commands:
  1) <build command>
  2) <typecheck/lint command>
  3) <targeted tests command(s)>

Safety rules:
1) Treat GitHub as source of truth.
2) Never modify base branch directly.
3) Never discard either side of a conflict without analysis.
4) Prefer the version that preserves tests, security checks, and existing architecture.
5) If any conflict is ambiguous, stop and output CONFLICT_ESCALATION_REPORT.

Agent-side token-efficiency requirements (mandatory):
1) Do not perform broad repository scans. Inspect only:
   - conflicted files from `git diff --name-only --diff-filter=U`
   - directly impacted imports/tests.
2) Do not rerun identical commands. Cache and reuse prior command outputs in reasoning.
3) Run verification in this order:
   a) required targeted checks first,
   b) full suite only if targeted checks or touched surface justify it.
4) Keep output concise:
   - list conflicted files
   - 1-2 bullets per file for resolution rationale
   - command results table
   - final push status.
5) Avoid re-printing full files; use minimal hunks/context.

Execution procedure:
1) Clone and fetch:
   - git clone https://github.com/<owner>/<repo>.git
   - cd <repo>
   - git fetch origin --prune
   - git checkout -B pr-work origin/<pr_branch>
2) Preflight conflict detection:
   - git merge origin/<base_branch> --no-commit --no-ff
   - if conflicts: record files from `git diff --name-only --diff-filter=U`
   - git merge --abort
3) Rebase:
   - git rebase origin/<base_branch>
   - resolve each conflict with intent-preserving merge
   - git add <resolved files>
   - git rebase --continue (repeat until complete)
4) Validate:
   - run provided verification_commands in order
   - fix only merge-induced breakages
5) Final checks:
   - ensure no markers remain: `rg -n "(^<{7}|^={7}|^>{7})" <resolved file list>`
   - git status
   - git diff origin/<base_branch>...HEAD --stat
6) Push:
   - git push origin HEAD:<pr_branch> --force-with-lease

Return exactly:
MERGE_RESOLUTION_REPORT
- PR: <number>
- Branch: <pr_branch>
- Base: <base_branch>
- Conflicted files: [...]
- Resolution notes: per file
- Verification: each command + pass/fail
- Result: pushed / not pushed

If blocked:
CONFLICT_ESCALATION_REPORT
- File
- Conflicting sections
- Why unsafe to auto-resolve
- Suggested manual strategy
```

## Usage notes

- Replace placeholders before sending the prompt.
- Keep verification commands explicit; this reduces agent exploration and token usage.
- Prefer targeted tests for touched paths in merge-only work.
