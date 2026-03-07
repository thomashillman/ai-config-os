---
skill: "context-budget"
description: "Guidelines for managing context window efficiently.

  Use when planning token usage, deciding on subagent strategies, or optimizing prompts.\n"
type: "prompt"
status: "stable"
inputs:
  - name: "task_description"
    type: "string"
    description: "What you're trying to accomplish"
    required: true
  - name: "current_context_depth"
    type: "integer"
    description: "Approximate current message count or token estimate"
    required: false
outputs:
  - name: "strategy"
    type: "object"
    description: "Recommended context management approach with token budget"
dependencies:
  skills: []
  apis: []
  models:
    - "opus"
    - "sonnet"
    - "haiku"
examples:
  - input: "Long research task with 50+ documents"
    output: "Use subagent for research, batch summaries, return synthesized findings"
    expected_model: "opus"
variants:
  opus:
    prompt_file: "prompts/detailed.md"
    description: "Deep strategy for complex multi-phase tasks"
    cost_factor: 3
    latency_baseline_ms: 800
  sonnet:
    prompt_file: "prompts/balanced.md"
    description: "Practical rules for typical tasks"
    cost_factor: 1
    latency_baseline_ms: 300
  haiku:
    prompt_file: "prompts/brief.md"
    description: "Quick checklist for immediate decisions"
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain:
    - "sonnet"
    - "opus"
    - "haiku"
tests:
  - id: "test-subagent-decision"
    type: "prompt-validation"
    input: "Is it worth using a subagent for this research task?"
    expected_substring: "subagent"
    models_to_test:
      - "sonnet"
  - id: "test-summarization-strategy"
    type: "prompt-validation"
    input: "How to handle 100+ message conversation?"
    expected_not_null: true
composition:
  personas:
    - name: "token-manager"
      skills:
        - "context-budget"
        - "principles"
docs:
  auto_generate_readme: true
  sections_to_include:
    - "description"
    - "inputs"
    - "outputs"
    - "variants"
  keywords:
    - "context"
    - "tokens"
    - "efficiency"
    - "strategy"
monitoring:
  enabled: true
  track_metrics:
    - "latency"
    - "token_count"
    - "variant_selected"
  alert_threshold_latency_ms: 2000
version: "1.0.0"
changelog:
  1.0.0: "Initial release"
tags:
  - "efficiency"
  - "strategy"
  - "tokens"
capabilities:
  required: []
  optional: []
  fallback_mode: "prompt-only"
  fallback_notes: "Pure guidance skill."
---

# context-budget

Guidelines for managing context window efficiently — when to use subagents, summarization, archiving, or simpler approaches.

## When to use

When planning a complex task, deciding whether to use subagents, or trying to optimize token usage for constraints.

## Instructions

Provide context management strategies considering:

1. **Token Budget**: Estimate tokens available vs. needed
2. **Task Complexity**: Single-step, multi-phase, iterative?
3. **Subagent vs. Direct**: When does delegation make sense?
4. **Summarization**: When to drop old context or summarize?
5. **Output Handling**: Keep results inline or send to files?

Use these tiers:

- **Green**: Plenty of context left (>50% available). Simple direct approach OK.
- **Yellow**: Moderate context (~25-50%). Consider summarization or subagent.
- **Red**: Tight context (<25%). Archive messages, use subagents aggressively, or split task.
