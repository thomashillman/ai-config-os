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
version: "1.1.1"
changelog:
  1.1.1: "Instructions: read template file first when possible; prompts stress replacing placeholders; Cursor rule 305-pr-description-authoring."
  1.1.0: "Canonical PR body template (checklists + CI status) in templates/pr-body-default.md; prompts aligned."
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

Structured PR template: title conventions plus the **canonical PR body** for this repository (checklists, reviewer questions, CI status line).

## When to use

When drafting a pull request, preparing change summary, or documenting breaking changes.

## Instructions

1. **Read the template first** (when the repo or filesystem is available): open **`templates/pr-body-default.md`** and use it as the single source of truth for headings and checklist lines. If the file cannot be read, use the variant prompt (`prompts/balanced.md`, etc.), which duplicates the structure for offline/dist bundles.
2. **Title**: &lt;70 chars, follows commit-conventions (`feat:`, `fix:`, etc.) — pair with **commit-conventions** skill.
3. **Body**: Match **`templates/pr-body-default.md`** exactly (Summary, Type, Pre-Push Checklist with all subsections, Specific Changes, Questions for Reviewers, CI Status). **Replace placeholder sentences** with real content — do not leave lines like “Brief description of what this PR does.” unchanged. Variant prompts inherit this structure; do not swap in a different outline unless the user explicitly opts out.
4. **Checklists**: Mark `[x]` only for verified items; use `[ ]` and short `— N/A` where a line does not apply.
5. **Tests**: Record commands run (`npm test`, `npm run verify`, targeted suites) under Delivery Contract and/or Specific Changes.

Keep prose concise. Link issues or docs when provided.

## Canonical template location

- `shared/skills/pr-description/templates/pr-body-default.md`

Project-local Cursor skill **`pr-description-body`** (`.cursor/skills/`) and Cursor project rule **`305-pr-description-authoring`** (`.cursor/rules/`) point agents at the same template when generating PR markdown in this repo.
