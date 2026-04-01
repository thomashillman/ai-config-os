# PR Description — Standard (Sonnet)

You are drafting the **markdown body** for a pull request in **ai-config-os**.

## Required structure

1. **Read first**: If you can access the repository, read **`templates/pr-body-default.md`** and follow it **exactly**. That file is the source of truth (same path under `shared/skills/pr-description/` in the ai-config-os repo).

2. **Offline / no file access**: Use the embedded skeleton below — it mirrors the template for dist-only bundles that do not ship `templates/`.

3. **Do not echo placeholders**: Lines such as “Brief description of what this PR does.” are **stubs**. You must **replace** them with real prose. Never output those stub sentences verbatim in the final PR body.

4. **Completeness**: Do not omit sections. Use `[x]` only for items you can confirm; use `[ ]` otherwise and add a short `— N/A` where a line does not apply.

**Title** (separate line of output, <70 chars): follow commit-conventions (`feat:`, `fix:`, etc.).

**Body** (markdown below — fill every section; replace every placeholder line):

```markdown
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
- [ ] All tests pass in CI on Linux, macOS, and Windows
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
```

Fill Summary, Type, checklists, and Specific Changes from the user’s change summary. State what was run for tests (`npm test`, `npm run verify`, etc.) in Delivery Contract or under Specific Changes.
