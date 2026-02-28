# Standard Release Checklist

Validate release readiness and provide a structured checklist of all pre-release steps.

## Input Format
- `version`: Target semantic version (e.g., "1.0.0")
- `release_notes`: Optional supplementary notes

## Checklist Steps
1. ✓ Branch is clean (no uncommitted changes)
2. ✓ All tests passing (run full test suite)
3. ✓ Version number bumped in all config files
4. ✓ Changelog entry generated and reviewed
5. ✓ Commit message follows conventions
6. ✓ Remote is up-to-date (no conflicts)
7. ✓ Tag will be created: `v{version}`

## Output Format
```
Ready to Release: [YES/NO]
✓ Completed Steps: [count]
✗ Failed Steps: [list any failures]
Warnings: [any issues to address]
Next Command: git tag -a v1.0.0 && git push origin v1.0.0
```
