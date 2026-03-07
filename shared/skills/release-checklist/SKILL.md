---
skill: "release-checklist"
description: "Automated release workflow validation, changelog generation, tagging, and readiness assessment."
type: "workflow-blueprint"
status: "stable"
inputs:
  - name: "version"
    type: "string"
    description: "Target release version in semver format (e.g. \"1.0.0\")"
    required: true
  - name: "release_notes"
    type: "string"
    description: "Optional supplementary release notes (markdown)"
    required: false
outputs:
  - name: "checklist_result"
    type: "object"
    description: "Steps completed, failed steps, ready_to_release bool, and tag output"
dependencies:
  skills:
    - name: "git-ops"
      version: "^1.0"
      optional: false
    - name: "commit-conventions"
      version: "^1.0"
      optional: false
    - name: "changelog"
      version: "^1.0"
      optional: false
  apis: []
  models:
    - "sonnet"
    - "opus"
variants:
  sonnet:
    prompt_file: "prompts/standard.md"
    description: "Standard release checklist validation (default)"
    cost_factor: 1
    latency_baseline_ms: 600
  opus:
    prompt_file: "prompts/verbose-risk.md"
    description: "Verbose checklist with risk assessment and mitigation guidance"
    cost_factor: 3
    latency_baseline_ms: 1200
  fallback_chain:
    - "sonnet"
    - "opus"
tests:
  - id: "test-clean-state"
    type: "integration"
    input: "{\"version\": \"1.0.0\"}"
    expected_substring: "ready_to_release"
    models_to_test:
      - "sonnet"
  - id: "test-dirty-state"
    type: "integration"
    input: "{\"version\": \"1.0.1\"}"
    expected_substring: "steps_failed"
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
  1.0.0: "Initial release with automated validation and release readiness assessment"
tags:
  - "core"
  - "workflow"
  - "release"
capabilities:
  required:
    - "git.read"
    - "shell.exec"
  optional:
    - "git.write"
    - "fs.read"
    - "network.http"
  fallback_mode: "manual"
  fallback_notes: "Can produce a manual release sequence when repo mutation is unavailable."
platforms:
  claude-ios:
    mode: "excluded"
    notes: "Requires git and shell access"
---

## When to use

Use `release-checklist` when:
- Preparing a new version for release
- Validating that all pre-release steps are complete
- Automating tagging and push workflows
- Documenting release state and readiness criteria

## Instructions

1. **Validate plugin.json version**: Confirm `plugins/core-skills/.claude-plugin/plugin.json` version field matches target
2. **Run test suite**: Execute `adapters/claude/dev-test.sh`; fail fast if tests don't pass
3. **Invoke changelog**: Call `changelog` skill with `since_ref` = previous tag, `version` = target
4. **Draft release commit**: Create release commit with updated CHANGELOG.md and plugin.json
5. **Create tag**: Git tag with `v<version>` format, include changelog body as message
6. **Push branch and tag**: Push to origin, verify remote state
7. **Output readiness**: Summarize steps, highlight any failures, produce bool `ready_to_release`
8. **Opus variant**: Include risk assessment (what can break in production), rollback guidance, customer communication templates

## Examples

### Input
```json
{
  "version": "1.0.0",
  "release_notes": "Major release: Phase 2 skill frontmatter, 5 new skills"
}
```

### Output (sonnet)
```json
{
  "version": "1.0.0",
  "timestamp": "2026-02-28T11:00:00Z",
  "steps_completed": [
    {
      "step": 1,
      "name": "Validate plugin.json version",
      "status": "success",
      "detail": "Version 1.0.0 matches target"
    },
    {
      "step": 2,
      "name": "Run test suite (adapters/claude/dev-test.sh)",
      "status": "success",
      "detail": "All 12 tests passed; coverage 87%"
    },
    {
      "step": 3,
      "name": "Generate changelog",
      "status": "success",
      "detail": "Changelog generated from v0.3.0..HEAD; 8 features, 3 fixes, 2 breaking changes"
    },
    {
      "step": 4,
      "name": "Draft release commit",
      "status": "success",
      "detail": "Commit ready: docs(release): 1.0.0 changelog"
    },
    {
      "step": 5,
      "name": "Create git tag",
      "status": "success",
      "detail": "Tag v1.0.0 created with changelog as annotation"
    },
    {
      "step": 6,
      "name": "Push to origin",
      "status": "success",
      "detail": "Branch and tag pushed to origin"
    }
  ],
  "steps_failed": [],
  "ready_to_release": true,
  "tag_ref": "v1.0.0",
  "next_steps": [
    "Create GitHub release from tag v1.0.0",
    "Notify stakeholders of availability",
    "Update plugin marketplace entry"
  ]
}
```

### Output (opus with risk assessment)
```json
{
  "version": "1.0.0",
  "timestamp": "2026-02-28T11:00:00Z",
  "steps_completed": [
    {
      "step": 1,
      "name": "Validate plugin.json version",
      "status": "success"
    },
    {
      "step": 2,
      "name": "Run test suite",
      "status": "success",
      "coverage": "87%"
    },
    {
      "step": 3,
      "name": "Generate changelog",
      "status": "success"
    },
    {
      "step": 4,
      "name": "Draft release commit",
      "status": "success"
    },
    {
      "step": 5,
      "name": "Create git tag",
      "status": "success"
    },
    {
      "step": 6,
      "name": "Push to origin",
      "status": "success"
    }
  ],
  "ready_to_release": true,
  "risk_assessment": {
    "overall_risk": "medium",
    "risk_factors": [
      {
        "category": "Breaking Changes",
        "severity": "high",
        "detail": "2 BREAKING CHANGE items in changelog (manifest.md schema, skill interface)",
        "impact": "Users on v0.x must update all skill definitions before upgrading",
        "mitigation": "Provide migration guide; offer 2-week support window for questions"
      },
      {
        "category": "New Skills (Experimental)",
        "severity": "medium",
        "detail": "skill-audit is experimental; may change in 1.1.0",
        "impact": "Early adopters may need to update usage in 2–4 weeks",
        "mitigation": "Document in release notes; flag as experimental in marketplace"
      },
      {
        "category": "Dependency Blocker",
        "severity": "low",
        "detail": "release-checklist depends on commit-conventions (not yet released)",
        "impact": "release-checklist cannot be used until commit-conventions is published",
        "mitigation": "Create commit-conventions skill in parallel; publish simultaneously"
      }
    ]
  },
  "customer_communication": {
    "email_subject": "AI Config OS v1.0.0: Major release with Phase 2 skill frontmatter",
    "body_template": "Dear Users,\n\nWe're excited to announce AI Config OS v1.0.0 with major enhancements:\n\n**Breaking Changes (action required):**\n- Skill manifests now require `dependencies.skills` array with semver constraints\n- See MIGRATION.md for step-by-step upgrade guide\n\n**New Features:**\n- 5 new skills: changelog, task-decompose, explain-code, skill-audit, release-checklist\n- Phase 2 skill frontmatter with multi-model variants and performance monitoring\n\n**Timeline:**\n- Upgrade window: 2 weeks recommended\n- Support: Please open GitHub issues with migration questions\n"
  },
  "rollback_procedure": {
    "if_critical_bug": "git revert v1.0.0 && git push origin main && publish v1.0.1 hotfix within 2 hours",
    "communication": "Notify stakeholders immediately; post incident report within 24 hours"
  },
  "tag_ref": "v1.0.0",
  "next_steps": [
    "Publish to marketplace",
    "Post release announcement",
    "Monitor early adopter feedback for 48 hours"
  ]
}
```

### Input (with dirty repo state)
```json
{
  "version": "1.0.1"
}
```

### Output (failure case)
```json
{
  "version": "1.0.1",
  "timestamp": "2026-02-28T11:05:00Z",
  "steps_completed": [
    {
      "step": 1,
      "name": "Validate plugin.json version",
      "status": "failed",
      "detail": "Expected version 1.0.1 but found 1.0.0 in plugin.json. Run: jq '.version = \"1.0.1\"' plugins/core-skills/.claude-plugin/plugin.json > /tmp/plugin.json && mv /tmp/plugin.json plugins/core-skills/.claude-plugin/plugin.json"
    }
  ],
  "steps_failed": [
    {
      "step": 1,
      "name": "Validate plugin.json version",
      "error": "Version mismatch"
    }
  ],
  "ready_to_release": false,
  "blockers": [
    "Fix plugin.json version to match target 1.0.1",
    "Run full checklist again before releasing"
  ]
}
```
