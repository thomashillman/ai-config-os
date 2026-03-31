---
skill: "issue-triage"
description: "Analyze GitHub issues and classify severity, suggest labels, identify affected areas, draft initial response.\n"
type: "prompt"
status: "stable"
inputs:
  - name: "issue_text"
    type: "string"
    description: "GitHub issue title and body"
    required: true
  - name: "codebase_context"
    type: "string"
    description: "Brief description of relevant codebase areas"
    required: false
outputs:
  - name: "triage_analysis"
    type: "string"
    description: "Severity, suggested labels, affected components, recommended action"
  - name: "initial_response_draft"
    type: "string"
    description: "Draft response to post on the issue"
dependencies:
  skills: []
  apis: []
  models:
    - "sonnet"
examples:
  - input: "GitHub issue: 'App crashes when uploading >100MB files'"
    output: "Severity: HIGH; Labels: bug/performance; Component: file-upload; Action: investigate file streaming"
    expected_model: "sonnet"
variants:
  sonnet:
    prompt_file: "prompts/balanced.md"
    description: "Default; practical triage"
    cost_factor: 1
    latency_baseline_ms: 300
  haiku:
    prompt_file: "prompts/brief.md"
    description: "Quick severity + labels only"
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain:
    - "sonnet"
    - "haiku"
tests:
  - id: "test-bug-severity"
    type: "prompt-validation"
    input: "Issue: data loss in specific scenario"
    expected_substring: "CRITICAL"
    models_to_test:
      - "sonnet"
  - id: "test-feature-request"
    type: "prompt-validation"
    input: "Issue: feature request for dark mode"
    expected_substring: "enhancement"
    models_to_test:
      - "sonnet"
docs:
  auto_generate_readme: true
  sections_to_include:
    - "description"
    - "inputs"
    - "outputs"
  keywords:
    - "triage"
    - "issue-management"
    - "github"
    - "labeling"
monitoring:
  enabled: true
  track_metrics:
    - "latency"
    - "issues_triaged"
version: "1.0.0"
changelog:
  1.0.0: "Initial release; issue triage automation"
tags:
  - "automation"
  - "workflow"
capabilities:
  required: []
  optional:
    - "network.http"
  fallback_mode: "prompt-only"
  fallback_notes: "Can triage pasted issue text."
---

# Issue Triage

Analyze GitHub issues and classify severity, suggest labels, identify affected codebase areas, and draft initial responses.

Bridges GitHub Issues and your skill system.

## When to use

When a new issue arrives and you need quick classification before assignment.

## Instructions

1. Paste issue title and body
2. Optionally provide codebase context (relevant modules, repos)
3. Receive:
   - Severity classification (CRITICAL/HIGH/MEDIUM/LOW)
   - Suggested labels (bug, enhancement, docs, help-wanted, etc.)
   - Affected codebase components
   - Recommended next action
   - Draft response to post

## Examples

### Example 1: Bug report

**Input:**

```
Title: "Login fails every 5th attempt"
Description: "When I try to log in, it works 1-4 times, then fails on the 5th attempt. Session timeout error. Works again after page refresh."
```

**Output:**

```
SEVERITY: HIGH (intermittent auth failure)
LABELS: bug, needs-investigation, auth
COMPONENT: Session manager, token refresh logic
ACTION: Check for off-by-one in session rotation, race conditions in token refresh
DRAFT RESPONSE:
"Thanks for reporting! This intermittent pattern suggests a session rotation bug.
I'll investigate the token refresh logic. Can you confirm:
1. Are you using the same browser/device?
2. Does it happen consistently on 5th attempt or random?"
```

### Example 2: Feature request

**Input:**

```
Title: "Support for bulk user import"
Description: "Currently can only add users one at a time. Need to import CSV for 500+ users."
```

**Output:**

```
SEVERITY: MEDIUM (enhancement for enterprise users)
LABELS: enhancement, bulk-operations, feature-request
COMPONENT: User management, admin panel
ACTION: Estimate effort, consider CSV parser + batch API design
DRAFT RESPONSE:
"Good feature request. This would be valuable for enterprise deployments.
We can add CSV import to the admin panel. Estimated effort: 2-3 sprints.
Would you be interested in contributing or funding this work?"
```
