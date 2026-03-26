# Agent Doctrine Classification

This note defines how doctrine content is split between **portable base fragments** and **repository-local overlays**.

## Portable base fragments

Location: `shared/agent-doctrine/base/`

These files are intentionally generic and reusable across repositories:

- `engineering-principles.md`
- `autonomy.md`
- `verification.md`
- `git-safety.md`
- `communication.md`
- `change-discipline.md`
- `00-project.md` (high-level project doctrine shell only)

### Why these are portable

These fragments describe stable behavior expectations that are useful in most projects:

- simplicity and readability over cleverness
- autonomous execution with explicit escalation when blocked
- evidence-based verification
- conservative Git safety defaults
- clear status and blocker communication
- disciplined, scope-controlled change management

They avoid repository names, local paths, branch names, and tool-specific commands so they can be reused without modification.

## Repository-local overlays

Location: `shared/agent-doctrine/repos/ai-config-os/`

- `claude.overlay.md`
- `codex.overlay.md`

### Why these are local

These overlays encode project-specific operational details that should not be generalized:

- ai-config-os directory layout and authoring boundaries
- concrete verification commands used by this repository
- local release/version synchronization workflow
- local proxy and PR-environment constraints
- mandatory mergeability gate invocation

This split keeps the base doctrine reusable while preserving explicit operational correctness for ai-config-os.

## Explicit examples of what moved

The following content was moved out of `shared/agent-doctrine/base/00-project.md` because it is repository-local:

1. **Repository layout specifics**
   - Moved examples: `shared/skills/`, `dist/clients/<platform>/`, `dist/registry/index.json`, `shared/targets/platforms/`.
   - Why moved: path topology is unique to ai-config-os and not portable.

2. **Project command recipes**
   - Moved examples: `node scripts/build/new-skill.mjs`, `node scripts/build/compile.mjs`, `ops/validate-all.sh`, `claude plugin validate .`.
   - Why moved: concrete commands depend on this repository's scripts and installed tooling.

3. **Release and version-sync mechanics**
   - Moved examples: `VERSION` as canonical source plus `npm run version:sync` and `npm run version:check`.
   - Why moved: version derivation rules are implementation-specific and differ across repos.

4. **Local proxy workflow constraints**
   - Moved examples: `http://local_proxy@127.0.0.1:41590/git/...`, unsupported `gh pr create`, protected-branch push caveats.
   - Why moved: these are environment-specific networking and hosting constraints.

5. **Living docs ownership matrix**
   - Moved examples: ownership mapping for `README.md`, `PLAN.md`, `CLAUDE.md`, `shared/manifest.md`, and docs under `docs/`.
   - Why moved: doc ownership and update protocol are repository governance policies, not base doctrine.

Rule of thumb: if guidance requires naming ai-config-os files, scripts, paths, remotes, or local infrastructure, it belongs in overlays, not in base doctrine.
