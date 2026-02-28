---
# Identity
skill: skill-audit
description: Audit skill definitions for completeness, variant coverage, test presence, and dependency resolution.
type: agent
status: experimental

# Feature 1: Dependencies & Metadata
inputs:
  - name: scope
    type: string
    description: Audit scope (all, or specific skill name); default all
    required: false

outputs:
  - name: audit_report
    type: object
    description: Per-skill health scores, gaps list, ranked recommendations

dependencies:
  skills: []

# Feature 2: Multi-Model Variants
variants:
  opus:
    prompt_file: prompts/deep-analysis.md
    description: Deep audit with prioritised recommendations and remediation steps
    cost_factor: 3.0
    latency_baseline_ms: 1200
  sonnet:
    prompt_file: prompts/standard.md
    description: Standard gap report (default)
    cost_factor: 1.0
    latency_baseline_ms: 500
  fallback_chain:
    - sonnet
    - opus

# Feature 3: Skill Testing
tests:
  - id: test-full-audit
    type: integration
    input: '{"scope": "all"}'
    expected_substring: "health_scores"
    models_to_test:
      - sonnet
  - id: test-single-skill
    type: integration
    input: '{"scope": "explain-code"}'
    expected_substring: "gaps"
    models_to_test:
      - sonnet

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
    - instructions

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
  "1.0.0": "Initial experimental release with manifest validation and gap detection"
---

## When to use

Use `skill-audit` when:
- Reviewing skill health across the registry
- Validating Phase 2 frontmatter compliance
- Planning skill lifecycle (deprecation, graduation from experimental)
- Ensuring test coverage meets baseline
- Detecting orphaned or stale dependencies

## Instructions

1. **Read shared/manifest.md**: Load skill registry and metadata
2. **For each skill (or scope)**:
   - Check required frontmatter fields (skill, description, type, status, inputs, outputs, variants, tests, version, changelog)
   - Validate all 3 model variants specified (or fallback chain)
   - Verify ≥2 tests present with valid types and models_to_test
   - Check status is non-stale (experimental→stable transition planned, or stable actively maintained)
   - Resolve dependencies: all referenced skills must exist and have resolvable versions

3. **Score per skill**:
   - Frontmatter completeness: 0–100
   - Test coverage: count of tests vs expected (baseline ≥2)
   - Variant availability: how many of 3 tiers present
   - Status health: experimental (lower score), stable (higher)

4. **Produce ranked gaps list**:
   - Critical (blocks release): missing required fields, zero tests, broken deps
   - High (should fix soon): incomplete variants, vague descriptions, stale status
   - Medium (nice to have): minimal test coverage, missing examples, no monitoring config

5. **Opus variant**: Include remediation steps, priority matrix, and estimated effort per gap

## Examples

### Input
```json
{
  "scope": "all"
}
```

### Output (sonnet)
```json
{
  "audit_timestamp": "2026-02-28T10:30:00Z",
  "scope": "all",
  "summary": {
    "skills_audited": 5,
    "average_health_score": 87,
    "critical_gaps": 0,
    "high_gaps": 2,
    "medium_gaps": 5
  },
  "skills": [
    {
      "name": "changelog",
      "health_score": 95,
      "frontmatter_score": 100,
      "test_coverage": 2,
      "variant_count": 3,
      "status": "stable",
      "gaps": [
        {
          "type": "medium",
          "message": "No examples in body; suggest adding 2 output examples"
        }
      ]
    },
    {
      "name": "task-decompose",
      "health_score": 92,
      "frontmatter_score": 100,
      "test_coverage": 2,
      "variant_count": 3,
      "status": "stable",
      "gaps": [
        {
          "type": "medium",
          "message": "monitoring.enabled is true but no example metrics shown"
        }
      ]
    },
    {
      "name": "explain-code",
      "health_score": 90,
      "frontmatter_score": 100,
      "test_coverage": 3,
      "variant_count": 3,
      "status": "stable",
      "gaps": []
    },
    {
      "name": "skill-audit",
      "health_score": 82,
      "frontmatter_score": 95,
      "test_coverage": 2,
      "variant_count": 2,
      "status": "experimental",
      "gaps": [
        {
          "type": "high",
          "message": "Status is experimental; define graduation criteria and timeline"
        },
        {
          "type": "medium",
          "message": "Only 2 variants (sonnet, opus); add haiku for quick audits"
        }
      ]
    },
    {
      "name": "release-checklist",
      "health_score": 88,
      "frontmatter_score": 100,
      "test_coverage": 2,
      "variant_count": 2,
      "status": "stable",
      "gaps": [
        {
          "type": "high",
          "message": "Depends on 3 skills (git-ops, commit-conventions, changelog) but commit-conventions may not exist"
        },
        {
          "type": "medium",
          "message": "No haiku variant; testing always uses sonnet"
        }
      ]
    }
  ],
  "recommendations": [
    "Priority 1: Resolve release-checklist dependency on commit-conventions; create or update docs",
    "Priority 2: Skill-audit status experimental; define graduation checklist",
    "Priority 3: Add haiku variants to skill-audit and release-checklist for cost optimization"
  ]
}
```

### Output (opus with deep analysis)
```json
{
  "audit_timestamp": "2026-02-28T10:30:00Z",
  "scope": "all",
  "summary": {
    "skills_audited": 5,
    "average_health_score": 87,
    "critical_gaps": 0,
    "high_gaps": 2,
    "medium_gaps": 5,
    "estimated_remediation_hours": 8
  },
  "detailed_analysis": {
    "skill-audit": {
      "health_score": 82,
      "status_progression": "experimental → stable target: v1.1.0",
      "graduation_blockers": [
        {
          "blocker": "No production usage recorded",
          "severity": "high",
          "remedy": "Deploy as optional skill for 1 release cycle, track adoption"
        },
        {
          "blocker": "Only 2 model variants",
          "severity": "medium",
          "remedy": "Add haiku for quick-scan audits; estimated 2 hours"
        }
      ]
    },
    "release-checklist": {
      "health_score": 88,
      "dependency_health": "at-risk",
      "at_risk_deps": [
        {
          "skill": "commit-conventions",
          "status": "does_not_exist",
          "action": "Create skill or remove from dependencies",
          "priority": "critical"
        },
        {
          "skill": "git-ops",
          "status": "exists",
          "version_constraint": "unspecified",
          "action": "Add version constraint (e.g., ^1.0)",
          "priority": "high"
        }
      ]
    }
  },
  "remediation_plan": [
    {
      "rank": 1,
      "issue": "release-checklist depends on non-existent commit-conventions",
      "effort_hours": 2,
      "action": "Create shared/skills/commit-conventions/SKILL.md or remove from release-checklist dependencies"
    },
    {
      "rank": 2,
      "issue": "skill-audit needs graduation criteria to leave experimental",
      "effort_hours": 1,
      "action": "Document graduation checklist in skill body; set target version"
    },
    {
      "rank": 3,
      "issue": "skill-audit and release-checklist missing haiku variants",
      "effort_hours": 4,
      "action": "Add prompts/quick.md variant; update variant fallback chains"
    },
    {
      "rank": 4,
      "issue": "No example monitoring outputs in task-decompose and explain-code",
      "effort_hours": 1,
      "action": "Add sample metrics dict to Examples section"
    }
  ]
}
```
