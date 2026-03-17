---
skill: "momentum-reflect"
description: "Analyzes momentum narration effectiveness and proposes improvements.

  Reads observation data (narration+response pairs) from the progress event
  pipeline and produces improvement insights for templates and intent coverage.\n"
type: "agent"
status: "experimental"
inputs:
  - name: "observation_window"
    type: "string"
    description: "ISO 8601 duration or timestamp for how far back to look (default: last 24h)"
    required: false
outputs:
  - name: "report"
    type: "object"
    description: "Reflection report with engagement stats, insights, and improvement suggestions"
dependencies:
  skills: []
  apis: []
  models:
    - "sonnet"
examples:
  - input: "Reflect on narration effectiveness"
    output: "Report with template effectiveness insights and intent coverage gaps"
    expected_model: "sonnet"
variants:
  sonnet:
    prompt_file: "prompts/balanced.md"
    description: "Default; balanced analysis of narration patterns"
    cost_factor: 1
    latency_baseline_ms: 400
  haiku:
    prompt_file: "prompts/brief.md"
    description: "Quick summary of engagement rates"
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain:
    - "sonnet"
    - "haiku"
tests:
  - id: "test-reflection"
    type: "prompt-validation"
    input: "Analyze momentum narration patterns"
    expected_substring: "engagement"
    models_to_test:
      - "sonnet"
docs:
  auto_generate_readme: true
  sections_to_include:
    - "description"
    - "inputs"
    - "outputs"
  keywords:
    - "self-improvement"
    - "narration"
    - "momentum"
monitoring:
  enabled: true
  track_metrics:
    - "latency"
    - "insight_count"
version: "1.0.0"
changelog:
  1.0.0: "Initial release; report-only analysis of narration effectiveness"
capabilities:
  required:
    - "fs.read"
  optional:
    - "fs.write"
  fallback_mode: "prompt-only"
  fallback_notes: "Can analyze pasted observation data without filesystem access."
---

# momentum-reflect

Analyzes momentum narration effectiveness and proposes improvements to templates and intent definitions.

## Usage

Run manually or via the self-improvement loop:

```
/momentum-reflect
/loop 10m /momentum-reflect
```

## What it analyzes

1. **Template effectiveness** — which narration points get engagement vs. are ignored
2. **Upgrade acceptance rate** — how often users accept upgrade narrations
3. **Finding narrative impact** — do evolved finding narratives drive engagement?
4. **Intent coverage gaps** — unresolved phrases that could map to known task types
5. **Response time patterns** — do certain narrations get faster responses?

## Output

Returns a structured report with:
- Engagement statistics (total narrations, responses, engagement rate)
- Insights with evidence and confidence scores
- Improvement suggestions (report-only in v1)

Suggestions with confidence < 0.6 are flagged as "needs human review".
