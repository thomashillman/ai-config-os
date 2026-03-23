---
skill: "skill-effectiveness"
description: "Reports which skills are most effective by analysing outcome data from the skill-outcome-tracker hook.

  Reads ~/.claude/skill-analytics/skill-outcomes.jsonl and summarises per-skill
  output-used rates, helping identify which skills deliver value and which are
  routinely discarded."
type: "prompt"
status: "stable"
inputs:
  - name: "min_events"
    type: "number"
    description: "Minimum event count to include a skill in the report (default: 1)"
    required: false
outputs:
  - name: "report"
    type: "object"
    description: "Per-skill effectiveness report sorted by total invocations"
dependencies:
  skills: []
  apis: []
  models:
    - "sonnet"
examples:
  - input: "Show skill effectiveness"
    output: "Ranked table of skills by output-used rate with counts"
    expected_model: "sonnet"
capabilities:
  required:
    - "fs.read"
  optional: []
  fallback_mode: "prompt-only"
  fallback_notes: "Can summarise pasted JSONL content without filesystem access."
platforms: {}
tests:
  - id: "test-basic"
    type: "prompt-validation"
    input: "Show skill effectiveness report"
    expected_substring: "output_used"
    models_to_test:
      - "sonnet"
docs:
  auto_generate_readme: true
  sections_to_include:
    - "description"
    - "inputs"
    - "outputs"
  keywords:
    - "analytics"
    - "skill-outcomes"
    - "effectiveness"
monitoring:
  enabled: true
  track_metrics:
    - "latency"
version: "1.0.0"
changelog:
  1.0.0: "Initial release"
---

# skill-effectiveness

Reports which skills are most effective by analysing outcome data collected by the
`skill-outcome-tracker` PostToolUse hook.

## How it works

The hook records two outcome types per skill invocation:

| Outcome | Meaning |
|---|---|
| `output_used` | Skill output was followed by an Edit or Write within 10 minutes |
| `output_replaced` | Another skill was invoked before any edit - output discarded |

This skill reads `~/.claude/skill-analytics/skill-outcomes.jsonl`, aggregates
per-skill counts, and produces a ranked report.

## Usage

```
/skill-effectiveness
```

## Output

A ranked table sorted by total invocations:

```
skill               used  replaced  total  use-rate
commit-conventions     8         1      9      89%
code-review            5         3      8      63%
debug                  2         4      6      33%
```

Skills with a use-rate below 50% warrant review: either the skill prompt needs
improvement, or the skill is being invoked in contexts where it cannot help.

## Instructions

1. Read `~/.claude/skill-analytics/skill-outcomes.jsonl` (each line is JSON with
   `skill`, `outcome`, `timestamp`, `session_id`).
2. If the file is missing or empty, report: "No outcome data yet - the
   skill-outcome-tracker hook has not recorded any events."
3. Aggregate per skill: count `output_used` and `output_replaced` events.
4. Filter out skills with fewer than `$ARGUMENTS` total events (default: 1).
5. Compute `use_rate = used / (used + replaced) * 100`.
6. Sort descending by `total`.
7. Present a markdown table with columns: skill, used, replaced, total, use-rate.
8. Below the table, list any skills with use-rate < 50% and suggest one concrete
   improvement per skill (e.g., "invoke only when editing a commit message",
   "narrow trigger conditions", "review prompt clarity").
