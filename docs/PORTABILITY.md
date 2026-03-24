# Portability Contract (v0.6.0+)

The **portability contract** guarantees that skills authored in source are emitted as self-sufficient packages that do not require source-tree access.

## Definition

1. **Canonical source:** `shared/skills/` is the only source of truth. Compiler reads directly from it.
2. **Self-sufficient packages:** `dist/clients/<platform>/` contains complete skill copies (SKILL.md, prompts/, etc.). No relative references to source tree.
3. **Materialisation:** Emitted packages can be extracted and used on any system (CI, cache, offline) without access to source code.
4. **No symlink dependency:** Symlinks in `plugins/core-skills/skills/` are optional authoring convenience on Unix only. All builds work with `--no-link` flag.

## Protected by automated tests

- Canonical source contract: compiler reads only from `shared/skills/`
- Materialisation contract: emitted packages extract without source access
- Source-to-output flow: changes to source produce predictable, deterministic changes in emitted packages
- Determinism: identical source produces identical bytes in `dist/` (no timestamps in SKILL.md)

## When you see a portability contract failure

1. Check test suite: `npm test -- scripts/build/test/materialisation-contract.test.mjs`
2. Verify emitted package has all referenced resources (prompts/, etc.)
3. Ensure no source-tree paths are embedded in emitted files
4. Run `bash adapters/claude/materialise.sh` to test extraction locally
