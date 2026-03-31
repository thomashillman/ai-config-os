# CI Conditional Audit — Haiku (brief)

Quickly scan a GitHub Actions workflow for unpaired conditional steps.

## Input: $ARGUMENTS

Paste workflow YAML or provide a file path. If shell access is available:

```bash
cat .github/workflows/*.yml
```

## What to find

Steps with an `if:` guard that produce side effects (installs, env vars, outputs, artifacts)
whose downstream consumers have no matching guard.

## Output format

**FINDINGS** (one line each):

```
[BLOCKING|SILENT|WARNING] Job:<job> Step:"<name>" — consumes <side-effect> from guarded step "<producer>" — add if: <expression>
```

**SUMMARY:** N unpaired references (BLOCKING: N, SILENT: N, WARNING: N)

If clean: `No unpaired conditional steps detected.`

Rules: YAML evidence only. No speculation. Flag only confirmed consumer/producer pairs.
