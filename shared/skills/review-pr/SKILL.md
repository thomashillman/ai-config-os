---
skill: "review-pr"
description:
  "Review incoming pull requests for correctness, breaking changes, test coverage, security.

  Different from pr-description (which generates PR summaries); this reviews incoming PRs.\n"
type: "prompt"
status: "stable"
inputs:
  - name: "pr_content"
    type: "string"
    description: "Diff, changed files, PR description, or full PR context"
    required: true
  - name: "focus_areas"
    type: "string"
    description: '"breaking-changes", "security", "test-coverage", "api-design", "all"'
    required: false
  - name: "severity"
    type: "string"
    description: '"thorough" (detailed) or "quick" (critical issues only)'
    required: false
outputs:
  - name: "review_feedback"
    type: "string"
    description: "Structured code review with severity levels"
  - name: "approve_recommend"
    type: "boolean"
    description: "Recommendation to approve/request changes"
dependencies:
  skills:
    - name: "code-review"
      version: "^1.0"
      optional: false
    - name: "security-review"
      version: "^1.0"
      optional: true
  apis: []
  models:
    - "sonnet"
examples:
  - input: "Pull request diff for new API endpoint"
    output: "Structured review covering breaking changes, auth, test coverage, error handling"
    expected_model: "sonnet"
variants:
  sonnet:
    prompt_file: "prompts/balanced.md"
    description: "Default; thorough review of breaking changes, security, coverage"
    cost_factor: 1
    latency_baseline_ms: 400
  opus:
    prompt_file: "prompts/detailed.md"
    description: "Deep review with API design critique and long-term impact analysis"
    cost_factor: 2.5
    latency_baseline_ms: 700
  haiku:
    prompt_file: "prompts/brief.md"
    description: "Critical issues only"
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain:
    - "sonnet"
    - "opus"
    - "haiku"
tests:
  - id: "test-breaking-changes"
    type: "prompt-validation"
    input: "PR with API signature change"
    expected_substring: "breaking"
    models_to_test:
      - "sonnet"
  - id: "test-security-check"
    type: "prompt-validation"
    input: "PR adding authentication"
    expected_substring: "security"
    models_to_test:
      - "sonnet"
docs:
  auto_generate_readme: true
  sections_to_include:
    - "description"
    - "inputs"
    - "outputs"
  keywords:
    - "code-review"
    - "pull-request"
    - "breaking-changes"
    - "quality-gate"
monitoring:
  enabled: true
  track_metrics:
    - "latency"
    - "feedback_severity_distribution"
version: "1.0.0"
changelog:
  1.0.0: "Initial release; incoming PR review"
tags:
  - "code-quality"
  - "review"
capabilities:
  required: []
  optional:
    - "git.read"
    - "fs.read"
  fallback_mode: "prompt-only"
  fallback_notes: "Can review pasted diffs."
---

# Review PR

Review incoming pull requests for correctness, breaking changes, test coverage, and security.

Different from `pr-description` (which generates PR summaries for outgoing PRs); this skill reviews incoming PRs.

## When to use

When you need a structured code review of an incoming PR before approval. Can be used as an automated gate or offline review tool.

## Instructions

1. Paste PR diff, changed files, or full PR context
2. Specify focus areas: breaking-changes, security, test-coverage, api-design, or all
3. Specify severity: "thorough" (detailed) or "quick" (critical only)
4. Receive structured feedback with severity levels and approval recommendation

## Examples

### Example 1: API endpoint PR

**Input:** Diff showing new POST /users endpoint
**Output:**

```
BREAKING CHANGES:
- None detected

SECURITY:
- ✓ Input validation on name, email fields
- ✓ Rate limiting on signup endpoint
- ⚠️ Missing: Password strength requirements (add complexity check)

TEST COVERAGE:
- ✓ Happy path covered
- ⚠️ Missing: Invalid email format test
- ⚠️ Missing: Duplicate email rejection test

API DESIGN:
- ✓ Consistent with existing endpoints
- Suggestion: Consider idempotency key for retry safety

RECOMMENDATION: Request changes (security + test coverage gaps)
```
