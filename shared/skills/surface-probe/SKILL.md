---
skill: "surface-probe"
description: "Investigates environment signals when a user manually states their surface or platform.

  Gathers all available indicators (env vars, session metadata, context clues) and produces
  a structured report to improve future automatic detection in ops/capability-probe.sh.\n"
type: "prompt"
status: "experimental"
capabilities:
  required: []
  optional:
    - "shell.exec"
    - "env.read"
  fallback_mode: "prompt-only"
  fallback_notes: "On mobile/web platforms without shell access, Claude investigates from observable context and session metadata."
platforms: {}
inputs:
  - name: "stated_surface"
    type: "string"
    description: "The surface the user stated (e.g. 'iOS', 'Claude web app', 'mobile browser', 'Cursor')"
    required: true
outputs:
  - name: "investigation_report"
    type: "object"
    description: "Structured report with stated_surface, detected_platform, detected_surface, new_signals, and recommendation"
dependencies:
  skills: []
  apis: []
  models:
    - "sonnet"
    - "haiku"
examples:
  - input: "I'm using the Claude iOS app"
    output: "Investigation report: stated=mobile-ios, detected=claude-code-remote/desktop-cli, signal found: CLAUDE_CODE_ENTRYPOINT=remote_mobile, recommendation: check CLAUDE_CODE_ENTRYPOINT before CLAUDE_CODE_REMOTE in detect_platform()"
    expected_model: "sonnet"
  - input: "I'm on the Claude web app in a mobile browser"
    output: "Investigation report: stated=mobile-web, detected=claude-web/web-app, no distinguishing signal found between mobile and desktop browser, recommendation: CLAUDE_SURFACE override required"
    expected_model: "haiku"
variants:
  sonnet:
    prompt_file: "prompts/standard.md"
    description: "Full environment investigation with structured output and concrete recommendations"
    cost_factor: 1.0
    latency_baseline_ms: 300
  haiku:
    prompt_file: "prompts/brief.md"
    description: "Quick signal check; one-paragraph summary without full structured report"
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain:
    - "sonnet"
    - "haiku"
tests:
  - id: "test-structure"
    type: "structure-check"
    input: "I am using Claude Code on iOS"
    expected_not_null: true
    models_to_test:
      - "sonnet"
  - id: "test-report-fields"
    type: "prompt-validation"
    input: "I'm on the web app"
    expected_substring: "stated_surface"
    models_to_test:
      - "sonnet"
docs:
  auto_generate_readme: true
  sections_to_include:
    - "description"
    - "inputs"
    - "outputs"
    - "examples"
  help_text: "Investigate environment signals when {stated_surface} doesn't match what was auto-detected."
  keywords:
    - "surface"
    - "platform"
    - "detection"
    - "ios"
    - "mobile"
    - "web"
    - "environment"
monitoring:
  enabled: true
  track_metrics:
    - "latency"
    - "token_count"
    - "variant_selected"
  alert_threshold_latency_ms: 3000
  public_metrics: false
version: "1.0.0"
changelog:
  1.0.0: "Initial release; auto-triggered when user manually states their surface"
tags:
  - "surface"
  - "platform"
  - "detection"
  - "diagnostics"
---

# surface-probe

Investigates environment signals when a user manually states their surface or platform.

Runs automatically when a user corrects or declares their surface (e.g. "I'm on iOS", "I'm using the web app"). Gathers all available indicators and produces a structured report that can improve future automatic detection in `ops/capability-probe.sh`.

## When to use

Invoke this skill whenever a user **manually states or corrects their surface/platform**. Trigger phrases:

- "I'm on iOS / I'm using the iOS app"
- "I'm using the web app / mobile browser / Claude web"
- "I'm on Cursor / Codex / the desktop app"
- Correcting a wrong surface detection ("that's wrong, I'm on...")

## Instructions

Follow the instructions in the active variant prompt file. In summary:

1. Acknowledge the stated surface and compare it to what the capability probe currently reports
2. Investigate all available environment signals
3. Produce a structured report with any newly discovered signals
4. Recommend a concrete change to `ops/capability-probe.sh` if a reliable signal is found
5. Suggest `CLAUDE_SURFACE=<value>` as a session workaround if auto-detection cannot be fixed

## Examples

### User on iOS
**Input:** "I'm using the Claude iOS app"
**Output:** Report showing `CLAUDE_CODE_ENTRYPOINT=remote_mobile` as a new signal, with recommendation to check it before `CLAUDE_CODE_REMOTE` in `detect_platform()`.

### User on mobile browser
**Input:** "I'm accessing Claude Code from a mobile browser"
**Output:** Report noting that mobile vs desktop browser is indistinguishable from within the remote shell; recommends `CLAUDE_SURFACE=mobile-app` as workaround.
