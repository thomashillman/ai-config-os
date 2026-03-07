---
skill: "changelog"
description: "Generate structured changelog entries from git history, grouping commits by conventional prefix and flagging breaking changes."
type: "workflow-blueprint"
status: "stable"
inputs:
  - name: "since_ref"
    type: "string"
    description: "Git reference (tag or commit hash) to start changelog from, e.g. \"v0.3.0\""
    required: true
  - name: "version"
    type: "string"
    description: "Target version string for the changelog entry (e.g. \"1.0.0\")"
    required: true
outputs:
  - name: "changelog_entry"
    type: "string"
    description: "Formatted markdown changelog entry with grouped commits and breaking change flags"
dependencies:
  skills:
    - name: "commit-conventions"
      version: "^1.0"
      optional: false
  apis: []
  models:
    - "sonnet"
    - "opus"
    - "haiku"
variants:
  opus:
    prompt_file: "prompts/detailed.md"
    description: "Detailed changelog with migration notes and guidance"
    cost_factor: 3
    latency_baseline_ms: 1000
  sonnet:
    prompt_file: "prompts/standard.md"
    description: "Standard changelog entry (default)"
    cost_factor: 1
    latency_baseline_ms: 400
  haiku:
    prompt_file: "prompts/one-liner.md"
    description: "Minimal one-liner per feature"
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain:
    - "sonnet"
    - "haiku"
    - "opus"
tests:
  - id: "test-basic-entry"
    type: "prompt-validation"
    input: "{\"since_ref\": \"v0.2.0\", \"version\": \"0.3.0\"}"
    expected_substring: "feat:"
    models_to_test:
      - "sonnet"
  - id: "test-breaking-change"
    type: "prompt-validation"
    input: "{\"since_ref\": \"v0.3.0\", \"version\": \"1.0.0\"}"
    expected_substring: "BREAKING CHANGE"
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
  1.0.0: "Initial release with support for conventional commit grouping and breaking change detection"
tags:
  - "core"
  - "workflow"
  - "documentation"
capabilities:
  required:
    - "git.read"
  optional:
    - "fs.read"
  fallback_mode: "manual"
  fallback_notes: "Can generate from pasted commit history."
platforms:
  claude-ios:
    mode: "degraded"
    notes: "Prompt-only from pasted history"
---

## When to use

Use `changelog` when:
- Preparing a new release and need structured commit history
- Generating release notes with grouped features, fixes, and breaking changes
- Automating changelog generation across versions
- Creating migration guides for major version bumps

## Instructions

1. **Fetch git history**: Run `git log --oneline <since_ref>..HEAD` to retrieve commits since the reference
2. **Parse conventional commits**: Extract type prefixes (feat, fix, style, refactor, docs, build, chore) and scope
3. **Flag breaking changes**: Detect exclamation mark after scope (e.g. `feat!:`) or `BREAKING CHANGE:` footer
4. **Group by type**: Organize commits into sections: Features, Fixes, Breaking Changes, Documentation, Build/Chore
5. **Render markdown**: Format as structured changelog entry with version header and grouped bullet points
6. **Opus variant**: Include migration notes, deprecation guidance, and upgrade path recommendations

## Examples

### Input
```json
{
  "since_ref": "v0.3.0",
  "version": "0.4.0"
}
```

### Output (sonnet)
```markdown
## [0.4.0] - 2026-02-28

### Features
- skill-audit: initial experimental release
- explain-code: architectural depth variant
- task-decompose: dependency graph ordering

### Fixes
- changelog: handle missing conventional prefixes

### Documentation
- CLAUDE.md: update Phase 2 skill format
```

### Output (opus variant with breaking changes)
```markdown
## [1.0.0] - 2026-02-28

### Breaking Changes
- **manifest.md**: Now requires `dependencies.skills` array with semver constraints
  - **Migration**: Update all skill references to include version pinning (e.g. `"^1.0"`)
  - **Timeline**: Must be completed before next minor version release

### Features
- changelog: workflow-blueprint skill for structured commit history
- release-checklist: automated validation and tagging workflow

### Fixes
- explain-code: correct depth-to-model tier mapping

### Documentation
- README.md: add skill registry table
```
