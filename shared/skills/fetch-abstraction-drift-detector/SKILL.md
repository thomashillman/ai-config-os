---
skill: fetch-abstraction-drift-detector
description: |
  Detects contract drift when a fetch/API client abstraction changes, by
  cross-referencing component fetch call sites, prop names, URL patterns, and
  response envelope shapes against test mock fixtures. Surfaces mismatches
  before CI catches them.

type: agent
status: stable

capabilities:
  required:
    - fs.read
    - git.read
  optional:
    - shell.exec
  fallback_mode: prompt-only
  fallback_notes: Can analyse pasted component and test source when fs/git access is unavailable.

$extensions:
  claude.argument-hint: "[abstraction-file-path]"

inputs:
  - name: abstraction_file
    type: string
    description: Path to the new/changed fetch client module (e.g. src/lib/workerContractsClient.js)
    required: false
  - name: test_glob
    type: string
    description: Glob for test files to scan (defaults to src/__tests__/**/*.{js,jsx,ts,tsx})
    required: false

outputs:
  - name: drift_report
    type: string
    description: >
      Structured list of mismatches — URL patterns, prop names, envelope shapes —
      with file:line references and one-line fix suggestions.

dependencies:
  skills: []
  apis: []

examples:
  - input: "The dashboard was refactored to use workerContractsClient — check for test drift"
    output: >
      3 mismatches found:
      [URL] AnalyticsTab.test.jsx:15 — /contracts/analytics.tool_usage should be /v1/analytics/tool-usage
      [PROP] AnalyticsTab.test.jsx:63 — api= should be workerUrl= token=
      [ENVELOPE] AnalyticsTab.test.jsx:40 — flat payload should be wrapped in { contract_version, data, meta }
    expected_model: sonnet

tests:
  - id: test-identifies-url-drift
    type: prompt-validation
    input: "Check for fetch abstraction drift after workerContractsClient replaced direct fetchJson calls"
    expected_substring: "URL"
    max_latency_ms: 5000
    models_to_test:
      - sonnet

version: "1.0.0"
changelog:
  "1.0.0": "Initial release — born from PR #256 dashboard Worker migration retrospective"

tags:
  - code-quality
  - testing
  - drift-detection
---

# fetch-abstraction-drift-detector

Detects contract drift when a fetch/API client abstraction changes, surfacing mismatches between component call sites and test mock fixtures before CI catches them.

Introduced after a dashboard refactor (PR #256) where replacing `fetchJson(api + '/contracts/*')` with `workerContractsClient` functions caused 5 test failures — all sharing the same root cause: URL patterns, prop names, and response envelope shapes diverged between components and tests simultaneously.

## Capability contract

Required: `fs.read`, `git.read` — to inspect component and test source files.
Optional: `shell.exec` — to run `git diff` for precise change scope.
Fallback: prompt-only with pasted source.

## When to use

- A fetch layer, API client module, or network abstraction is introduced or refactored
- PR CI fails with multiple "empty state rendered instead of data" patterns or timeouts across several test files
- User says "the tests are stale after the API client change"
- After any commit that renames endpoint URLs, changes response envelope shapes, or alters component prop signatures related to data fetching

## Instructions

### 1. Identify the changed abstraction

If `abstraction_file` is provided, read it directly. Otherwise:

```bash
git diff --name-only HEAD~1
```

Look for files matching `*client*`, `*api*`, `*fetch*`, `*contracts*`. Read the identified file and extract:
- **Exported function names** (e.g. `fetchAnalyticsToolUsage`)
- **URL paths** built inside each function (e.g. `/v1/analytics/tool-usage`)
- **Response handling** — does it return raw JSON, unwrap `.data`, return a wrapped envelope?
- **Arguments** each function takes (e.g. `workerUrl, token` vs `api`)

### 2. Scan component consumers

Find all components that import from the changed abstraction:

```bash
grep -r "from.*<module-name>" src/ --include="*.jsx" --include="*.tsx" --include="*.js" -l
```

For each component, note:
- Imported function names used
- Props at the export signature (e.g. `{ workerUrl, token }` vs `{ api }`)
- Response envelope unpacking (e.g. `envelope.data`, `payload?.data ?? payload`)

### 3. Scan test mock fixtures

Find test files that exercise the affected components (use `test_glob` if provided):

```bash
grep -r "fetch\|vi\.fn\|spyOn\|mockImplementation" src/__tests__/ --include="*.jsx" --include="*.ts" -l
```

For each test file, extract:
- URL strings/patterns in mock dispatch logic (`url.includes(...)`)
- JSON shape returned by each mock branch (`json: () => Promise.resolve({...})`)
- Component render calls and props passed (`render(<Component prop=... />)`)
- Assertion targets (what text or DOM elements tests expect to find)

### 4. Cross-reference on three axes

**A. URL drift** — does the mock intercept the URL the abstraction now builds?

```
Abstraction builds: `${workerUrl}/v1/analytics/tool-usage`
Test mocks:        url.includes("/contracts/analytics.tool_usage")  ← MISMATCH
```

**B. Prop drift** — do test render calls pass the props the refactored component now expects?

```
Component accepts: { workerUrl, token }
Test renders:      <AnalyticsTab api={API} />                        ← MISMATCH
```

**C. Envelope drift** — does the mock response shape match what the component now extracts?

```
Component reads:   envelope.data.tools
Mock returns:      { tools: [...] }  (no data wrapper)               ← MISMATCH
```

### 5. Emit the report

For each mismatch:

```
[TYPE] file:line
  Current:  <what the test has>
  Expected: <what the component/abstraction now requires>
  Fix:      <one-line concrete change>
```

Close with a summary:

```
Drift summary: <N> mismatches across <M> test files
  URL:      <n>
  Props:    <n>
  Envelope: <n>
```

If no mismatches found: "No drift detected — test mocks align with current abstraction contract."

## Examples

### Example 1 — full drift after client migration

**Input:** "The dashboard was refactored to use workerContractsClient — check for test drift"

**Output:**
```
[URL] src/__tests__/AnalyticsTab.test.jsx:15
  Current:  url.includes("/contracts/analytics.friction_signals")
  Expected: url.includes("/v1/analytics/friction-signals")
  Fix:      Replace URL pattern string

[PROP] src/__tests__/AnalyticsTab.test.jsx:63
  Current:  render(<AnalyticsTab api={API} />)
  Expected: render(<AnalyticsTab workerUrl={WORKER_URL} token={TOKEN} />)
  Fix:      Update render call props

[ENVELOPE] src/__tests__/AnalyticsTab.test.jsx:40
  Current:  json: () => Promise.resolve({ tools: [...], total_events: 5 })
  Expected: json: () => Promise.resolve({ contract_version: "1.0.0", data: { tools: [...] }, meta: {...} })
  Fix:      Wrap payload in Worker envelope (add workerEnvelope() helper)

Drift summary: 3 mismatches across 1 test file
  URL: 1  Props: 1  Envelope: 1
```

### Example 2 — no drift

**Input:** "I added a new endpoint to the API client — are the tests still aligned?"

**Output:**
```
No drift detected — test mocks align with current abstraction contract.
New endpoint fetchAuditHistory is not yet exercised by any component or test.
```
