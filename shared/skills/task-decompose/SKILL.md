---
skill: "task-decompose"
description: "Break down vague or large tasks into discrete, single-session subtasks with clear acceptance criteria and dependency ordering."
type: "prompt"
status: "stable"
inputs:
  - name: "task_description"
    type: "string"
    description: "High-level task or goal to decompose"
    required: true
  - name: "constraints"
    type: "string"
    description: "Optional constraints (time budget, tech stack, scope limits)"
    required: false
outputs:
  - name: "subtasks"
    type: "array"
    description: "Array of subtask objects with title, acceptance_criteria, blockers, and dependencies"
dependencies:
  skills: []
  apis: []
  models:
    - "sonnet"
    - "opus"
    - "haiku"
variants:
  opus:
    prompt_file: "prompts/architectural.md"
    description: "Architectural breakdown with dependency graph"
    cost_factor: 3
    latency_baseline_ms: 900
  sonnet:
    prompt_file: "prompts/standard.md"
    description: "Standard decomposition (default)"
    cost_factor: 1
    latency_baseline_ms: 350
  haiku:
    prompt_file: "prompts/quick-scope.md"
    description: "Quick scope check and high-level breakdown"
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain:
    - "sonnet"
    - "opus"
    - "haiku"
tests:
  - id: "test-vague-task"
    type: "prompt-validation"
    input: '{"task_description": "Improve the codebase"}'
    expected_substring: "subtasks"
    models_to_test:
      - "sonnet"
  - id: "test-constrained-task"
    type: "prompt-validation"
    input: '{"task_description": "Add dark mode", "constraints": "2 days, React only, no API changes"}'
    expected_substring: "acceptance_criteria"
    models_to_test:
      - "sonnet"
composition:
  personas: []
docs:
  auto_generate_readme: true
  sections_to_include:
    - "description"
    - "inputs"
    - "outputs"
    - "instructions"
monitoring:
  enabled: true
  track_metrics:
    - "latency"
    - "token_count"
    - "cost"
    - "variant_selected"
version: "1.0.0"
changelog:
  1.0.0: "Initial release with constraint-aware decomposition and dependency ordering"
tags:
  - "core"
  - "workflow"
  - "planning"
capabilities:
  required: []
  optional: []
  fallback_mode: "prompt-only"
  fallback_notes: "Pure reasoning skill."
---

## When to use

Use `task-decompose` when:

- Facing a vague or ill-scoped task
- Need to break work into parallel or sequential chunks
- Want to identify blockers before starting
- Planning sprints or session roadmaps
- Estimating effort across unknown scope

## Instructions

1. **Identify scope**: Map known vs unknown domain knowledge; surface assumptions
2. **Slice into subtasks**: Aim for ≤1 session per subtask (4–8 hours); flag dependencies
3. **Write observable acceptance criteria**: Each subtask must have verifiable done state
4. **Flag blockers**: Identify external dependencies, missing information, or risks
5. **Order by dependency**: Use topological sort; mark tasks as parallelizable when safe
6. **Opus variant**: Include full dependency graph (ASCII DAG), trade-off analysis, resource constraints
7. **Haiku variant**: Rapid scope check; flag if task is too vague to decompose reliably

## Examples

### Input

```json
{
  "task_description": "Add dark mode to the application",
  "constraints": "2 days, React-only, no breaking API changes"
}
```

### Output (sonnet)

```json
{
  "subtasks": [
    {
      "title": "Design color palette and tokens",
      "acceptance_criteria": [
        "YAML or JSON color token file with light and dark variants",
        "All 8+ semantic colors defined (primary, secondary, accent, error, etc.)",
        "Approved by design team (async review accepted)"
      ],
      "blockers": ["Design approval dependency"],
      "dependencies": [],
      "estimated_hours": 2
    },
    {
      "title": "Create ThemeContext and hook",
      "acceptance_criteria": [
        "useTheme() hook exports current theme and setTheme callback",
        "Context provider wraps app root",
        "localStorage persists preference",
        "Tests: 2+ tests for toggle and persistence"
      ],
      "blockers": [],
      "dependencies": ["Design color palette and tokens"],
      "estimated_hours": 3
    },
    {
      "title": "Refactor components to use theme tokens",
      "acceptance_criteria": [
        "All color hardcodes replaced with theme tokens",
        "CSS modules or styled-components updated",
        "No visual regressions in light mode"
      ],
      "blockers": ["May require component tree audit first"],
      "dependencies": ["Create ThemeContext and hook"],
      "estimated_hours": 4
    },
    {
      "title": "Test dark mode across browsers",
      "acceptance_criteria": [
        "Chrome, Firefox, Safari: contrast ratio ≥4.5:1 WCAG AA",
        "No flickering on page reload",
        "Preference syncs across tabs"
      ],
      "blockers": [],
      "dependencies": ["Refactor components to use theme tokens"],
      "estimated_hours": 2
    }
  ]
}
```

### Output (opus variant with dependency graph)

```json
{
  "subtasks": [
    {
      "title": "Design color palette and tokens",
      "acceptance_criteria": [
        "YAML color token file with light/dark variants",
        "8+ semantic colors defined",
        "Design review approval (async)"
      ],
      "blockers": ["Design team approval"],
      "dependencies": [],
      "estimated_hours": 2,
      "risk": "low"
    },
    {
      "title": "Create ThemeContext and hook",
      "acceptance_criteria": [
        "useTheme() hook functional",
        "localStorage persistence",
        "2+ unit tests"
      ],
      "blockers": [],
      "dependencies": ["Design color palette and tokens"],
      "estimated_hours": 3,
      "risk": "low"
    },
    {
      "title": "Refactor components (Phase 1: UI library)",
      "acceptance_criteria": [
        "Button, Link, Card components use theme tokens",
        "No visual regressions",
        "Snapshot tests updated"
      ],
      "blockers": [],
      "dependencies": ["Create ThemeContext and hook"],
      "estimated_hours": 3,
      "risk": "medium",
      "parallelizable_with": ["Refactor components (Phase 2: pages)"]
    },
    {
      "title": "Refactor components (Phase 2: pages)",
      "acceptance_criteria": [
        "All page-level components use theme tokens",
        "No hardcoded colors remain"
      ],
      "blockers": [],
      "dependencies": ["Create ThemeContext and hook"],
      "estimated_hours": 3,
      "risk": "medium",
      "parallelizable_with": ["Refactor components (Phase 1: UI library)"]
    },
    {
      "title": "Browser testing and fixes",
      "acceptance_criteria": [
        "Chrome, Firefox, Safari: ≥4.5:1 contrast",
        "No reload flicker"
      ],
      "blockers": [],
      "dependencies": [
        "Refactor components (Phase 1: UI library)",
        "Refactor components (Phase 2: pages)"
      ],
      "estimated_hours": 2,
      "risk": "low"
    }
  ],
  "dependency_graph": "Design → Context → [UI lib || Pages] → Testing",
  "critical_path_hours": 11,
  "parallelizable_hours": 3,
  "total_estimated_hours": 14,
  "risk_summary": "Medium: component refactor scope. Mitigation: parallel phases reduce wall-clock time."
}
```
