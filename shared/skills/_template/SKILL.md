---
# Identity & Description
skill: {{SKILL_NAME}}
# name: {{SKILL_NAME}}  # Optional — auto-injected from 'skill' during claude-code emission.
#                         # Set explicitly only to override the slash-command name.
description: |
  One sentence: what this skill does and when to use it.
  Additional context (one paragraph max).

# Type & Status
type: prompt  # or: hook, agent, workflow-blueprint
status: stable  # or: experimental, deprecated

# Capability Contract
# Declare the MINIMUM capabilities this skill needs to be useful.
# Do not list a capability as required if the skill can work from pasted input.
capabilities:
  required: []          # Capabilities the skill cannot function without
  optional: []          # Capabilities that improve fidelity but aren't essential
  fallback_mode: prompt-only  # none | manual | prompt-only
  fallback_notes: This skill can operate from pasted input when local tools are unavailable.

# Platform Overrides (optional — only add if needed)
# Compatibility is computed from capabilities vs platform states.
# Use platforms: only for packaging overrides, degradation notes, or exclusions.
platforms: {}

# Feature 1: Dependencies & Metadata
inputs:
  - name: input_name
    type: string
    description: Description of input
    required: true
  - name: optional_input
    type: string
    description: Optional input field
    required: false

outputs:
  - name: output_name
    type: string
    description: Description of output

dependencies:
  skills:
    - name: dependency-skill
      version: "^1.0"  # semver; means >= 1.0, < 2.0
      optional: false
  apis:
    - external-api-name  # Name of external API if any
  models:
    - opus  # Required model capability (or sonnet/haiku)

examples:
  - input: "Example user input"
    output: "Example output from skill"
    expected_model: sonnet  # Hint for variant testing

# Feature 2: Multi-Model Variants
variants:
  opus:
    prompt_file: prompts/detailed.md
    description: Longer, more nuanced responses for complex topics
    cost_factor: 3.0  # Relative to baseline (Sonnet)
    latency_baseline_ms: 800

  sonnet:
    prompt_file: prompts/balanced.md
    description: Default variant; fast and accurate
    cost_factor: 1.0
    latency_baseline_ms: 300

  haiku:
    prompt_file: prompts/brief.md
    description: Concise responses for simple queries
    cost_factor: 0.3
    latency_baseline_ms: 150

  fallback_chain:
    - opus
    - sonnet
    - haiku  # If all else fails, use Haiku

# Feature 3: Skill Testing
tests:
  - id: test-basic
    type: prompt-validation  # or: structure-check, integration, performance
    input: "Example input to test"
    expected_substring: "expected text"
    max_latency_ms: 1000
    models_to_test:
      - opus
      - sonnet

  - id: test-edge-case
    type: prompt-validation
    input: ""  # Test edge case
    expected_not_null: true

# Feature 4: Skill Composition (Optional)
composition:
  personas:
    - name: persona-name
      description: Description of how this skill fits
      skills:
        - this-skill
        - related-skill
  workflows:
    - name: workflow-name
      description: Workflow using this skill

# Feature 5: Auto-Generated Documentation
docs:
  auto_generate_readme: true
  sections_to_include:
    - description
    - inputs
    - outputs
    - examples
    - dependencies
  help_text: "Ask me to {skill_description} in detail."
  keywords:
    - keyword1
    - keyword2

# Feature 6: Performance Monitoring
monitoring:
  enabled: true
  track_metrics:
    - latency
    - token_count
    - cost
    - variant_selected
  alert_threshold_latency_ms: 2000
  public_metrics: false  # Include in shared analytics

# Versioning
version: "1.0.0"  # semver for skill definition
changelog:
  "1.0.0": "Initial release"

tags:
  - utility
  - core
---

# {{SKILL_NAME}}

One sentence: what this skill does and when to use it.

Additional context (one paragraph max).

## Capability contract

Declare the minimum capabilities this skill needs to be useful.
Do not list a capability as required if the skill can still work from pasted input.
Use `platforms:` only for packaging overrides, degradation notes, or explicit exclusions.

Available capabilities: `fs.read`, `fs.write`, `shell.exec`, `shell.long-running`,
`git.read`, `git.write`, `network.http`, `browser.fetch`, `mcp.client`, `env.read`,
`secrets.inject`, `ui.prompt-only`.

## When to use

Describe the trigger conditions — what user request or context activates this skill.

## Instructions

The actual instructions Claude should follow when this skill is invoked.

## Examples

### Example 1
**Input:** Example user input
**Output:** Example output from skill

### Example 2
**Input:** Another example
**Output:** Another example output
