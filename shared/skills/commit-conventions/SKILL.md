---
skill: "commit-conventions"
description: "Surfaces the Conventional Commits prefix rules used in this repo and helps draft well-formed commit messages.

  Use when writing or reviewing a git commit message, or when unsure which prefix applies to a change.\n"
type: "prompt"
status: "stable"
inputs:
  - name: "context"
    type: "string"
    description: "Description of the change being committed (files changed, intent, scope)"
    required: false
outputs:
  - name: "commit_message"
    type: "string"
    description: "A well-formed commit message following Conventional Commits"
dependencies:
  skills: []
  apis: []
  models:
    - "sonnet"
examples:
  - input: "Added a new script that creates skill directories and bumps the plugin version"
    output: "feat: add ops/new-skill.sh scaffold script"
    expected_model: "sonnet"
  - input: "Fixed a broken symlink in the core-skills plugin"
    output: "fix: repair broken symlink for session-start-hook"
    expected_model: "haiku"
variants:
  opus:
    prompt_file: "prompts/detailed.md"
    description: "Explains the rationale behind each prefix choice and suggests scope annotations"
    cost_factor: 3
    latency_baseline_ms: 800
  sonnet:
    prompt_file: "prompts/balanced.md"
    description: "Default; picks the correct prefix and drafts the message concisely"
    cost_factor: 1
    latency_baseline_ms: 300
  haiku:
    prompt_file: "prompts/brief.md"
    description: "Returns only the commit message line, no explanation"
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain:
    - "sonnet"
    - "opus"
    - "haiku"
tests:
  - id: "test-feat-prefix"
    type: "prompt-validation"
    input: "Added dark mode toggle to settings page"
    expected_substring: "feat:"
    models_to_test:
      - "sonnet"
  - id: "test-fix-prefix"
    type: "prompt-validation"
    input: "Fixed null pointer in auth middleware"
    expected_substring: "fix:"
    models_to_test:
      - "sonnet"
  - id: "test-docs-prefix"
    type: "prompt-validation"
    input: "Updated README with installation instructions"
    expected_substring: "docs:"
    models_to_test:
      - "sonnet"
  - id: "test-style-prefix"
    type: "prompt-validation"
    input: "Updated CSS for button styling"
    expected_substring: "style:"
    models_to_test:
      - "sonnet"
  - id: "test-refactor-prefix"
    type: "prompt-validation"
    input: "Reorganized module structure without behavior change"
    expected_substring: "refactor:"
    models_to_test:
      - "sonnet"
  - id: "test-build-prefix"
    type: "prompt-validation"
    input: "Updated webpack configuration and build scripts"
    expected_substring: "build:"
    models_to_test:
      - "sonnet"
  - id: "test-chore-prefix"
    type: "prompt-validation"
    input: "Bumped package version and updated lock file"
    expected_substring: "chore:"
    models_to_test:
      - "sonnet"
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
  alert_threshold_latency_ms: 1000
  public_metrics: false
version: "1.0.0"
changelog:
  1.0.0: "Initial release"
tags:
  - "git"
  - "conventions"
  - "core"
capabilities:
  required: []
  optional:
    - "git.read"
  fallback_mode: "prompt-only"
  fallback_notes: "Can draft from pasted commit intent."
---

# commit-conventions

Surfaces the Conventional Commits prefix rules used in this repo and helps draft well-formed commit messages.

## When to use

When you are about to commit and need to:
- Choose the correct prefix for the change type
- Draft a commit subject line (imperative mood, ≤72 chars)
- Review whether a message follows the repo's conventions

## Prefix reference

| Prefix | Use for |
|--------|---------|
| `feat:` | New feature or capability |
| `fix:` | Bug fix |
| `style:` | CSS or formatting-only change (no logic change) |
| `refactor:` | Restructure without behaviour change |
| `docs:` | Documentation only |
| `build:` | Build system, tooling, CI/CD |
| `chore:` | Maintenance (deps, version bumps, cleanup) |

## Instructions

1. Identify the primary intent of the change — not what files changed, but why.
2. Select the prefix from the table above that best matches the intent.
3. Write the subject in **imperative mood** ("add", "fix", "remove" — not "added" or "fixes").
4. Keep the subject line to **72 characters or fewer**.
5. Do not end the subject line with a period.
6. If the change is complex, add a blank line then a short body paragraph explaining the "why".

If `context` input is provided, apply these rules to produce a complete commit message. If no input is provided, explain the conventions and offer to help with a specific message.

## Examples

### New feature
```
feat: add ops/new-skill.sh scaffold script
```

### Bug fix
```
fix: repair broken symlink for session-start-hook
```

### Documentation update
```
docs: add CLAUDE.md with dev conventions and git workflow
```

### Multi-line commit (complex change)
```
refactor: split marketplace discovery from loading

Decouples the plugin scan from the install step so that
scan failures do not abort partial installs.
```
