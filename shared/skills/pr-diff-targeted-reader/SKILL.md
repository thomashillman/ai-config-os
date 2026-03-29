---
skill: pr-diff-targeted-reader
description: |
  Reads the changed files in a PR without hitting token limits. When a PR has
  more than ~15 changed files, get_files overflows; this skill identifies which
  files are relevant to the current task (from test imports, component names, or
  error messages) and fetches only those via targeted get_file_contents calls.

type: agent
status: stable

capabilities:
  required:
    - mcp.client
  optional:
    - fs.read
  fallback_mode: manual
  fallback_notes: Without mcp.client, provide the PR diff as pasted text. fs.read enables local file fallback for branches already checked out.

$extensions:
  claude.argument-hint: "[pr-number] [focus-hint]"

inputs:
  - name: pr_number
    type: string
    description: PR number to read (e.g. "256")
    required: true
  - name: focus_hint
    type: string
    description: >
      What to focus on — a test file name, component name, error string, or
      natural language description (e.g. "AnalyticsTab tests" or "dashboard tabs").
      Used to filter relevant files when the PR is large.
    required: false

outputs:
  - name: file_contents
    type: object
    description: Map of relevant file paths to their contents, grouped by relevance tier

dependencies:
  skills: []
  apis:
    - github-mcp

examples:
  - input: "/pr-diff-targeted-reader 256 AnalyticsTab tests"
    output: "Fetched 5 relevant files (AnalyticsTab.jsx, AnalyticsTab.test.jsx, workerContractsClient.js, ContextCostTab.jsx, ConfigTab.jsx). Skipped 23 unrelated files."
    expected_model: sonnet

tests:
  - id: test-skips-unrelated-files
    type: prompt-validation
    input: "Read the changed files in PR 256 focusing on dashboard test failures"
    expected_substring: "get_file_contents"
    max_latency_ms: 10000
    models_to_test:
      - sonnet

version: "1.0.0"
changelog:
  "1.0.0": "Initial release — born from get_files token overflow on PR #256 (28 changed files)"

tags:
  - ci-cd
  - github
  - pr-review
---

# pr-diff-targeted-reader

Reads the changed files in a PR without hitting token limits. `get_files` overflows on large PRs (>~15 files); this skill identifies the subset relevant to the current task and fetches only those.

Born from a session where `get_files` on PR #256 (28 changed files) returned 122k chars, exceeding the token limit and requiring 5 sequential `get_file_contents` fallback calls.

## Capability contract

Required: `mcp.client` — GitHub MCP tools (`pull_request_read`, `get_file_contents`).
Optional: `fs.read` — local file fallback for branches already checked out.
Fallback: paste the PR diff manually.

## When to use

- Fixing CI failures or reviewing changes on a PR with more than ~15 changed files
- You need to understand specific components or tests changed in a PR without reading everything
- `get_files` or `pull_request_read get_diff` has returned a token-limit error
- User says "look at PR #N" where N is a large feature or refactor PR

## Instructions

Arguments: `$ARGUMENTS` — PR number followed by optional focus hint (e.g. `256 dashboard tests`).

### 1. Fetch PR metadata

```
pull_request_read get — owner, repo, pullNumber
```

Note: `changed_files` count, `head.sha`, `head.ref`, `base.ref`.

### 2. Decide the fetch strategy

- **≤ 15 changed files**: use `pull_request_read get_files` directly. Done.
- **> 15 changed files**: proceed to targeted fetch below.

### 3. Get filenames only (large PR path)

Use `pull_request_read get_files` with `perPage: 15` and paginate until all filenames are collected. Extract only the `filename` field from each entry — do not read file contents yet.

### 4. Filter to relevant files

Apply the focus hint (from `$ARGUMENTS` or inferred from context) against the filename list using three tiers:

**Tier 1 — directly named**: files whose names contain the focus keywords
(e.g. focus "AnalyticsTab" matches `AnalyticsTab.jsx`, `AnalyticsTab.test.jsx`)

**Tier 2 — same directory or module**: files in the same directory as tier-1 hits, or files likely imported by tier-1 files
(e.g. `workerContractsClient.js` if `AnalyticsTab.jsx` imports from it)

**Tier 3 — related by change type**: other files of the same type/pattern as tier-1 hits likely affected by the same root cause
(e.g. other tab components if one tab component is in tier 1)

Stop at tier 2 unless the task explicitly requires broader coverage. Aim for ≤ 10 files total.

### 5. Fetch targeted files

For each selected file, call:
```
get_file_contents — owner, repo, path, ref: head.sha
```

Group results by tier in your response. Note how many files were skipped.

### 6. Report

After reading, summarise:
```
Read <N> files (Tier 1: <n>, Tier 2: <n>, Tier 3: <n>). Skipped <M> unrelated files.
```

Then present the file contents in relevance order, starting with the files most likely to contain the root cause.

## Examples

### Example 1 — large PR, focused on test failures

**Input:** `/pr-diff-targeted-reader 256 AnalyticsTab dashboard tests`

**Output:**
```
PR #256: 28 changed files. Fetching targeted subset.

Tier 1 (directly named): AnalyticsTab.jsx, AnalyticsTab.test.jsx, dashboard-findings.test.jsx
Tier 2 (same module): workerContractsClient.js, ContextCostTab.jsx, ConfigTab.jsx

Read 6 files. Skipped 22 unrelated files.
```
Then file contents follow in tier order.

### Example 2 — small PR, read everything

**Input:** `/pr-diff-targeted-reader 254`

**Output:**
```
PR #254: 3 changed files. Reading all files directly.
```
Uses `get_files` and reads all three.
