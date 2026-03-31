---
skill: "code-review"
description:
  "Perform structured code review with severity levels and actionable feedback.

  Use when reviewing pull requests, code changes, or implementation details.\n"
type: "prompt"
status: "stable"
inputs:
  - name: "diff"
    type: "string"
    description: "Code diff or changed file content"
    required: true
  - name: "context"
    type: "string"
    description: "Project context, architecture, or coding standards"
    required: false
  - name: "review_type"
    type: "string"
    description: "Type of review (full, security, performance, style, logic)"
    required: false
outputs:
  - name: "review"
    type: "object"
    description: "Structured review with issues, severity levels, and suggestions"
dependencies:
  skills: []
  apis: []
  models:
    - "opus"
    - "sonnet"
    - "haiku"
examples:
  - input: "Review this Python function for bugs and performance"
    output: "Found 2 critical issues, 3 warnings. Performance improvements suggested."
    expected_model: "sonnet"
variants:
  opus:
    prompt_file: "prompts/detailed.md"
    description: "Thorough analysis with deep dive into logic, security, and patterns"
    cost_factor: 3
    latency_baseline_ms: 2000
  sonnet:
    prompt_file: "prompts/balanced.md"
    description: "Default variant; balanced coverage of issues and suggestions"
    cost_factor: 1
    latency_baseline_ms: 600
  haiku:
    prompt_file: "prompts/brief.md"
    description: "Quick scan; highlights critical issues only"
    cost_factor: 0.3
    latency_baseline_ms: 200
  fallback_chain:
    - "sonnet"
    - "opus"
    - "haiku"
tests:
  - id: "test-basic-review"
    type: "prompt-validation"
    input: "Review this code for bugs: def add(a, b): return a + b"
    expected_substring: "logic"
    models_to_test:
      - "sonnet"
      - "opus"
  - id: "test-security-review"
    type: "prompt-validation"
    input: "Security review: using eval() on user input"
    expected_substring: "injection"
    models_to_test:
      - "sonnet"
  - id: "test-performance-review"
    type: "prompt-validation"
    input: "Performance review for nested loop iterating n^2 times"
    expected_not_null: true
composition:
  personas:
    - name: "code-reviewer"
      description: "Critical code quality persona"
      skills:
        - "code-review"
        - "commit-conventions"
docs:
  auto_generate_readme: true
  sections_to_include:
    - "description"
    - "inputs"
    - "outputs"
    - "examples"
    - "variants"
  help_text: "Review code changes for {review_type} issues and provide structured feedback."
  keywords:
    - "code-review"
    - "quality"
    - "security"
    - "performance"
    - "bugs"
monitoring:
  enabled: true
  track_metrics:
    - "latency"
    - "token_count"
    - "cost"
    - "variant_selected"
  alert_threshold_latency_ms: 5000
  public_metrics: false
version: "1.0.0"
changelog:
  1.0.0: "Initial release with structured review framework"
tags:
  - "code-quality"
  - "review"
  - "feedback"
capabilities:
  required: []
  optional:
    - "fs.read"
    - "git.read"
  fallback_mode: "prompt-only"
  fallback_notes: "Can review pasted code or diffs."
---

# code-review

Perform structured code review with actionable feedback on logic, security, performance, and style.

## When to use

Invoke when you need to review code changes, pull requests, or implementation details. Specify the review type (full, security, performance, style, logic) for focused analysis.

## Instructions

1. Analyze the provided code diff or content carefully
2. Identify issues by category: logic, security, performance, style, readability
3. For each issue, provide:
   - **Severity**: critical (blocks merge), warning (should fix), nit (optional improvement)
   - **Category**: logic, security, performance, style, or readability
   - **Description**: What's the problem and why it matters?
   - **Suggestion**: How to fix it or what to consider instead
4. Provide a summary with approval recommendation (approve, request changes, comment)
5. Highlight positive patterns or well-done sections when appropriate

### Severity guidelines

- **Critical**: Security vulnerabilities, data corruption bugs, infinite loops, crashes
- **Warning**: Performance issues, suboptimal patterns, potential bugs, inconsistencies
- **Nit**: Style, naming, formatting, minor readability improvements

### Review types

- **full**: Complete analysis (default)
- **security**: Focus on vulnerabilities, injection, auth, access control
- **performance**: Focus on algorithms, complexity, resource use, caching
- **style**: Focus on naming, formatting, patterns, idioms
- **logic**: Focus on correctness, edge cases, behavior

## Examples

### Full code review

**Input:** A function with a potential null pointer and O(n²) performance
**Output:** Structured list with critical/warning/nit issues, specific fixes suggested

### Security review

**Input:** Code using SQL query concatenation
**Output:** SQL injection vulnerability identified, parametrized query recommended
