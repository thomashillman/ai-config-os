---
skill: simplify
description: |
  Review code for opportunities to reduce complexity, remove duplication, eliminate overengineering.
  Repo-native skill that complements the built-in simplify review.

type: prompt
status: stable

inputs:
  - name: code
    type: string
    description: Code snippet to simplify
    required: true
  - name: focus
    type: string
    description: "logic" (algorithm complexity), "structure" (OOP design), "duplication", "overengineering"
    required: false

outputs:
  - name: suggestions
    type: string
    description: Specific simplification opportunities with before/after examples
  - name: simplicity_score
    type: number
    description: 1-10 simplicity assessment (higher = simpler)

dependencies:
  skills: []
  apis: []
  models:
    - sonnet

examples:
  - input: "Complex conditional with nested if-else-if chains"
    output: "Suggest switch statement, early returns, or lookup table"
    expected_model: sonnet

variants:
  sonnet:
    prompt_file: prompts/balanced.md
    description: Default; practical simplification guidance
    cost_factor: 1.0
    latency_baseline_ms: 300

  haiku:
    prompt_file: prompts/brief.md
    description: Quick wins only (obvious simplifications)
    cost_factor: 0.3
    latency_baseline_ms: 150

  fallback_chain:
    - sonnet
    - haiku

tests:
  - id: test-duplication
    type: prompt-validation
    input: "Code with repeated patterns"
    expected_substring: "duplication"
    models_to_test:
      - sonnet

docs:
  auto_generate_readme: true
  sections_to_include:
    - description
    - inputs
    - outputs
  keywords:
    - simplification
    - refactoring
    - overengineering

monitoring:
  enabled: true
  track_metrics:
    - latency
    - suggestion_count

version: "1.0.0"
changelog:
  "1.0.0": "Initial release; code simplification guidance"

tags:
  - code-quality
  - refactoring
---

# Simplify

Review code for opportunities to reduce complexity, remove duplication, eliminate overengineering.

Repo-native skill that complements the built-in simplify code review in Claude Code.

## When to use

When code feels complex or bloated, or after implementing a feature to see if it can be made simpler.

## Instructions

1. Paste the code
2. Optionally specify focus: logic, structure, duplication, overengineering
3. Receive specific simplification opportunities with before/after examples
4. Apply suggestions that make sense for your codebase

Follows CLAUDE.md principle: "Don't over-engineer. Avoid premature abstractions."

## Examples

### Example 1: Conditional chains
**Input:**
```javascript
function getUserRole(user) {
  if (user.isAdmin) {
    return "admin";
  } else if (user.isModerator) {
    return "moderator";
  } else if (user.isUser) {
    return "user";
  } else {
    return "guest";
  }
}
```
**Output:**
```javascript
// SIMPLER: Early returns (flatter structure)
function getUserRole(user) {
  if (user.isAdmin) return "admin";
  if (user.isModerator) return "moderator";
  if (user.isUser) return "user";
  return "guest";
}

// EVEN SIMPLER: Lookup approach (for fixed mappings)
const roleMap = {
  isAdmin: "admin",
  isModerator: "moderator",
  isUser: "user",
};
function getUserRole(user) {
  for (const [key, role] of Object.entries(roleMap)) {
    if (user[key]) return role;
  }
  return "guest";
}
```
