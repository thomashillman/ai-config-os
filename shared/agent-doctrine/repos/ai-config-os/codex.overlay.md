# ai-config-os Codex Overlay

Use this overlay with the base doctrine fragments when operating as a Codex-oriented agent in this repository.

## Repository-specific structure

- Primary authoring surface for skills is `shared/skills/`.
- Build and emit logic lives in `scripts/build/`.
- Claude adapter materialization logic lives in `adapters/claude/`; Codex adapter logic lives in `adapters/codex/`.
- Canonical release version is stored in `VERSION` and synced into derived files via scripts.

## Repository-specific verification commands

Run applicable checks before completion:

```bash
node scripts/build/compile.mjs
npm test
ops/validate-all.sh
```

If Claude packaging surfaces are touched, additionally run:

```bash
adapters/claude/dev-test.sh
claude plugin validate .
```

## Repository-specific git and merge safety

- Inspect branch, remote, and upstream state before synchronization actions:
  - `git status --short --branch`
  - `git remote`
  - `git branch -vv`
- Run the mandatory local gate as the final pre-PR step:

```bash
bash ops/pre-pr-mergeability-gate.sh
```

- For version updates, edit `VERSION` and then run:

```bash
npm run version:sync
npm run version:check
```
