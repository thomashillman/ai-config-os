---
# Identity
skill: skill-audit
description: Audit all skills (or a specific skill) against Phase 2 standards. Checks frontmatter completeness, variant coverage, test count, dependency resolution, and status staleness.
type: agent
status: experimental

# Feature 1: Dependencies & Metadata
inputs:
  - name: scope
    type: string
    description: Audit scope—'all' (default) for all skills, or specific skill name (e.g., 'changelog')
    required: false

outputs:
  - name: audit_report
    type: object
    description: Per-skill health scores (0–100), gaps list with severity, and actionable recommendations

dependencies:
  skills: []
  apis: []
  models:
    - opus
    - sonnet

examples:
  - input:
      scope: "all"
    output:
      summary:
        total_skills: 12
        passing: 8
        warnings: 3
        failing: 1
      skills:
        - name: changelog
          health_score: 95
          gaps: []
          status: stable
        - name: task-decompose
          health_score: 85
          gaps:
            - severity: warning
              issue: "Only 2 tests defined, recommended ≥2 for prompt type"
          status: stable
        - name: broken-skill
          health_score: 40
          gaps:
            - severity: critical
              issue: "Missing outputs in frontmatter"
            - severity: critical
              issue: "Zero tests defined"
            - severity: warning
              issue: "Status is 'deprecated' but still listed in manifest"
          status: deprecated
      recommendations:
        - rank: 1
          severity: critical
          action: "Fix broken-skill outputs and add ≥2 tests"
        - rank: 2
          severity: warning
          action: "Add 1–2 more tests to task-decompose for edge cases"
        - rank: 3
          severity: info
          action: "Review deprecated skills and remove from manifest"
    expected_model: opus

# Feature 2: Multi-Model Variants
variants:
  sonnet:
    description: Standard gap report with scoring and ranked recommendations
    cost_factor: 1.0
    latency_baseline_ms: 600
  opus:
    description: Deep audit with prioritized recommendations and risk assessment
    cost_factor: 3.0
    latency_baseline_ms: 1200
  fallback_chain:
    - sonnet
    - opus

# Feature 3: Skill Testing
tests:
  - id: test-full-audit
    type: integration
    input:
      scope: "all"
    expected_substring: "health_score"
    models_to_test:
      - sonnet
  - id: test-single-skill
    type: integration
    input:
      scope: "changelog"
    expected_substring: "gaps"
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
- Validate skill conformance to Phase 2 standards before release
- Identify incomplete or stale skill definitions
- Plan remediation of skill gaps
- Track skill health over time
- Enforce consistency across the skill registry

## Instructions

1. **Read shared/manifest.md**:
   - Extract all skill names and versions
   - Filter by scope (all vs. specific skill)

2. **For each skill, check**:
   - YAML frontmatter completeness (all 6 features present)
   - Inputs and outputs defined
   - At least 2 tests (3+ for agent/workflow types)
   - All variants listed (fallback_chain required)
   - Non-stale status (deprecated only if explicitly marked for removal)
   - Dependencies resolvable (skill exists, version constraint satisfied)

3. **Score each skill** (0–100):
   - 100: All checks pass
   - 80–99: Minor gaps (e.g., 1 missing variant, 1 weak test)
   - 60–79: Moderate gaps (e.g., incomplete inputs, 2+ weak tests)
   - <60: Critical gaps (missing outputs, 0 tests, broken dependencies)

4. **Compile gaps list**:
   - Severity: critical, warning, info
   - Issue description
   - Remediation hint

5. **Generate recommendations**:
   - Rank by severity
   - Group related fixes (e.g., "Fix all test counts in batch")
   - Estimate effort per recommendation

6. **Opus variant only**: Add risk assessment—which gaps block production deployment

## Examples

### Input
```json
{
  "scope": "all"
}
```

### Output (Sonnet)
```json
{
  "summary": {
    "total_skills": 5,
    "passing": 3,
    "warnings": 2,
    "failing": 0,
    "overall_health": 92
  },
  "skills": [
    {
      "name": "changelog",
      "health_score": 100,
      "status": "stable",
      "gaps": [],
      "last_updated": "2026-02-28"
    },
    {
      "name": "task-decompose",
      "health_score": 85,
      "status": "stable",
      "gaps": [
        {
          "severity": "warning",
          "issue": "Only 2 tests; recommended ≥2 for prompt type"
        }
      ],
      "last_updated": "2026-02-28"
    },
    {
      "name": "explain-code",
      "health_score": 95,
      "status": "stable",
      "gaps": [
        {
          "severity": "info",
          "issue": "Example output could include architectural variant"
        }
      ],
      "last_updated": "2026-02-28"
    },
    {
      "name": "skill-audit",
      "health_score": 80,
      "status": "experimental",
      "gaps": [
        {
          "severity": "warning",
          "issue": "Status is 'experimental'; consider promoting to 'stable' after release"
        }
      ],
      "last_updated": "2026-02-28"
    },
    {
      "name": "release-checklist",
      "health_score": 100,
      "status": "stable",
      "gaps": [],
      "last_updated": "2026-02-28"
    }
  ],
  "recommendations": [
    {
      "rank": 1,
      "severity": "info",
      "action": "Promote skill-audit to stable after first successful audit run",
      "effort": "low"
    },
    {
      "rank": 2,
      "severity": "warning",
      "action": "Add edge-case tests to task-decompose (constrained vs. unconstrained tasks)",
      "effort": "medium"
    },
    {
      "rank": 3,
      "severity": "info",
      "action": "Update explain-code examples to include architectural variant output",
      "effort": "low"
    }
  ]
}
```

### Output (Opus with risk assessment)
```json
{
  "summary": {
    "total_skills": 5,
    "passing": 3,
    "warnings": 2,
    "failing": 0,
    "overall_health": 92,
    "production_ready": true
  },
  "skills": [
    {
      "name": "changelog",
      "health_score": 100,
      "status": "stable",
      "gaps": [],
      "risk_assessment": {
        "blocks_deployment": false,
        "critical_paths": ["release-checklist (depends on changelog)"]
      }
    }
  ],
  "recommendations": [
    {
      "rank": 1,
      "severity": "info",
      "action": "Promote skill-audit to stable post-release",
      "effort": "low",
      "impact": "Enables automated health tracking in CI"
    },
    {
      "rank": 2,
      "severity": "warning",
      "action": "Add edge-case tests to task-decompose",
      "effort": "medium",
      "impact": "Reduces user frustration with underspecified tasks"
    }
  ],
  "deployment_readiness": {
    "ready_to_release": true,
    "blockers": [],
    "recommended_before_merge": [
      "skill-audit promotion to stable"
    ]
  }
}
```
