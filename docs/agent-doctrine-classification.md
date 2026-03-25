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
