---
skill: autoresearch
description: |
  Autonomously optimise any skill by running it repeatedly, scoring outputs against
  binary evals, mutating the prompt, and keeping improvements. Based on Karpathy's
  autoresearch methodology.

  Use when: "optimise this skill", "improve this skill", "run autoresearch on",
  "make this skill better", "self-improve skill", "benchmark skill", "eval my skill",
  "run evals on". Outputs: an improved SKILL.md copy, a results log, and a changelog
  of every mutation tried.
type: agent
status: experimental
disable-model-invocation: true
inputs:
  - name: skill_path
    type: string
    description: Path to the SKILL.md file to optimise
    required: true
  - name: test_inputs
    type: array
    description: 3-5 varied prompts/scenarios to test the skill with
    required: true
  - name: eval_criteria
    type: array
    description: 3-6 binary yes/no checks that define a good output
    required: true
  - name: runs_per_experiment
    type: number
    description: How many times to run the skill per mutation (default 5)
    required: false
  - name: run_interval_seconds
    type: number
    description: Seconds between experiment cycles (default 120)
    required: false
  - name: budget_cap
    type: number
    description: Max experiment cycles before stopping (default unlimited)
    required: false
outputs:
  - name: improved_skill
    type: string
    description: Path to the improved skill file in the autoresearch working directory
  - name: results_tsv
    type: string
    description: Tab-separated experiment log
  - name: changelog
    type: string
    description: Detailed mutation log with reasoning and outcomes
  - name: dashboard
    type: string
    description: Path to the self-contained HTML live dashboard
dependencies:
  skills: []
  apis: []
  models:
    - opus
    - sonnet
    - haiku
examples:
  - input: "Run autoresearch on my commit-conventions skill"
    output: "Improved SKILL.md copy, results.tsv, changelog.md, dashboard.html"
    expected_model: sonnet
variants:
  opus:
    prompt_file: "prompts/detailed.md"
    description: "Deep hypothesis-driven loop with mutation quality checks and root cause analysis"
    cost_factor: 3.0
    latency_baseline_ms: 800
  sonnet:
    prompt_file: "prompts/balanced.md"
    description: "Standard loop; best balance of depth and speed (default)"
    cost_factor: 1.0
    latency_baseline_ms: 400
  haiku:
    prompt_file: "prompts/brief.md"
    description: "Minimal fallback; sonnet or opus recommended for complex skills"
    cost_factor: 0.3
    latency_baseline_ms: 200
  fallback_chain:
    - "opus"
    - "sonnet"
    - "haiku"
capabilities:
  required:
    - fs.read
    - fs.write
    - shell.exec
  optional:
    - browser.fetch
  fallback_mode: manual
  fallback_notes: >
    Without shell.exec the dashboard cannot be opened automatically.
    The user can open dashboard.html manually.
tests:
  - id: test-context-gathering
    type: prompt-validation
    input: "Run autoresearch on my skill"
    expected_substring: "skill_path"
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
    - autoresearch
    - optimisation
    - evals
    - self-improvement
monitoring:
  enabled: true
  track_metrics:
    - latency
    - token_count
version: "1.0.0"
changelog:
  1.0.0: "Initial release; full Karpathy autoresearch loop with live HTML dashboard"
---

# autoresearch

Autonomously optimise any Claude Code skill using the Karpathy autoresearch loop:
run the skill repeatedly, score outputs against binary evals, mutate the prompt,
keep improvements, repeat until 95%+ pass rate or stopped.

**Invoke with:** `/autoresearch` -- never triggered automatically.

## What it produces

```
autoresearch-[skill-name]/
|-- dashboard.html    # live browser dashboard (auto-refreshes every 10s)
|-- results.json      # data powering the dashboard
|-- results.tsv       # score log for every experiment
|-- changelog.md      # mutation log with reasoning and outcomes
|-- SKILL.md.baseline # original before optimisation
```

The original SKILL.md is never modified. The improved version lives in
`[user-chosen-name].md` for the user to review and apply.

## Critical: read your outputs first

Do not let the agent generate your eval criteria from scratch. Run the skill on
10+ varied inputs, read every output, note what's wrong. Those observations become
your eval checklist. Evals measuring an imagined problem produce a machine that's
efficient at measuring the wrong thing.

See [references/eval-guide.md](references/eval-guide.md) for how to write
binary yes/no evals that actually improve output quality.
