---
# Identity
skill: failed-build-analysis
description: |
  Queries failed CI/CD build jobs on an open PR, identifies the root cause of each failure,
  and produces a KISS + TDD implementation plan to fix them.
  Auto-invoked when a user mentions a failing build, broken CI, or failed PR checks.

type: prompt
status: stable

# Invocation
invocation: /failed-build-analysis

# Capability contract
capabilities:
  required: []
  optional:
    - shell.exec
    - network.http
    - git.read
    - env.read
  fallback_mode: prompt-only
  fallback_notes: |
    Without shell/network access, paste the full build log or error output and the skill
    will still diagnose and plan a fix. On Codex and other sandbox environments the
    prompt-only path is the default.

# Platform overrides
platforms:
  cursor:
    mode: native
    notes: Works via pasted log input; no terminal access required.
  claude-web:
    allow_unverified: true
    mode: degraded
    notes: Prompt-only; paste build logs directly.

# Inputs
inputs:
  - name: pr
    type: string
    description: >
      PR number, URL, or branch name. If omitted, uses the current branch's open PR.
    required: false
  - name: log_paste
    type: string
    description: >
      Paste raw CI/build log output directly. Used when shell/network access is unavailable.
    required: false
  - name: focus
    type: string
    description: >
      Optional filter: "test", "lint", "build", "deploy", or "all" (default).
    required: false

# Outputs
outputs:
  - name: failure_summary
    type: string
    description: Concise root-cause summary for each failed job.
  - name: fix_plan
    type: string
    description: KISS + TDD step-by-step implementation plan ordered by dependency.

# Dependencies
dependencies:
  skills: []
  apis:
    - gh-cli
    - github-actions
  models:
    - sonnet
    - opus

# Examples
examples:
  - input: "/failed-build-analysis 142"
    output: >
      Root cause: test suite fails because `getUserById` mock is missing in 3 test files.
      Fix plan: 1. Write failing unit tests that demonstrate the missing mock. 2. Add mock
      factory. 3. Verify green. 4. Commit.
    expected_model: sonnet
  - input: "Build is failing on PR #88, here's the log: [pasted log]"
    output: >
      Root cause: lint error — import order violation in src/api/users.ts lines 3-7.
      Fix plan: 1. Run linter locally to reproduce. 2. Reorder imports. 3. Add lint check
      to pre-commit hook. 4. Push fix.
    expected_model: haiku

# Multi-model variants
variants:
  sonnet:
    prompt_file: prompts/balanced.md
    description: Default — thorough root-cause analysis with clear fix plan
    cost_factor: 1.0
    latency_baseline_ms: 500
  opus:
    prompt_file: prompts/detailed.md
    description: Deep analysis for complex multi-job failures or flaky test patterns
    cost_factor: 3.0
    latency_baseline_ms: 1200
  haiku:
    prompt_file: prompts/brief.md
    description: Fast triage for obvious failures (lint errors, missing deps)
    cost_factor: 0.3
    latency_baseline_ms: 200
  fallback_chain:
    - sonnet
    - opus
    - haiku

# Tests
tests:
  - id: test-lint-failure
    type: prompt-validation
    input: "ERROR: ESLint found 3 errors in src/index.ts — no-unused-vars, import/order"
    expected_substring: "lint"
    models_to_test:
      - sonnet
      - haiku
  - id: test-test-failure
    type: prompt-validation
    input: "FAIL src/auth.test.js — TypeError: Cannot read properties of undefined (reading 'token')"
    expected_substring: "test"
    models_to_test:
      - sonnet
  - id: test-build-failure
    type: prompt-validation
    input: "tsc: error TS2345 — Argument of type 'string' is not assignable to parameter of type 'number'"
    expected_substring: "fix"
    models_to_test:
      - sonnet
  - id: test-empty-input
    type: prompt-validation
    input: "PR #1 is failing"
    expected_not_null: true
    models_to_test:
      - sonnet

# Documentation
docs:
  auto_generate_readme: true
  sections_to_include:
    - description
    - inputs
    - outputs
    - examples
  help_text: "Analyse failed CI jobs on PR {pr} and produce a TDD fix plan."
  keywords:
    - ci
    - build
    - failed
    - pr
    - fix
    - tdd
    - debugging

# Monitoring
monitoring:
  enabled: true
  track_metrics:
    - latency
    - token_count
    - cost
    - variant_selected
  alert_threshold_latency_ms: 5000
  public_metrics: false

version: "1.0.0"
changelog:
  "1.0.0": "Initial release — PR build failure analysis with KISS + TDD fix plans"

tags:
  - ci
  - debugging
  - tdd
  - pull-request
  - build
---

# failed-build-analysis

Analyse failed CI/CD build jobs on an open PR, identify root causes, and produce a
KISS + TDD implementation plan to fix them. Works from pasted logs (Codex, Claude Web)
or live `gh` CLI calls (Claude Code, Cursor with terminal).

## When to use

Auto-invoke when the user says any of:
- "the build is failing", "CI is red", "checks aren't passing"
- "fix the broken PR", "why is the pipeline failing"
- "build errors on #<number>", "failed jobs on my PR"

Manual invoke: `/failed-build-analysis [pr-number-or-url]`

## Instructions

### Step 0 — Gather build logs

**If `shell.exec` is available (Claude Code, Cursor with terminal):**

```bash
# 1. See all check statuses on the PR at a glance
#    Omit PR_NUMBER if already on the PR branch
gh pr checks [PR_NUMBER]
gh pr checks [PR_NUMBER] --json name,state,description,link   # scriptable

# 2. Resolve the PR's current head SHA, then find failed runs for that exact commit
SHA=$(gh pr view [PR_NUMBER] --json headRefOid --jq .headRefOid)
gh run list --commit "$SHA" --status failure \
  --json databaseId,name,workflowName,createdAt --limit 10

# 3. For each failed RUN_ID — pull only the failed-step logs
gh run view $RUN_ID --log-failed

# If you need to drill into a specific job inside the run:
gh run view $RUN_ID --json jobs          # list job IDs
gh run view --job $JOB_ID --log-failed   # logs for that job only

# If you need the full run log (verbose):
gh run view $RUN_ID --log
```

> **Note:** `gh run view --log-failed` can occasionally show `UNKNOWN STEP` or
> return incomplete data when the GitHub platform has log delivery issues.
> Fall back to `--log` or `--verbose` if a job's output is missing.

**If only `network.http` is available:**
Use GitHub Actions REST API:
- `GET /repos/{owner}/{repo}/actions/runs?head_sha={SHA}&status=failure`
- `GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs`

**If neither is available (prompt-only / Codex / Claude Web):**
Ask the user to paste the full build log or relevant error section. Proceed with the
pasted content — no tooling required.

---

### Step 1 — Identify and classify failures

For each failed job extract:
1. **Job name** and **workflow**
2. **Error type** — one of: `lint`, `type-check`, `test`, `build`, `deploy`, `infra`
3. **Error message** — exact text, file path, and line number when available
4. **First failing line** — the earliest log line that caused the cascade (ignore
   downstream noise)

Group related errors that share the same root cause — they get one fix entry.

---

### Step 2 — Root cause analysis

For each unique failure group:

1. **State the symptom** — quote the log line verbatim
2. **Identify the root cause** — the actual source, not the symptom
3. **Assess blast radius** — how many files / tests are affected
4. **Check for known patterns:**
   - Missing mock / fixture / factory
   - Import order / unused variable (linter)
   - Type mismatch (TypeScript / mypy / Flow)
   - Missing or broken environment variable / secret
   - Flaky test (non-deterministic — check if it passes on retry)
   - Dependency version conflict / missing lockfile update
   - Missing migration or schema drift
   - Path / platform sensitivity (Windows vs Unix separators, CRLF)

---

### Step 3 — KISS + TDD fix plan

Produce a numbered, ordered plan. Each step is atomic and independently verifiable.

**Format each step as:**
```
N. [CATEGORY] What to do
   - Why: reason this step is needed
   - TDD: write/run this test first to confirm the failure, then make it green
   - File(s): path/to/affected/file.ext
   - Verify: exact command to confirm the step passes
```

**KISS principles to enforce:**
- Fix only what the log proves is broken — do not refactor adjacent code
- Prefer the smallest diff that makes the test green
- One step = one logical change = one commit
- No speculative "while we're here" improvements

**TDD order for every fix:**
1. Reproduce the failure with a focused test (red — confirms root cause)
2. Apply the minimal code change (green — smallest passing diff)
3. Run full suite to confirm no regressions
4. Commit atomically

---

### Step 4 — Output

Emit two clearly delimited sections:

#### FAILURE SUMMARY

```
Job: <name>  |  Workflow: <workflow>  |  Type: <lint|type-check|test|build|deploy>
Root cause: <one sentence>
Affected: <N files / N tests>
Log excerpt: "<exact error line>"
```
One block per unique failure group.

#### FIX PLAN

```
1. [TEST] Write failing test reproducing <issue>
   - Why: confirms root cause before touching production code
   - TDD: <exact test command>
   - File: <path>
   - Verify: test fails with the same message as CI

2. [FIX] <minimal change — one sentence>
   - Why: <reason>
   - File: <path>:<line>
   - Verify: <exact command> → green

3. [VERIFY] Full suite
   - Verify: <test command> → all green, zero new failures

4. [COMMIT] git commit -m "fix: <one-line description of what was broken"
```

End with:
- **Confidence:** High / Medium / Low
- **Flakiness note** (if any failure looks non-deterministic)
- **Env note** (if any failure requires a secret or env var that may not be set locally)

## Examples

### Example 1 — Jest mock missing

**Input:** PR #142 failing; job: `test / unit`
```
TypeError: Cannot read properties of undefined (reading 'send')
  at UserService.notifyUser (src/services/user.service.ts:34)
  at src/services/user.service.test.ts:22
```

**Output:**
```
FAILURE SUMMARY
Job: test / unit  |  Workflow: CI  |  Type: test
Root cause: `mailer.send` called in UserService but jest.mock('../mailer') is absent
  in user.service.test.ts — the real module is imported, which has no send method
  in the test environment.
Affected: 1 file / 4 tests
Log excerpt: "TypeError: Cannot read properties of undefined (reading 'send')"

FIX PLAN
1. [TEST] Reproduce in isolation
   - Why: Confirm the exact mock gap before editing production code
   - TDD: npx jest src/services/user.service.test.ts
   - File: src/services/user.service.test.ts
   - Verify: test fails with "Cannot read properties of undefined (reading 'send')"

2. [FIX] Add `jest.mock('../mailer')` at the top of the test file
   - Why: Jest needs explicit mock registration; auto-mocking is off by default
   - File: src/services/user.service.test.ts:1
   - Verify: npx jest src/services/user.service.test.ts → 4 tests green

3. [VERIFY] Full suite
   - Verify: npm test → all green

4. [COMMIT] git commit -m "fix: mock mailer in user.service tests"

Confidence: High
```

### Example 2 — TypeScript type error

**Input:** Pasted log:
```
error TS2345: Argument of type 'string' is not assignable to
parameter of type 'number' at src/utils/format.ts:18
```

**Output:**
```
FAILURE SUMMARY
Job: build / tsc  |  Workflow: CI  |  Type: type-check
Root cause: formatAmount() called with a string value; its signature requires number.
  A recent refactor removed the implicit Number() coercion at the call site.
Affected: 1 file
Log excerpt: "error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'"

FIX PLAN
1. [TEST] Add a type-level reproduction
   - TDD: npx tsc --noEmit → confirm TS2345 at src/utils/format.ts:18
   - File: src/utils/format.ts
   - Verify: error appears at exactly that line

2. [FIX] Coerce the value at the call site: `formatAmount(Number(rawValue))`
   - Why: Smallest fix; keeps the function signature strict for other callers
   - File: src/utils/format.ts:18
   - Verify: npx tsc --noEmit → 0 errors

3. [VERIFY] npm test → all green

4. [COMMIT] git commit -m "fix: coerce string to number before formatAmount call"

Confidence: High
```
