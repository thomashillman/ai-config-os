# Standard Skill Audit Report

Assess skill completeness against Phase 2 schema: frontmatter, variants, tests, and dependencies.

## Audit Checklist
- [ ] Frontmatter: skill, description, type, status all present
- [ ] Inputs & Outputs: documented with types and descriptions
- [ ] Dependencies: skills array, apis array, models array defined
- [ ] Variants: all declared models have corresponding variant definitions
- [ ] Tests: at least 2 test cases with models_to_test
- [ ] Version: semantic version present
- [ ] Changelog: changelog object with entries
- [ ] Tags: skill categorization tags

## Output Format
```
Skill: [name]
Status: [Complete/Incomplete]
Health Score: [0-100]

Gaps:
- [Missing field 1]
- [Missing field 2]

Recommendations:
1. [Priority 1 fix]
2. [Priority 2 fix]
```
