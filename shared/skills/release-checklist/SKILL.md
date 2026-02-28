---
# Identity
skill: release-checklist
description: Validate release readiness by checking plugin.json version, running tests, generating changelog, and staging a release commit with tag.
type: workflow-blueprint
status: stable

# Feature 1: Dependencies & Metadata
inputs:
  - name: version
    type: string
    description: Semver version string for release (e.g., "1.0.0", "2.1.3")
    required: true
  - name: release_notes
    type: string
    description: Optional release notes to include in commit message and tag
    required: false

outputs:
  - name: checklist_result
    type: object
    description: Object with steps_completed (array), steps_failed (array), ready_to_release (boolean), summary

dependencies:
  skills:
    - name: git-ops
      version: "^1.0"
      optional: false
    - name: commit-conventions
      version: "^1.0"
      optional: false
    - name: changelog
      version: "^1.0"
      optional: false
  apis: []
  models:
    - sonnet
    - opus

examples:
  - input:
      version: "1.0.0"
      release_notes: "Stable release with Phase 2 skill metadata support"
    output:
      steps_completed:
        - "Validated plugin.json version matches target 1.0.0"
        - "Ran adapters/claude/dev-test.sh successfully"
        - "Generated changelog entries (5 features, 2 fixes, 1 breaking change)"
        - "Staged release commit: 'chore(release): 1.0.0'"
        - "Created annotated tag v1.0.0 with release notes"
      steps_failed: []
      ready_to_release: true
      summary: "All checks passed. Branch is clean and ready to push and merge to main."
      next_action: "Run: git push -u origin claude/release-1.0.0 && git push origin v1.0.0"
    expected_model: sonnet

# Feature 2: Multi-Model Variants
variants:
  sonnet:
    description: Standard release checklist with step-by-step validation
    cost_factor: 1.0
    latency_baseline_ms: 1500
  opus:
    description: Verbose checklist with risk assessment and rollback guidance
    cost_factor: 3.0
    latency_baseline_ms: 2000
  fallback_chain:
    - sonnet
    - opus

# Feature 3: Skill Testing
tests:
  - id: test-clean-state
    type: integration
    input:
      version: "1.1.0"
    expected_substring: "ready_to_release"
    models_to_test:
      - sonnet
  - id: test-dirty-state
    type: integration
    input:
      version: "1.1.0"
    expected_substring: "failed"
    models_to_test:
      - opus

# Feature 4: Skill Composition
composition:
  personas: []

# Feature 5: Auto-Generated Documentation
docs:
  auto_generate_readme: true
  sections_to_include:
    - description
    - inputs
    - outputs

# Feature 6: Performance Monitoring
monitoring:
  enabled: true
  track_metrics:
    - latency
    - token_count
    - cost
    - variant_selected

version: "1.0.0"
changelog:
  "1.0.0": "Initial release"
---

## When to use

Use this skill to:
- Automate release validation and safeguard against common errors
- Generate consistent release commits and tags
- Ensure version numbers are synchronized across manifest files
- Document breaking changes and migration steps
- Prepare a branch ready for merging to main

## Instructions

1. **Validate plugin.json version**:
   - Read `plugins/core-skills/.claude-plugin/plugin.json`
   - Extract current version
   - Confirm it matches or can be incremented to target `version` input
   - Use git-ops skill to fetch canonical version from origin/main if in doubt

2. **Run test suite**:
   - Execute `adapters/claude/dev-test.sh`
   - Capture exit code and output
   - If any test fails, flag and stop (don't continue to commit)

3. **Invoke changelog skill**:
   - Determine `since_ref` (last tag, e.g., "v0.9.0")
   - Call changelog with (since_ref, version)
   - Receive changelog entry (markdown)

4. **Stage release commit**:
   - Write changelog entry to `CHANGELOG.md` (create if doesn't exist)
   - Update `plugin.json` version to target version
   - Stage both files: `git add CHANGELOG.md plugins/core-skills/.claude-plugin/plugin.json`
   - Commit with conventional message: `chore(release): <version>` + optional release notes in body

5. **Create annotated tag**:
   - Format: `v<version>` (e.g., `v1.0.0`)
   - Tag message: include release notes + link to changelog
   - Example: `git tag -a v1.0.0 -m "Release v1.0.0: Phase 2 support"`

6. **Output readiness**:
   - List all steps completed
   - Flag any failures
   - If all pass: output next action (git push + push tags)
   - If any fail: list remediation steps

7. **Opus variant only**: Add risk assessment (what could go wrong on merge), rollback steps

## Examples

### Input
```json
{
  "version": "1.0.0",
  "release_notes": "Stable GA release with complete Phase 2 skill metadata and audit tooling"
}
```

### Output (Sonnet)
```json
{
  "steps_completed": [
    "Validated plugin.json: current version 0.9.0 → target 1.0.0 (patch bump allowed)",
    "Ran adapters/claude/dev-test.sh: PASSED (15/15 tests)",
    "Generated changelog: 7 features, 3 fixes, 1 breaking change (symlink paths)",
    "Updated CHANGELOG.md with new 1.0.0 entry",
    "Updated plugins/core-skills/.claude-plugin/plugin.json to version 1.0.0",
    "Staged release commit: chore(release): 1.0.0",
    "Created annotated tag v1.0.0"
  ],
  "steps_failed": [],
  "ready_to_release": true,
  "summary": "All release checks passed. Repository is clean and ready to push.",
  "next_action": "git push -u origin claude/release-1.0.0 && git push origin v1.0.0",
  "manual_steps": [
    "Merge the claude/release-1.0.0 branch to main via GitHub UI",
    "GitHub Actions will auto-publish tagged release to marketplace"
  ]
}
```

### Output (Opus with risk assessment)
```json
{
  "steps_completed": [
    "Validated plugin.json: current version 0.9.0 → target 1.0.0",
    "Ran adapters/claude/dev-test.sh: PASSED (15/15 tests)",
    "Generated changelog: 7 features, 3 fixes, 1 breaking change",
    "Updated CHANGELOG.md and plugin.json",
    "Staged release commit and created tag v1.0.0"
  ],
  "steps_failed": [],
  "ready_to_release": true,
  "summary": "All release checks passed.",
  "risk_assessment": {
    "blockers": [],
    "warnings": [
      {
        "severity": "warning",
        "issue": "Breaking change in symlink paths affects downstream users",
        "mitigation": "Changelog includes migration guide; users must update symlinks before upgrading"
      }
    ],
    "rollback_procedure": [
      "If issues arise after merge to main, revert commit: git revert <commit-sha>",
      "Delete tag: git tag -d v1.0.0 && git push origin :refs/tags/v1.0.0",
      "Re-tag with 'yanked' or 'broken' suffix if needed for records"
    ]
  },
  "next_action": "git push -u origin claude/release-1.0.0 && git push origin v1.0.0",
  "post_merge_verification": [
    "Confirm GitHub Actions ran successfully",
    "Verify marketplace reflects new version within 5 minutes",
    "Test plugin installation in clean environment"
  ]
}
```
