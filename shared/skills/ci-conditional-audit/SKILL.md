---
skill: ci-conditional-audit
description: |
  Audits GitHub Actions workflow files for unpaired conditional steps.
  When a step is guarded by an `if:` condition or `outputs.changed` flag,
  checks that all downstream steps depending on its side effects carry the
  same (or a compatible) guard. Flags any step that consumes an artifact,
  binary, or directory produced by a conditional step but runs unconditionally.
  Use when: (1) a CI step was made conditional (e.g. skip installs when nothing
  changed) but its downstream consumers were not updated; (2) a CI job fails
  intermittently — succeeds on full runs but fails when a conditional step is
  skipped; (3) reviewing a PR that modifies a workflow file. Not useful for
  diagnosing failures unrelated to conditional guards.

type: prompt
status: stable

capabilities:
  required: []
  optional:
    - fs.read
    - shell.exec
  fallback_mode: prompt-only
  fallback_notes: "User can paste workflow YAML directly; the skill parses it without local file access."

platforms: {}

inputs:
  - name: workflow_path
    type: string
    description: "Path to a workflow file or glob (e.g. .github/workflows/*.yml). Defaults to all workflows in the repo."
    required: false

outputs:
  - name: audit_report
    type: string
    description: Severity-ranked list of unpaired conditional steps with suggested fixes and a summary table.

dependencies:
  skills: []
  apis: []
  models:
    - sonnet

examples:
  - input: "Audit .github/workflows/build.yml for unpaired conditionals"
    output: "BLOCKING: step 'Verify dashboard build' depends on node_modules installed by 'Install dashboard deps' (guarded by dashboard-check.outputs.changed) but runs unconditionally."
    expected_model: sonnet
  - input: "Check all workflows for conditional step mismatches"
    output: "Files audited: 3  |  Findings: 0 — All conditional steps are correctly paired."
    expected_model: haiku

variants:
  sonnet:
    prompt_file: prompts/balanced.md
    description: Default — thorough analysis with clear remediation for each finding
    cost_factor: 1.0
    latency_baseline_ms: 400
  haiku:
    prompt_file: prompts/brief.md
    description: Fast pass for simple workflows with few conditional steps
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain:
    - sonnet
    - haiku

tests:
  - id: detects-unpaired-conditional
    type: prompt-validation
    input: "Audit .github/workflows/build.yml"
    expected_substring: "unpaired"
    models_to_test:
      - sonnet
  - id: handles-clean-workflow
    type: prompt-validation
    input: "Check all workflows for conditional mismatches"
    expected_not_null: true
    models_to_test:
      - sonnet

docs:
  auto_generate_readme: true
  sections_to_include:
    - description
    - inputs
    - outputs
    - examples
  help_text: "Audit {workflow_path} for steps that depend on a conditional step's side effects but run unconditionally."
  keywords:
    - ci
    - github-actions
    - conditional
    - workflow
    - dependency
    - audit

monitoring:
  enabled: true
  track_metrics:
    - latency
    - token_count
    - cost
  alert_threshold_latency_ms: 5000
  public_metrics: false

version: "1.0.0"
changelog:
  "1.0.0": "Initial release — detects unpaired conditional steps in GitHub Actions workflows"

tags:
  - ci
  - github-actions
  - audit
  - workflow
---

# ci-conditional-audit

Audits GitHub Actions workflow files for unpaired conditional steps — where a step
is guarded by an `if:` condition but a downstream step that depends on its output
or side effects runs unconditionally. Catches the class of error where a CI
optimization is applied to only one half of a dependency pair.

## When to use

- After adding a change-detection conditional to a CI step (e.g. skip installs when
  nothing changed)
- When a CI job fails intermittently because a conditional step was skipped but its
  consumer ran
- As a pre-merge review step for any workflow file changes
- Invoke manually with `/ci-conditional-audit [workflow_path]`

Auto-invoke when user says:
- "check for unpaired conditionals in CI"
- "why does the verify step fail when nothing changed?"
- "audit our workflows for broken conditional guards"

## Instructions

### Step 0 — Gather workflow files

**If `shell.exec` is available:**
```bash
find .github/workflows -name "*.yml" -o -name "*.yaml" | sort
```

**If `fs.read` is available:** read files from the path given (default: `.github/workflows/*.yml`).

**If neither is available:** ask the user to paste the relevant workflow YAML.

---

### Step 1 — Parse conditional steps

For each workflow file, for each job, walk the `steps` array in order.

For each step, check if it is **conditional**:
- Has an `if:` key
- References `steps.<id>.outputs.<key>` or `needs.<id>.outputs.<key>` in its `if:` or `run:`

For each conditional step, extract its **side effects** — what it creates or installs:
- Directories (e.g. `node_modules/`, `dist/`, installed binaries in PATH)
- Environment variables (`echo "VAR=val" >> $GITHUB_ENV`)
- Step output variables (`echo "name=value" >> $GITHUB_OUTPUT`)
- Uploaded artifacts (`actions/upload-artifact`)
- Files explicitly written

Record:
```
{step_id, step_name, condition_expression, produces: [list of side effects]}
```

---

### Step 2 — Find unpaired dependents

For each step that follows a recorded conditional step in the same job:

1. **Does it consume** any side effect?
   - Calls a binary or uses a path installed by the conditional step
   - References `steps.<conditional_id>.outputs.<key>`
   - Uses an env var set by the conditional step
   - Downloads an artifact uploaded by the conditional step

2. **Does it have a compatible guard?**
   - Same `if:` expression (exact or logically equivalent)
   - A stricter subset condition is acceptable; missing condition is not
   - `if: always()` is NOT a compatible guard — it does not ensure the dependency ran

**Flag** any consuming step that lacks a compatible guard. This is an **unpaired conditional**.

---

### Step 3 — Classify severity

| Severity | When |
|----------|------|
| **BLOCKING** | Consuming step will hard-fail — binary not installed, file not created |
| **SILENT FAILURE** | Consuming step may succeed vacuously (e.g. test runner finds no tests) |
| **WARNING** | Consuming step has optional access to the side effect; output may be degraded |

---

### Step 4 — Report

#### FINDINGS

One block per unpaired conditional:

```
File: .github/workflows/<name>.yml
Job: <job_id>
Guarded step:    "<step_name>" [line N]
  Condition:     if: <expression>
  Produces:      <list of side effects>
Unpaired step:   "<step_name>" [line M]
  Severity:      BLOCKING | SILENT FAILURE | WARNING
  Why:           <one sentence — what breaks and when>
Suggested fix:   Add `if: <expression>` to the unpaired step, OR move both steps
                 into a dedicated conditional job.
```

#### SUMMARY

```
Files audited: N  |  Jobs scanned: N  |  Findings: N (BLOCKING: N, SILENT FAILURE: N, WARNING: N)
```

If no findings: `All conditional steps are correctly paired.`

---

## Gotchas

- **`if: always()`** — runs regardless of prior step outcomes; it is NOT a compatible
  guard for a conditional dependency. Flag it as SILENT FAILURE.
- **`continue-on-error: true`** — may hide a failure; flag as WARNING if the step
  consumes a conditional dependency.
- **Reusable workflows** (`uses: ./.github/workflows/reusable.yml`) — the `with:`
  inputs are consumed by the called workflow; treat the `uses:` step as the consumer.
- **Matrix jobs** — each cell is an independent execution. Conditionals in one cell
  do not carry over to another.
- **Composite actions** — if the conditional step calls a composite action that does
  the installing, the side effects are internal to that action. Note this in the
  report and flag for manual review.

## Examples

### Example 1 — Unpaired install step (the original bug)

**Input:** `.github/workflows/build.yml`:
```yaml
- name: Check dashboard changed
  id: dashboard-check
  run: echo "changed=true" >> $GITHUB_OUTPUT

- name: Install dashboard deps
  if: steps.dashboard-check.outputs.changed == 'true'
  run: npm --prefix dashboard install

- name: Verify dashboard build
  run: npm --prefix dashboard run build
```

**Output:**
```
FINDINGS

File: .github/workflows/build.yml
Job: build
Guarded step:    "Install dashboard deps" [line 9]
  Condition:     if: steps.dashboard-check.outputs.changed == 'true'
  Produces:      dashboard/node_modules/
Unpaired step:   "Verify dashboard build" [line 14]
  Severity:      BLOCKING
  Why:           `npm run build` requires dashboard/node_modules which is only
                 installed when the guarded step runs; skipping the install
                 causes MODULE_NOT_FOUND errors in the verify step.
Suggested fix:   Add `if: steps.dashboard-check.outputs.changed == 'true'`
                 to "Verify dashboard build".

SUMMARY
Files audited: 1  |  Jobs scanned: 1  |  Findings: 1 (BLOCKING: 1)
```

### Example 2 — No issues

**Output:**
```
SUMMARY
Files audited: 2  |  Jobs scanned: 4  |  Findings: 0
All conditional steps are correctly paired.
```
