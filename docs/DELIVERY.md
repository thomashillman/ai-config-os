# Delivery Contract (v0.5.3+)

The **delivery contract** guarantees that all distributed artifacts (`dist/`) are complete, consistent, and valid.

## Protected by 28 automated tests (`scripts/build/test/delivery-contract.test.mjs`)

- All emitted files exist and are non-empty
- Distributed SKILL.md files have required frontmatter (skill, description, type, status, version)
- Plugin.json files for each platform are valid JSON with correct structure
- Registry index.json is complete with all metadata (version, skill_count, platform_count)
- All file paths referenced in plugin.json and registry exist on disk
- Version is consistent across all platforms and artefacts
- Cross-file references are valid (no dangling links)
- Prompt files referenced in skill variants are present

## Enforcement

- Tests run on every `npm test` invocation
- Tests run automatically on all PRs via `.github/workflows/build.yml`
- Build fails if delivery contract is violated (blocks merging to main)

## What this prevents

- Incomplete distributions (missing skills, prompts, or metadata)
- Mismatched versions across platforms
- Broken file references
- Malformed JSON/YAML in distribution

## When you see a delivery contract failure

1. Check the error message for which test failed
2. Run `npm test -- scripts/build/test/delivery-contract.test.mjs` locally
3. Fix the underlying issue (missing file, malformed JSON, inconsistent version, etc.)
4. Re-run tests to verify
