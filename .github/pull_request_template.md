## Summary

Brief description of what this PR does.

## Type

- [ ] Feature (new skill, new capability)
- [ ] Fix (bug fix, regression fix)
- [ ] Refactor (code cleanup, restructuring)
- [ ] Docs (documentation only)
- [ ] Test (test suite improvements)
- [ ] Build (build system, CI/CD)

## Pre-Push Checklist (Before Merging)

### Portability Contract
- [ ] All skills authored in `shared/skills/` (never in plugins/)
- [ ] Emitted packages in `dist/clients/<platform>/` are self-sufficient (no source refs)
- [ ] All referenced resources (prompts/, etc.) are copied to dist/
- [ ] No timestamps or build metadata in distributed SKILL.md files
- [ ] Materialiser tests pass (packages extract without source access)

### Delivery Contract
- [ ] All tests pass locally: `npm test`
- [ ] All tests pass in CI on Linux, macOS, Windows
- [ ] Verification suite passes: `npm run verify`
- [ ] New test suites added for contract-breaking changes

### Code Quality
- [ ] Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, etc.)
- [ ] No unnecessary file changes (only what's needed for the feature)
- [ ] Shell scripts are POSIX-compliant (test on bash, sh, and zsh)
- [ ] New code is Windows-compatible (use `path.join()`, not path concatenation)

### Documentation
- [ ] CLAUDE.md updated if dev conventions changed
- [ ] README.md updated if user-facing capability changed
- [ ] PLAN.md updated if phase completion status changed
- [ ] shared/manifest.md updated if skill created/renamed/removed
- [ ] scripts/build/test/README.md updated if new test contracts added

### Security
- [ ] No hardcoded credentials or API keys
- [ ] No shell injection vectors (use `execFileSync` not `execSync` with user input)
- [ ] No path traversal vulnerabilities (use `resolve()` + boundary check)
- [ ] Materialiser security tests pass (path validation, boundary checks)

## Specific Changes

Describe what you changed and why:

- **Files modified:**
- **Tests added/modified:**
- **Contracts affected:**

## Questions for Reviewers

- Does this change require a version bump? (if yes, update `VERSION` file)
- Does this change affect the portability contract? (if yes, verify materialisation still works)
- Does this change affect distribution? (if yes, verify CI gates pass)

---

**CI Status:** This PR will run tests on Linux, macOS, and Windows before merge. All platforms must pass before merging.
