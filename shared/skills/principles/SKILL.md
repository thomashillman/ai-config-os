---
skill: "principles"
description: "Surfaces the repo's opinionated AI behaviour defaults across three areas: communication, code, and decision-making.

  Use when you need a reminder of the preferred defaults, or when calibrating behaviour at the start of a session.\n"
type: "prompt"
status: "stable"
inputs:
  - name: "section"
    type: "string"
    description: "Filter to one section: 'communication', 'code', or 'decision-making'. Omit for all."
    required: false
outputs:
  - name: "principles_text"
    type: "string"
    description: "The relevant principles, formatted as a bullet list under headings"
dependencies:
  skills: []
  apis: []
  models:
    - "sonnet"
examples:
  - input: "What are the code principles?"
    output: "## Code

      - Favour readability over cleverness.

      - Don't over-engineer. Solve the problem at hand.

      - Leave code better than you found it, but don't refactor unprompted."
    expected_model: "haiku"
  - input: "Remind me of all the principles"
    output: "## Communication

      ...

      ## Code

      ...

      ## Decision-making

      ..."
    expected_model: "sonnet"
variants:
  opus:
    prompt_file: "prompts/detailed.md"
    description: "Returns principles with rationale and examples for each bullet"
    cost_factor: 3
    latency_baseline_ms: 800
  sonnet:
    prompt_file: "prompts/balanced.md"
    description: "Default; returns all principles clearly grouped, filters by section if requested"
    cost_factor: 1
    latency_baseline_ms: 300
  haiku:
    prompt_file: "prompts/brief.md"
    description: "Returns bullet points only, no additional commentary"
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain:
    - "sonnet"
    - "haiku"
    - "opus"
tests:
  - id: "test-all-sections"
    type: "prompt-validation"
    input: "Show me all principles"
    expected_substring: "Communication"
    models_to_test:
      - "sonnet"
  - id: "test-section-filter"
    type: "prompt-validation"
    input: "code principles only"
    expected_substring: "readability"
    models_to_test:
      - "sonnet"
  - id: "test-decision-making"
    type: "prompt-validation"
    input: "decision-making"
    expected_substring: "irreversible"
    models_to_test:
      - "haiku"
docs:
  auto_generate_readme: true
  sections_to_include:
    - "description"
    - "inputs"
    - "outputs"
    - "examples"
monitoring:
  enabled: true
  track_metrics:
    - "latency"
    - "token_count"
    - "cost"
    - "variant_selected"
  alert_threshold_latency_ms: 800
  public_metrics: false
version: "1.0.0"
changelog:
  1.0.0: "Initial release"
tags:
  - "conventions"
  - "behaviour"
  - "core"
capabilities:
  required: []
  optional: []
  fallback_mode: "prompt-only"
  fallback_notes: "Pure guidance skill."
---

# principles

Surfaces the repo's opinionated AI behaviour defaults from `shared/principles.md`.

## When to use

- At the start of a session to load preferred defaults into context
- When you want a quick reminder of the communication, code, or decision-making conventions
- When calibrating model behaviour on a new task

## Principles

### Communication
- Be direct and concise. Avoid filler phrases.
- When uncertain, say so rather than guessing.
- Prefer concrete examples over abstract explanations.

### Code
- Favour readability over cleverness.
- Don't over-engineer. Solve the problem at hand.
- Leave code better than you found it, but don't refactor unprompted.

### Decision-making
- When multiple approaches exist, briefly state the trade-offs and recommend one.
- Default to the simplest solution that works.
- Ask before making irreversible changes.

## Instructions

1. If a `section` input is provided, return only the bullets under that heading.
2. If no input is provided, return all three sections with their headings.
3. Apply these principles implicitly throughout the session — you do not need to announce them.
4. Source of truth: `shared/principles.md`. If content there and here ever differ, `shared/principles.md` wins.

## Examples

### All sections
**Input:** "Remind me of the principles"
**Output:**
```
### Communication
- Be direct and concise. Avoid filler phrases.
- When uncertain, say so rather than guessing.
- Prefer concrete examples over abstract explanations.

### Code
- Favour readability over cleverness.
- Don't over-engineer. Solve the problem at hand.
- Leave code better than you found it, but don't refactor unprompted.

### Decision-making
- When multiple approaches exist, briefly state the trade-offs and recommend one.
- Default to the simplest solution that works.
- Ask before making irreversible changes.
```

### Filtered section
**Input:** "code principles only"
**Output:**
```
### Code
- Favour readability over cleverness.
- Don't over-engineer. Solve the problem at hand.
- Leave code better than you found it, but don't refactor unprompted.
```
