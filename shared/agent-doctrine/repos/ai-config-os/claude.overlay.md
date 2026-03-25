# ai-config-os Claude Overlay

Use this overlay with the base doctrine fragments when operating as a Claude-oriented agent in this repository.

## Repository-specific structure

- Author skills in `shared/skills/`; do not edit generated outputs directly.
- Generated packages live in `dist/clients/<platform>/` and registry output lives in `dist/registry/index.json`.
- Platform capability definitions are in `shared/targets/platforms/`.
- Canonical version source is `VERSION`; derived version files must be synchronized through project scripts.

## Repository-specific verification commands

Run relevant checks for touched surfaces:

```bash
node scripts/build/compile.mjs
npm test
adapters/claude/dev-test.sh
ops/validate-all.sh
claude plugin validate .
```

## Repository-specific git and release safety

- Before major sync operations, inspect:
  - `git status --short --branch`
  - `git remote`
  - `git branch -vv`
- Use the local pre-PR gate before PR creation or update:

```bash
bash ops/pre-pr-mergeability-gate.sh
```

- Version bumps must modify `VERSION` first, then run:

```bash
npm run version:sync
npm run version:check
```

## Local proxy constraints

This repository may use a local proxy remote (`http://local_proxy@127.0.0.1:41590/git/...`).

- Expected to work: `git add`, `git commit`, `git push -u origin <branch>`.
- Expected not to work in this environment: `gh pr create`, direct push to protected `main`, proxy REST API calls.
- Do not repoint the remote unless explicitly instructed.
