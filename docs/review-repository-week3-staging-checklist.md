# Review Repository MVA — Week 3 Staging and Release Checklist (T020)

## Purpose

Provide a minimal, deterministic release gate for the Week 3 control-plane work (T015-T020) so staging can prove the weak-start to strong-resume journey without user restatement.

## Gate A — Functional behavior

1. Start task in weak route (`github_pr` or `pasted_diff`) using `startReviewRepositoryTask`.
2. Persist task and verify state transitions to `active`.
3. Resume task in strong route (`local_repo`) using `resumeReviewRepositoryTask`.
4. Verify route history includes both weak and strong route entries.
5. Verify findings provenance transitions (`verified` -> `reused`) when route upgrades to equal equivalence.

## Gate B — API and operability

1. Worker task endpoints return expected contracts:
   - `POST /v1/tasks`
   - `GET /v1/tasks/:taskId`
   - `POST /v1/tasks/:taskId/route-selection`
   - `POST /v1/tasks/:taskId/continuation`
   - `GET /v1/tasks/:taskId/progress-events`
   - `GET /v1/tasks/:taskId/readiness`
2. Readiness payload includes:
   - current route
   - route history
   - summarized findings provenance
   - progress event count

## Gate C — Security and adversarial coverage

1. Route input guards reject control characters in path-like fields.
2. Oversized text route inputs are rejected deterministically.
3. Continuation token replay mismatches are rejected.
4. Task version conflicts return deterministic conflict errors.

## Gate D — Verification tranches

Run two separate verification tranches:

- **Tranche 1 (targeted):**
  - task lifecycle/control-plane unit tests
  - worker contract tests
  - journey and adversarial tests
- **Tranche 2 (full):**
  - full project test suite (`npm test`)
  - mergeability gate (`bash ops/pre-pr-mergeability-gate.sh`)

## Rollback plan

If regressions appear in staging:

1. Disable strict task rollout by falling back to existing task endpoints without readiness consumer dependencies.
2. Keep handoff-token enforcement unchanged (do not weaken replay guarantees).
3. Revert only journey/readiness layer changes while preserving schema/task store compatibility.

## Exit criteria

Week 3 is staging-ready when all gates above are green and readiness data is visible from API responses without manual reconstruction.
