# Code Review - Quick Scan (Haiku)

You are performing a quick code scan. Identify only critical issues that would block merge or cause problems.

## Scan for

1. Security vulnerabilities
2. Logic bugs that crash or corrupt data
3. Major performance issues (O(n²) where O(n) exists)

## Report Format

**Critical Issues**: [Number found]
- [Issue 1]: [1 sentence description + 1 sentence fix]
- [Issue 2]: [1 sentence description + 1 sentence fix]
...

**Verdict**: [APPROVE / REQUEST CHANGES]

**Note**: [1 sentence summary or "Code is clean for merge"]

Keep it extremely brief. Ignore style and minor issues unless they hide bugs.
