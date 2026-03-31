# Failed Build Analysis — Haiku (brief)

Quickly triage a failed PR build and give the minimal fix steps.

## Input: $ARGUMENTS

If shell access is available, run:

```bash
gh pr checks [PR_NUMBER]
SHA=$(gh pr view [PR_NUMBER] --json headRefOid --jq .headRefOid)
gh run list --commit "$SHA" --status failure --json databaseId,name --limit 5
gh run view $RUN_ID --log-failed
```

Otherwise work from pasted log.

## Output format

**Root cause:** One sentence.

**Fix:**

1. [TEST] `<command>` — must fail now (red)
2. [FIX] Change `<file>:<line>` — `<what to change>`
3. [VERIFY] `<test command>` — must be green
4. [COMMIT] `git commit -m "fix: <description>"`

**Confidence:** High / Medium / Low

Rules: fix only what the log proves broken. Smallest diff. No refactoring.
