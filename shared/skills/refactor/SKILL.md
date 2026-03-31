---
skill: "refactor"
description: "Perform structured code refactoring with safety checks.

  Suggests extract-method, rename, decompose patterns; validates API contracts.\n"
type: "prompt"
status: "stable"
inputs:
  - name: "code"
    type: "string"
    description: "Code snippet to refactor"
    required: true
  - name: "goal"
    type: "string"
    description: '"simplify", "extract-method", "decompose", "reduce-duplication", "improve-readability"'
    required: false
  - name: "constraints"
    type: "string"
    description: "API contracts or invariants to preserve"
    required: false
outputs:
  - name: "refactored_code"
    type: "string"
    description: "Refactored code with comments explaining changes"
  - name: "breaking_changes"
    type: "string"
    description: "List of API changes (empty if none)"
  - name: "test_impact"
    type: "string"
    description: "Tests that may need updates"
dependencies:
  skills:
    - name: "code-review"
      version: "^1.0"
      optional: true
    - name: "test-writer"
      version: "^1.0"
      optional: true
  apis: []
  models:
    - "sonnet"
examples:
  - input: "Long method with mixed concerns"
    output: "Decomposed into focused methods with clear responsibilities"
    expected_model: "sonnet"
variants:
  opus:
    prompt_file: "prompts/detailed.md"
    description: "Deep refactoring; suggests architectural improvements"
    cost_factor: 2.5
    latency_baseline_ms: 700
  sonnet:
    prompt_file: "prompts/balanced.md"
    description: "Default; practical refactoring, safety-focused"
    cost_factor: 1
    latency_baseline_ms: 400
  haiku:
    prompt_file: "prompts/brief.md"
    description: "Simple refactoring only; obvious improvements"
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain:
    - "opus"
    - "sonnet"
    - "haiku"
tests:
  - id: "test-extract-method"
    type: "prompt-validation"
    input: "Long function mixing logging, business logic, and API calls"
    expected_substring: "extract"
    models_to_test:
      - "sonnet"
  - id: "test-preserve-contracts"
    type: "prompt-validation"
    input: "Function with specific signature constraints"
    expected_substring: "signature"
    models_to_test:
      - "sonnet"
docs:
  auto_generate_readme: true
  sections_to_include:
    - "description"
    - "inputs"
    - "outputs"
    - "examples"
  keywords:
    - "refactoring"
    - "code-quality"
    - "simplification"
    - "decomposition"
monitoring:
  enabled: true
  track_metrics:
    - "latency"
    - "breaking_changes_count"
version: "1.0.0"
changelog:
  1.0.0: "Initial release; structured refactoring"
tags:
  - "code-quality"
  - "refactoring"
capabilities:
  required: []
  optional:
    - "fs.read"
    - "fs.write"
  fallback_mode: "prompt-only"
  fallback_notes: "Can propose refactors or rewrite pasted code."
---

# Refactor

Perform structured code refactoring with safety checks.

Suggests extract-method, rename, decompose patterns; validates API contracts to ensure refactoring doesn't break code.

## When to use

When code is hard to read, has too many responsibilities, or violates DRY principle. Pair with `code-review` to identify issues and `test-writer` to ensure coverage.

## Instructions

1. Paste the code to refactor
2. Specify goal: simplify, extract-method, decompose, reduce-duplication, improve-readability
3. Specify any API constraints or invariants to preserve
4. Receive refactored code with:
   - Clear comments on what changed
   - Analysis of breaking changes (if any)
   - List of tests that may need updates

## Examples

### Example 1: Extract method

**Input:**

```javascript
function processOrder(order) {
  // Validate
  if (!order.items || order.items.length === 0) throw new Error("No items");
  if (!order.customer) throw new Error("No customer");

  // Calculate
  let total = 0;
  order.items.forEach((item) => {
    total += item.price * item.quantity;
  });

  // Apply discount
  if (order.customer.isVIP) {
    total *= 0.9;
  }

  // Save
  db.saveOrder({ ...order, total });
  return total;
}
```

**Output:**

```javascript
function processOrder(order) {
  validateOrder(order);
  const total = calculateTotal(order);
  applyDiscount(order.customer, total);
  db.saveOrder({ ...order, total });
  return total;
}

function validateOrder(order) {
  if (!order.items?.length) throw new Error("No items");
  if (!order.customer) throw new Error("No customer");
}

function calculateTotal(order) {
  return order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function applyDiscount(customer, total) {
  return customer.isVIP ? total * 0.9 : total;
}

// No breaking changes; tests may need minor updates if they spy on internal logic
```
