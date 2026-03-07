---
skill: "pr-description"
description: "Structured PR template and review guidance.

  Use when drafting pull request titles, descriptions, and change summaries.\n"
type: "prompt"
status: "stable"
inputs:
  - name: "changes_summary"
    type: "string"
    description: "Summary of changes made"
    required: true
  - name: "change_type"
    type: "string"
    description: "feat, fix, refactor, docs, or style"
    required: false
outputs:
  - name: "pr_description"
    type: "object"
    description: "Formatted PR with title, summary, test plan, and notes"
dependencies:
  skills:
    - name: "commit-conventions"
      version: "^1.0"
      optional: false
  apis: []
  models:
    - "sonnet"
    - "opus"
examples:
  - input: "Added user authentication with OAuth2"
    output: "PR with security checklist, test plan, and breaking change notes"
    expected_model: "sonnet"
variants:
  opus:
    prompt_file: "prompts/detailed.md"
    description: "Comprehensive PR with detailed security/breaking change guidance"
    cost_factor: 3
    latency_baseline_ms: 1000
  sonnet:
    prompt_file: "prompts/balanced.md"
    description: "Standard PR template with practical checklist"
    cost_factor: 1
    latency_baseline_ms: 400
  haiku:
    prompt_file: "prompts/brief.md"
    description: "Quick PR outline"
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain:
    - "sonnet"
    - "opus"
    - "haiku"
tests:
  - id: "test-pr-title"
    type: "prompt-validation"
    input: "New authentication system added"
    expected_substring: "title"
    models_to_test:
      - "sonnet"
  - id: "test-pr-breaking-changes"
    type: "prompt-validation"
    input: "Refactor API endpoints"
    expected_substring: "breaking"
    models_to_test:
      - "opus"
composition:
  personas:
    - name: "pr-author"
      skills:
        - "pr-description"
        - "commit-conventions"
docs:
  auto_generate_readme: true
  sections_to_include:
    - "description"
    - "inputs"
    - "outputs"
    - "variants"
  keywords:
    - "pull-request"
    - "pr"
    - "github"
    - "gitlab"
monitoring:
  enabled: true
  track_metrics:
    - "latency"
    - "token_count"
    - "variant_selected"
  alert_threshold_latency_ms: 3000
version: "1.0.0"
changelog:
  1.0.0: "Initial release"
tags:
  - "pr"
  - "github"
  - "workflow"
capabilities:
  required: []
  optional:
    - "git.read"
  fallback_mode: "prompt-only"
  fallback_notes: "Can draft from pasted diff summary."
---

# pr-description

Structured PR template: title conventions, description format, test plan, and reviewer guidance.

## When to use

When drafting a pull request, preparing change summary, or documenting breaking changes.

## Instructions

Generate a complete PR with:

1. **Title**: <70 chars, follows commit-conventions (feat:, fix:, etc.)
2. **Summary**: 1-2 sentences on what changed and why
3. **Changes**: Bullet list of modifications
4. **Test Plan**: How this was tested (manual/automated)
5. **Breaking Changes**: Any backwards-incompatible changes
6. **Reviewer Notes**: Specific guidance for reviewers
7. **Checklist**: Linting, docs, tests, etc.

Keep descriptions concise but complete. Include links to relevant issues or docs.
