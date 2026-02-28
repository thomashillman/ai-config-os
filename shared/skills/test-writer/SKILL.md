---
skill: test-writer
description: |
  Generate comprehensive unit and integration tests from function/module code.
  Complements code-review and debug skills to complete the code quality toolkit.

type: prompt
status: stable

inputs:
  - name: code
    type: string
    description: Function or module to test
    required: true
  - name: test_type
    type: string
    description: "unit" (isolated), "integration" (with dependencies), or "both"
    required: false
  - name: framework
    type: string
    description: "jest", "mocha", "pytest", "go test", etc. (inferred if omitted)
    required: false

outputs:
  - name: test_code
    type: string
    description: Complete test suite covering happy path, edge cases, error states
  - name: coverage_estimate
    type: string
    description: Expected line/branch coverage

dependencies:
  skills: []
  apis: []
  models:
    - sonnet

examples:
  - input: "JavaScript function: function factorial(n) { if (n <= 1) return 1; return n * factorial(n-1); }"
    output: "Jest test suite with happy path, zero input, negative input, large number tests"
    expected_model: sonnet

variants:
  opus:
    prompt_file: prompts/detailed.md
    description: Complex tests with edge cases, performance, fuzzing
    cost_factor: 2.5
    latency_baseline_ms: 700

  sonnet:
    prompt_file: prompts/balanced.md
    description: Default; unit + integration tests, good coverage
    cost_factor: 1.0
    latency_baseline_ms: 400

  haiku:
    prompt_file: prompts/brief.md
    description: Basic unit tests only
    cost_factor: 0.3
    latency_baseline_ms: 150

  fallback_chain:
    - opus
    - sonnet
    - haiku

tests:
  - id: test-unit-tests
    type: prompt-validation
    input: "JavaScript function that sums two numbers"
    expected_substring: "test"
    models_to_test:
      - sonnet

  - id: test-edge-cases
    type: prompt-validation
    input: "Function handling division by zero"
    expected_substring: "zero"
    models_to_test:
      - sonnet

docs:
  auto_generate_readme: true
  sections_to_include:
    - description
    - inputs
    - outputs
    - examples
  keywords:
    - testing
    - coverage
    - jest
    - pytest
    - mocha

monitoring:
  enabled: true
  track_metrics:
    - latency
    - token_count
    - test_count_generated

version: "1.0.0"
changelog:
  "1.0.0": "Initial release; comprehensive test generation"

tags:
  - code-quality
  - testing
---

# Test Writer

Generate comprehensive unit and integration tests from function/module code.

When you have code that needs testing but lack test coverage, this skill auto-generates test suites covering happy paths, edge cases, and error states.

## When to use

After writing or reviewing code, use this to generate tests. Pair with `code-review` (identify what to test) and `debug` (fix failing tests).

## Instructions

1. Paste the function or module code
2. Specify test type: unit, integration, or both
3. Specify framework if not obvious from language (jest, pytest, mocha, go test, etc.)
4. Receive a complete test suite with:
   - Happy path tests
   - Edge cases (empty input, boundary values, null)
   - Error handling (exceptions, invalid inputs)
   - Integration points (mocks where needed)

## Examples

### Example 1: Simple utility function
**Input:**
```javascript
function capitalize(str) {
  if (!str) return '';
  return str[0].toUpperCase() + str.slice(1);
}
```
**Output:**
```javascript
describe('capitalize', () => {
  it('capitalizes first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('handles empty string', () => {
    expect(capitalize('')).toBe('');
  });

  it('handles single character', () => {
    expect(capitalize('a')).toBe('A');
  });

  it('handles already capitalized', () => {
    expect(capitalize('Hello')).toBe('Hello');
  });

  it('handles null/undefined', () => {
    expect(capitalize(null)).toBe('');
    expect(capitalize(undefined)).toBe('');
  });
});
```

### Example 2: API endpoint (integration)
**Input:** Express middleware function with database calls
**Output:** Jest test suite with mocked database, request/response objects, error cases
