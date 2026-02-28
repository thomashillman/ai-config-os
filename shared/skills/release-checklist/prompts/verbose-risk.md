# Verbose Release Checklist with Risk Assessment

Comprehensive release validation with detailed risk analysis, mitigation strategies, and decision guidance.

## Input Format
- `version`: Target semantic version
- `release_notes`: Optional supplementary notes

## Risk Categories
1. **Code Risk**: untested changes, missing tests, deprecated dependencies
2. **Breaking Changes**: API changes, database migrations, config format changes
3. **Deployment Risk**: network dependencies, external service integrations, rollback complexity
4. **Version Risk**: semver compliance, backwards compatibility, pre-release versions
5. **Documentation Risk**: missing migration guides, undocumented breaking changes

## Output Format
```
## Release Readiness Report

### Code Quality
- Test Coverage: [%]
- Untested Files: [list if any]
- Deprecated Dependencies: [list if any]

### Risk Assessment
[HIGH/MEDIUM/LOW]: [Risk description with impact and mitigation]

### Breaking Changes
[List all breaking changes with migration guide]

### Rollback Plan
[How to quickly rollback if issues arise post-release]

### Recommendation
[SAFE TO RELEASE / NEEDS REVIEW / BLOCK RELEASE]
```
