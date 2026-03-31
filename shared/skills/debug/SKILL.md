---
skill: "debug"
description:
  "Structured debugging for symptoms, error messages, and stack traces.

  Use when diagnosing unexpected behavior, errors, or test failures.\n"
type: "prompt"
status: "stable"
inputs:
  - name: "symptoms"
    type: "string"
    description: "Description of unexpected behavior or problem observed"
    required: true
  - name: "error_message"
    type: "string"
    description: "Error message or stack trace (optional but recommended)"
    required: false
  - name: "codebase_context"
    type: "string"
    description: "Relevant code snippets or context around the problem"
    required: false
outputs:
  - name: "diagnosis"
    type: "object"
    description: "Structured diagnosis with hypothesis, root_cause, fix, and regression_test"
dependencies:
  skills: []
  apis: []
  models:
    - "opus"
    - "sonnet"
    - "haiku"
examples:
  - input: "Syntax error when importing module; 'SyntaxError: unexpected EOF while parsing'"
    output: "Diagnosis: missing colon in function definition. Fix: add colon to line. Regression: add unit test for syntax."
    expected_model: "sonnet"
variants:
  opus:
    prompt_file: "prompts/detailed.md"
    description: "Deep multi-system analysis; traces through dependencies and interactions"
    cost_factor: 3
    latency_baseline_ms: 2000
  sonnet:
    prompt_file: "prompts/balanced.md"
    description: "Standard debugging loop; balance between depth and speed (default)"
    cost_factor: 1
    latency_baseline_ms: 600
  haiku:
    prompt_file: "prompts/brief.md"
    description: "Quick stacktrace scan; highlights critical issues only"
    cost_factor: 0.3
    latency_baseline_ms: 200
  fallback_chain:
    - "sonnet"
    - "opus"
    - "haiku"
tests:
  - id: "test-syntax-error"
    type: "prompt-validation"
    input: "SyntaxError: unexpected EOF while parsing at line 42"
    expected_substring: "syntax"
    models_to_test:
      - "sonnet"
      - "haiku"
  - id: "test-logic-bug"
    type: "prompt-validation"
    input: "Function returns None when it should return a list; test expects 5 items"
    expected_substring: "logic"
    models_to_test:
      - "sonnet"
  - id: "test-regression-find"
    type: "prompt-validation"
    input: "TypeError: unsupported operand type(s) for +: 'int' and 'str'"
    expected_not_null: true
    models_to_test:
      - "sonnet"
composition:
  personas:
    - name: "debugger"
      description: "Systematic debugging persona"
      skills:
        - "debug"
docs:
  auto_generate_readme: true
  sections_to_include:
    - "description"
    - "inputs"
    - "outputs"
    - "examples"
    - "variants"
  help_text: "Debug {symptoms} and provide a structured diagnosis with root cause and fix."
  keywords:
    - "debug"
    - "troubleshoot"
    - "error"
    - "fix"
    - "diagnosis"
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
  1.0.0: "Initial release with structured debugging framework"
tags:
  - "debugging"
  - "troubleshooting"
  - "error-diagnosis"
capabilities:
  required: []
  optional:
    - "fs.read"
    - "shell.exec"
  fallback_mode: "prompt-only"
  fallback_notes: "Can debug from pasted symptoms and stack traces."
---

# debug

Diagnose unexpected behavior and errors using a structured 5-step loop.

## When to use

Invoke when facing syntax errors, logic bugs, test failures, runtime exceptions, or any unexpected behavior. Provide the error message and relevant context for fastest diagnosis.

## Instructions

Follow this 5-step debugging loop:

1. **Form hypothesis** — Based on symptoms and error message, what are the 2-3 most likely causes?
2. **Isolate the problem** — Narrow down to the exact line, function, or component at fault
3. **Test assumption** — What evidence would confirm or refute each hypothesis?
4. **Confirm root cause** — Which hypothesis is correct? What's the underlying issue?
5. **Document fix + regression test** — State the fix and suggest a test case to prevent recurrence

### For different symptom types

- **Syntax errors**: Check the indicated line and surrounding context; often a missing colon, bracket, or quote
- **Logic bugs**: Trace through the execution path; check variable states and edge cases
- **Type errors**: Verify type coercion and operations between incompatible types
- **Async/concurrency issues**: Check promise chains, callbacks, event ordering, race conditions
- **Performance problems**: Check algorithmic complexity, memory leaks, or unnecessary re-computation

## Examples

### Syntax error debugging

**Input:** `SyntaxError: unexpected EOF while parsing at line 42 in app.py`
**Output:** Diagnosis: function definition missing colon. Root cause: incomplete refactoring left a function header without a body. Fix: add colon and proper indentation. Regression test: add unit test for that function.

### Logic bug debugging

**Input:** Unit test failing: "Expected 5 items in result, got 0. Function runs without error."
**Output:** Diagnosis: filter condition too restrictive. Root cause: condition was changed during refactor and now filters out all items. Fix: adjust condition or provide sample data that matches. Regression test: add parameterized test with edge case data.
