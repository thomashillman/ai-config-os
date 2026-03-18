---
skill: list-available-skills
description: |
  List skills available on the current surface, filtered by detected runtime capabilities.
  Reads the cached capability probe and manifest, classifies each skill into available,
  degraded, excluded, or unavailable, and presents a surface-aware grouped summary.

type: prompt
status: stable

capabilities:
  required: [fs.read, env.read]
  optional: [shell.exec]
  fallback_mode: prompt-only
  fallback_notes: Without shell.exec, probe data may be stale; skill still works from cached probe file.

platforms: {}

inputs:
  - name: surface_override
    type: string
    description: Surface hint override (e.g. ci-pipeline, desktop-cli). Auto-detected from probe if omitted.
    required: false

outputs:
  - name: skill_list
    type: string
    description: Grouped list of available, degraded, excluded, and unavailable skills with surface context.

dependencies:
  skills: []
  apis: []
  models: [sonnet, haiku]

examples:
  - input: "What skills can I use here?"
    output: "Surface: desktop-cli (claude-code)\n\nAVAILABLE (24)\n  • changelog — Generate structured changelog entries..."
    expected_model: sonnet

variants:
  sonnet:
    prompt_file: prompts/default.md
    description: Standard skill listing with surface context and grouping
    cost_factor: 1.0
    latency_baseline_ms: 300
  haiku:
    prompt_file: prompts/brief.md
    description: Compact one-line-per-skill listing
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain: [sonnet, haiku]

docs:
  auto_generate_readme: false
  help_text: "List skills available on the current surface. Usage: /list-available-skills"
  keywords:
    - skills
    - capabilities
    - surface
    - discovery
    - filter

version: "1.0.0"
changelog:
  "1.0.0": "Initial release — surface-aware skill discovery"

tags:
  - utility
  - core
---

# list-available-skills

List which skills are usable on the current surface, filtered by runtime capability probe results.

## When to use

Invoke when the user asks: "what skills can I use here?", "list available skills", or "/list-available-skills".

## Capability buckets

| Bucket | Meaning |
|---|---|
| **available** | All required + optional capabilities supported |
| **degraded** | All required caps supported; ≥1 optional cap missing (works with reduced fidelity) |
| **excluded** | Required capability unsupported, but a fallback mode exists (e.g. prompt-only) |
| **unavailable** | Required capability unsupported; no fallback |

## Instructions

Follow the prompt in `prompts/default.md` (or `prompts/brief.md` for haiku variant).
