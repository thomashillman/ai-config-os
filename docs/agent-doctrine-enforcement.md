# Agent Doctrine Enforcement Notes

Purpose: distinguish current guidance language from behavior that is actually enforced by code, tests, or hooks.

## Enforced today (by automation)

- Support/status claims that are backed by executable checks in runtime/build scripts (for example registry-driven sync/status and compiler compatibility resolution) are partially enforced when those scripts/tests run in CI or local validation flows.
- Schema and contract expectations covered by existing test suites are enforced when `npm test`/CI executes those suites.
- Pre-PR mergeability checks are enforced when contributors run `ops/pre-pr-mergeability-gate.sh` and when equivalent CI workflows run.

## Guidance only today (not universally enforced)

- Narrative documentation claims about what a host agent runtime "always" does (for example auto-loading, immediate availability, or guaranteed hook execution) when the behavior depends on external runtime configuration.
- Documentation precedence statements such as "this doc wins" unless matched by explicit validation logic that checks and rejects drift.
- Doctrine phrasing that implies deterministic execution for user workflows without a corresponding script/hook/test gate.

## Recommended future enforcement work

1. Add a docs lint rule that flags high-certainty terms (`always`, `guaranteed`, `deterministic`, `never`) unless explicitly allowlisted with an evidence reference.
2. Add a support-truth drift check that validates key `docs/SUPPORTED_TODAY.md` claims against machine-readable sources (registry files, emitters, adapters).
3. Add an optional hook/test to verify that generated docs do not introduce unenforced deterministic wording.
4. Add CI reporting that distinguishes "validated by automation" vs "guidance" claims for doctrine docs.

## Wording standard for now

Use wording such as:

- "expected", "typically", "intended", "when configured" for behavior depending on external runtime conditions.
- "enforced by <script/test/hook>" only when a concrete automation path exists.
