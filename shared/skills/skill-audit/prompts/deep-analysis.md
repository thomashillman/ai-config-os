# Deep Skill Audit with Remediation

Comprehensive skill analysis with prioritized fixes, lifecycle planning, and improvement strategies.

## Analysis Dimensions
1. **Schema Compliance**: Phase 2 frontmatter requirements
2. **Variant Coverage**: model variants available and fallback chain
3. **Test Coverage**: test adequacy, model coverage, scenario diversity
4. **Dependency Health**: skill dependencies exist and are versioned, APIs documented
5. **Documentation**: readme auto-generation enabled, help text present
6. **Performance**: monitoring enabled, baselines defined
7. **Lifecycle**: status alignment with maturity, deprecation plans

## Output Format
```
## Audit Report: [Skill Name]

### Health Scores
- Schema Compliance: [0-100]
- Variant Coverage: [0-100]
- Test Coverage: [0-100]
- Overall Health: [0-100]

### Critical Issues (Must Fix)
1. [Issue]: Impact and fix

### Recommended Improvements (Priority Order)
1. [Improvement]: effort estimate, benefit
2. [Improvement]: effort estimate, benefit

### Lifecycle Recommendation
- Current Status: [experimental/stable/deprecated]
- Recommended Next Step: [promotion/deprecation/maintenance]
- Timeline: [when to reassess]

### Remediation Checklist
- [ ] [Action 1]
- [ ] [Action 2]
```
