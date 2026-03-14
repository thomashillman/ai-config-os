# AI Config OS — Implementation Plan

## Overview

The **control plane for portable AI work**. The task object is the unit of value — not chat, not prompts, not agents. Work starts in any environment (web, mobile, IDE), and the runtime routes it, checkpoints it, and continues it in a stronger environment without the user re-explaining anything.

The existing substrate (Worker endpoints, emitted runtime artefacts, capability profiling, remote executor, dashboard contract panel) is preserved and extended. The new layer adds six core primitives: PortableTaskObject, capability detection integration, deterministic route resolution, EffectiveExecutionContract, structured continuation, and findings provenance.

The first automated workflow is `review_repository`: start in a limited environment, continue in a stronger one, preserve findings with provenance, finish without reconstructing context.

**The product test:** after switching environments, does the runtime feel ready?

Autospec artefacts live at [github.com/thomashillman/autospec](https://github.com/thomashillman/autospec).

Core principle: **own the task lifecycle — routing, continuation, verification, provenance, and cross-environment upgrades**.

---

## Current state — v0.5.4+, updated 2026-03-14

### Completed infrastructure

| Area | Version | Notes |
|---|---|---|
| Repo scaffold, .gitignore, marketplace.json | v0.1.0 | Phase 1 |
| core-skills plugin.json | v0.5.4 | 22 skills, all symlinked |
| shared/manifest.md (skill index) | — | 22 skills, 2 workflows listed |
| shared/principles.md | — | Opinionated AI behaviour defaults |
| adapters/claude/dev-test.sh | — | Non-interactive validation |
| CLAUDE.md (dev context) | — | Extended with self-improvement, portability contract, delivery contract, CI pitfalls |
| README.md | — | Full getting-started, architecture, troubleshooting |
| .github/workflows/ | — | `validate.yml` (structure), `build.yml` (compile + test + dist artifact) |
| .claude/hooks/ | — | session-start, pre-tool-use, post-tool-use, post-tool-use-metrics |

### Skills (22 total, all with multi-model variants)

| Skill | Type | Phase |
|---|---|---|
| session-start-hook, web-search, commit-conventions, git-ops, principles, plugin-setup | prompt/hook | Phase 1 |
| code-review, context-budget, pr-description | prompt | Phase 2 |
| debug, changelog, task-decompose, explain-code, skill-audit, release-checklist | prompt/agent/workflow-blueprint | Phase 6 |
| memory, test-writer, security-review, refactor, review-pr, issue-triage, simplify | prompt/agent | Phase 7 |

All 22 skills have: YAML frontmatter, opus/sonnet/haiku variants, structured capability contracts, tests defined in frontmatter.

### Workflows (5 total)

| Workflow | Skills | Path |
|---|---|---|
| daily-brief | git-ops, changelog, memory, task-decompose | shared/workflows/daily-brief.json |
| pre-commit | security-review, code-review, commit-conventions | shared/workflows/pre-commit.json |
| code-quality | code-review, debug, explain-code | shared/workflows/code-quality/workflow.json |
| release-agent | git-ops, commit-conventions, changelog, release-checklist | shared/workflows/release-agent/workflow.json |
| research-mode | — | shared/workflows/research-mode/workflow.json |

### Build & distribution pipeline

| Component | Status | Notes |
|---|---|---|
| Compiler (`scripts/build/compile.mjs`) | Done | Validates skills, resolves compatibility, emits `dist/` |
| Skill schema (`schemas/skill.schema.json`) | Done | JSON Schema draft 2020-12; package manifest + adapter hints |
| Platform schema (`schemas/platform.schema.json`) | Done | Capability state definitions |
| Platform definitions (5 platforms) | Done | claude-code, claude-web, claude-ios, codex, cursor |
| Capability-driven compatibility resolver | Done | Skills declare required/optional caps; compiler resolves |
| Claude Code emitter | Done | Full package: plugin.json + skill copies + prompts/ |
| Cursor emitter | Done | .cursorrules from compatible skills with degradation notes |
| Registry emitter | Done | dist/registry/index.json with compatibility matrix |
| Node linters (skill + platform) | Done | `scripts/lint/skill.mjs`, `scripts/lint/platform.mjs` |
| Shared validation layer | Done | `scripts/build/lib/validate-skill-policy.mjs` — used by both compiler and linter |
| Materialiser core | Done | `scripts/build/lib/materialise-client.mjs` — path validation, security, extraction |
| Materialise adapter | Done | `adapters/claude/materialise.sh` — fetch from Worker to local cache |
| Worker | Done | `worker/src/index.ts` — Cloudflare Worker, bearer-auth REST API |
| CI build workflow | Done | `.github/workflows/build.yml` — validate + build + upload dist/ |
| Deterministic builds | Done | No timestamps in local builds; provenance only in `--release` mode |

### Test suites

| Suite | Tests | Protects |
|---|---|---|
| Delivery contract | 28 | dist/ artifact completeness, consistency, valid JSON, version parity |
| Portability contract | 76 (4 files) | Canonical source, self-sufficiency, materialisation, determinism |
| Compiler integration | — | Schema + policy + compatibility + emission |
| MCP runtime | — | Tool definitions, security, dashboard API |
| Worker contract | — | Endpoint routing, version pointers, executor integration |
| Remote executor | — | Security, error handling |
| **Total test files** | **70+** | `scripts/build/test/` |

### Runtime layer (v0.5.0+)

| Component | Status | Notes |
|---|---|---|
| Three-tier config (global, machine, project) | Done | `runtime/config/` with YAML field-level merge |
| Tool registry | Done | `runtime/tool-registry.yaml` — claude-code, cursor, codex |
| Adapters (cli, file, mcp) | Done | `runtime/adapters/` |
| Sync engine | Done | `runtime/sync.sh` with manifest state tracking, dry-run |
| Watch mode | Done | `runtime/watch.sh` — auto-sync on config changes |
| MCP server | Done | `runtime/mcp/server.js` — exposes runtime ops as Claude Code tools |
| Dashboard API | Done | `runtime/mcp/dashboard-api.mjs` with tunnel security |
| React dashboard | Done | `dashboard/` — 6 tabs: Tools, Skills, Context Cost, Config, Audit, Analytics |
| Ops tools | Done | `ops/runtime-status.sh`, `ops/validate-all.sh`, etc. |

### Execution & contracts layer (v0.5.3+)

| Component | Status | Notes |
|---|---|---|
| Outcome resolver | Done | `runtime/lib/outcome-resolver.mjs` — route-based execution |
| Capability profile | Done | `runtime/lib/capability-profile.mjs` |
| Remote executor | Done | `runtime/remote-executor/server.mjs` — HTTP proxied tool execution |
| Request signing | Done | `shared/contracts/request-signature.mjs`, `validate.mjs` |
| Contracts package | Done | `packages/contracts/` — shared types + validation |
| Outcome schemas | Done | `schemas/outcome.schema.json`, `schemas/route.schema.json` |
| Route definitions | Done | `shared/routes/full-automation.yaml`, `manual-fallback.yaml` |
| Outcome definitions | Done | `shared/outcomes/repository-audit.yaml` |
| Executor runtime | Done | `runtime/mcp/executor-runtime.mjs` — centralized guardrails |
| Tool definitions | Done | `runtime/tool-definitions.mjs` — canonical tool registry |
| Manifest feature flags | Done | `runtime/manifest.sh` + runtime wiring (`runtime/mcp/server.js`, `runtime/lib/outcome-resolver.mjs`) — flags defined, validated, and enforced at runtime |

---

## Immediate next actions (before any new work proceeds)

### Research-grounded implementation tracks

The repository research in `specs/` clarifies where the next implementation effort should go. The current highest-leverage tracks are:

1. Finish the `review_repository` journey end-to-end on top of the new task-control-plane.
2. Reduce control-plane duplication between script-driven runtime flows and contract-driven runtime flows.
3. Break the Worker surface into smaller, testable modules before additional endpoint growth.
4. Keep the build pipeline deterministic while expanding emitted runtime metadata for task-centric execution.

These tracks are grounded in:

- `specs/repository-research.md`
- `specs/runtime-lib-control-plane-research.md`
- `specs/worker-endpoint-inventory.md`
- `specs/build-pipeline-research.md`

### 1. Complete Phase 9.7 — Manifest-controlled runtime feature flags

**Version:** v0.5.4+
**Status:** All 4 steps complete. ✓

**What exists:**
- Feature flags defined in `runtime/manifest.sh`: `outcome_resolution_enabled`, `effective_contract_required`, `remote_executor_enabled`
- Validation function `validateManifestFeatureFlags()` in `scripts/build/lib/versioning.mjs`
- Tests for validation
- ✓ **Step 2** — Flags read at runtime startup; `remote_executor_enabled` gates server start; `outcome_resolution_enabled` gates contract resolution; `remote_exec` route added to `OUTCOME_ROUTES`
- ✓ **Step 3** — `effective_contract_required=true` blocks tool execution without an `outcomeId`; structured error surfaces missing route info (4 unit tests in `runtime/mcp/handlers.test.mjs`)
- ✓ **Step 4** — All flags toggleable via manifest-only change; rollback criteria documented below

**Rollout criteria:**
- `manifest_feature_flags` reports expected values in runtime environment
- No automation depends on `run_script` for one full release cycle
- Remote execution users have migrated to `remote_exec` with explicit opt-in
- Release checklist includes explicit contract/rollback verification

**Rollback criteria:**
- If explicit-contract rollout breaks automation: set `effective_contract_required=false`
- If remote executor causes instability: set `remote_executor_enabled=false`
- If outcome formatting regressions appear: set `outcome_resolution_enabled=false`
- Rollback must be possible via manifest-only change (no code deploy required)

### 2. Resolve hardcoded outcome resolver before MVA

**Status:** T004–T005 complete (loader-backed resolver landed, deterministic/validation hardening added).

The outcome resolver (`runtime/lib/outcome-resolver.mjs`) now resolves outcomes/routes from loader-backed definitions (`runtime/outcome-definitions.yaml`) with deterministic single-load resolution per contract evaluation and strict definition-shape validation (including malformed map/route handling) covered by unit tests.

Additional post-merge verification completed: alternative resolver permutation/snapshot tests plus direct shell-safety security suite and standalone skill/platform lint runs all pass (warnings only where already documented). Validation now also enforces dictionary-object semantics (plain/null-prototype maps only) to prevent non-record types (for example Map instances) from silently entering route resolution.

---

## MVA: Task Control Plane — Portable Repository Review (NEXT MAJOR)

**Goal:** Prove one portable work journey end-to-end. Start `review_repository` in a weak environment, continue in a stronger one, preserve findings with provenance, finish without re-explaining.

**Version:** v0.7.0
**Autospec:** [github.com/thomashillman/autospec](https://github.com/thomashillman/autospec) — T001 completed (`docs/autospec/review-repository/{spec,plan,tasks,acceptance}.yaml`)

### Six core primitives

| Primitive | Description |
|---|---|
| PortableTaskObject | Goal, current route, state, progress, findings, unresolved questions, approvals, route history, next action |
| TaskStore | Versioned save/load/update/conflict with snapshot retrieval |
| RouteResolver | Capability-aware deterministic route selection — never prompt-driven |
| EffectiveExecutionContract | Selected route, equivalence level, missing capabilities, required inputs, stronger-host guidance |
| FindingsLedger | Provenance-marked findings: `verified`, `reused`, `hypothesis`; transitions on route upgrade |
| ContinuationPackage + HandoffToken | Portable task payload + expiring, replay-safe token for environment transitions |

### Task types and routes

**Task type:** `review_repository`

| Route | Environment | Notes |
|---|---|---|
| `github_pr` | Weak (web, mobile) | Public PR inspection via API |
| `pasted_diff` | Weak | User-provided diff text |
| `uploaded_bundle` | Weak | Uploaded archive |
| `local_repo` | Strong (IDE, desktop) | Full local inspection; upgrade target |

### Sprint plan

**Week 1 — task object and control-plane foundations**
- ✓ Create Autospec artefacts (T001)
- ✓ Define versioned schemas: PortableTaskObject, TaskStateSnapshot, RouteDefinition, EffectiveExecutionContract, ProgressEvent, FindingsLedgerEntry, ProvenanceMarker, ContinuationPackage, HandoffToken (T002)
- ✓ Implement TaskStore with versioned updates and optimistic concurrency (T003)
- Refactor `runtime/lib/outcome-resolver.mjs` from hardcoded admin mappings to loader-backed task-and-route resolution (T004–T005)
- Deliverables: approved schemas, failing red test suite, clean runtime boundary

**Week 2 — core task runtime**
- ✓ Deterministic RouteResolver using real capability profiles (T006)
- ✓ EffectiveExecutionContract engine (T007)
- ✓ `review_repository` task type with all four routes (T008)
- ✓ PortableTaskObject lifecycle and state transitions (T009)
- ✓ FindingsLedger with provenance rules (T010)
- ✓ ProgressEvent pipeline (T011)
- ✓ ContinuationPackage builder (T012)
- Deliverables: working local task runtime for `review_repository` with persisted state, explicit contracts, visible progress, preserved findings

**Week 2 status update (2026-03-14):** T012 completed with a validated continuation package creator (`runtime/lib/continuation-package.mjs`), TaskStore integration for package creation, and continuation progress-event emission coverage.

**Closed-PR reconciliation update (2026-03-14):**
- ✓ T008 hardening completed: route-runtime loader injection guards and route-input drift protection landed.
- ✓ T009 lifecycle consistency fix completed: TaskStore route-selection versioning/conflict handling repaired.
- ✓ T010 provenance transitions hardened with explicit `finding_transitioned` progress events.
- ✓ T011 coverage extended through dedicated transition-event typing and regression tests.
- ✓ T012 continuation flow hardened: idempotency, canonical replay behavior, and strict input validation are now covered.
- ✓ T013 completed (2026-03-14): `runtime/lib/handoff-token-service.mjs` now issues/verifies/consumes signed handoff tokens with task binding, expiry-window enforcement, replay-store abstraction, timing-safe signature checks, and TaskStore continuation gating with idempotent replay semantics.
- ✓ T014 completed (2026-03-14): Worker task-state/control-plane operations are live and contract-tested across `/v1/tasks`, `/v1/tasks/:taskId`, `/v1/tasks/:taskId/state`, `/v1/tasks/:taskId/route-selection`, `/v1/tasks/:taskId/continuation`, `/v1/tasks/:taskId/progress-events`, and `/v1/tasks/:taskId/snapshots(/:snapshotVersion)`.
**Post-review hardening update (2026-03-14):**
- ✓ T013 regression gaps closed: execution-contract validation now occurs before token consumption, preventing accidental token burn on invalid continuation inputs.
- ✓ Added dedicated negative-path tests for handoff-token lifetime-window violations and consume-expiry guards, plus continuation-flow assertion that invalid contracts never consume a token.
**Week 3 — handoff, route upgrade, and validation**
- ✓ HandoffToken service: task binding, expiry, signature, replay protection (T013)
- ✓ Extend Worker control-plane endpoints for task-centric operations (T014)
- ✓ Weak-environment start flow (T015)
- ✓ Strong-environment resume flow: load existing task → re-evaluate capabilities → upgrade to `local_repo` → preserve findings with provenance (T016)
- ✓ Dashboard and API views: task readiness, route history, progress, findings provenance, stronger-route availability (T017)
- ✓ Telemetry and audit events (T018)
- ✓ Adversarial suite: fake capabilities, replayed tokens, injected repo text, route mismatches, missing task state (T019)
- ✓ Staging deployment and release checklist (T020)
- Deliverables: staging-ready MVA — start anywhere, finish where the tools are, never re-explain the task

**Week 3 progress update (2026-03-14):** T013 and T014 are complete with worker-level task endpoints, structured 4xx mappings, continuation token verify/consume enforcement, and contract/unit coverage for success/failure and replay/expiry scenarios. Security hardening now includes HMAC-based signature verification, signed-token key configuration checks, timestamp-order validation, and constant-time signature comparison semantics in T013 tests.

**Week 3 completion update (2026-03-14):** T015-T020 are now implemented end-to-end: weak-start and strong-resume flows are runtime-backed (`runtime/lib/review-repository-journey.mjs`), task readiness is exposed via Worker API (`GET /v1/tasks/:taskId/readiness`), telemetry/audit event types are emitted for start/upgrade lifecycle transitions, adversarial guards/tests now cover injected input and optimistic-version conflict paths, and staging/release gates are documented in `docs/review-repository-week3-staging-checklist.md`.

**Week 3 follow-up hardening (2026-03-14):** Readiness projection is now centralized in `runtime/lib/task-store.mjs` (`getReadinessView`) so Worker and runtime callers share one canonical shape and avoid drift between adapter surfaces.

### Implementation plan expansion from repository research

The research pass changes the planning priority inside the MVA. The next work should be organized into four concrete tracks.

#### Track A - Finish the task-control-plane journey

Focus:

- complete T015-T020 on top of the now-established `runtime/lib/` control-plane modules

Why now:

- `runtime/lib/` is already the architectural center of gravity
- T013 and T014 established the minimum viable task and continuation substrate
- the product claim still depends on a real weak-start -> strong-resume journey

Implementation steps:

- T015: implement weak-environment task creation flows that produce canonical PortableTaskObjects using route-specific required inputs
- T016: implement strong-environment resume and route-upgrade flow that re-evaluates capability profiles, upgrades to `local_repo`, and transitions findings provenance correctly
- T017: surface task readiness, route history, progress events, findings provenance, and stronger-route availability in dashboard and API payloads
- T018: emit telemetry and audit events from task transitions, route upgrades, and continuation-package creation
- T019: expand adversarial coverage around capability spoofing, replayed continuation tokens, input mismatches, and task version conflicts
- T020: document release gates and stage the full journey in a deployment-ready configuration

Definition of done:

- a repository review can begin in a degraded route and resume in `local_repo` without task restatement
- findings survive route upgrade with explicit provenance transitions
- dashboard and API expose enough task state to explain why the runtime is or is not ready

#### Track B - Unify runtime execution paths

**Track B completion update (2026-03-14):**
- ✓ Runtime task-facing operations now flow through a shared `runtime/lib/task-control-plane-service.mjs` layer.
- ✓ Worker task endpoints now call the shared task-control-plane service adapter rather than duplicating TaskStore invocation mappings.
- ✓ MCP task tools (`task_start_review_repository`, `task_resume_review_repository`, `task_get_readiness`) and dashboard task endpoints now use the same task-facing runtime service path.
- ✓ Added parity coverage for the new MCP task tools and service delegation behavior.
- ✓ Follow-up hardening: task-surface adapters now fail fast when task service wiring is missing, and MCP server refactor residue was removed.


Focus:

- reduce the split between script-backed dashboard/runtime actions and the newer contract-driven runtime control-plane

Why now:

- research identified a real split-brain risk between `runtime/mcp/dashboard-api.mjs` and `runtime/lib/`
- adding more task features without tightening that boundary will make behavior drift more likely

Implementation steps:

- define which runtime actions should remain shell-script adapters versus which should move behind `runtime/lib/` services
- introduce narrow runtime service modules for task-facing flows so MCP handlers, dashboard API, and Worker can share one implementation path
- keep shell scripts as thin orchestration wrappers where they remain necessary for environment integration
- extend tests to assert equivalent behavior across MCP, dashboard, and Worker surfaces for the same route/outcome decisions

Definition of done:

- task-centric behavior is implemented once in `runtime/lib/` or a thin adjacent service layer
- dashboard and MCP surfaces become adapters over shared runtime behavior instead of parallel implementations

#### Track C - Decompose the Worker surface

**Track C completion update (2026-03-14):**
- ✓ Worker entrypoint `worker/src/index.ts` is now route wiring only.
- ✓ Auth, HTTP response helpers, artifact/manifest handlers, task-control-plane handlers, and executor proxy handling are extracted into focused Worker-local modules under `worker/src/`.
- ✓ Public route contracts are preserved while internals are decomposed for independent review/testability.
- ✓ Follow-up hardening: TaskStore wiring now re-initializes whenever handoff-signing-key configuration changes (including key removal), and continuation replay fingerprints are bounded to prevent unbounded in-memory growth.

Focus:

- split `worker/src/index.ts` by responsibility before more features land

Why now:

- the Worker already owns auth, artifact delivery, execution proxying, task state, snapshots, and continuation behavior
- the current file is serviceable, but future growth will make review and security work harder

Implementation steps:

- extract auth and common response helpers into Worker-local modules
- extract artifact-serving routes into a dedicated manifest/artifact handler
- extract task-control-plane handlers into a dedicated Worker task module
- extract remote-execution proxy code into a focused adapter around `runtime/remote-executor`
- preserve current public routes and response contracts while refactoring internally

Definition of done:

- `worker/src/index.ts` is mostly route wiring
- route families are isolated enough to test independently
- auth, task, and artifact changes can land without touching unrelated code

#### Track D - Extend build/runtime metadata for portable tasks

Focus:

- keep the compiler deterministic while expanding runtime metadata to support task-centric orchestration

Why now:

- the build pipeline is already the place where source definitions become runtime-consumable artifacts
- task/outcome/route growth will put more pressure on emitted runtime metadata

Implementation steps:

- review whether task route definitions and task route input definitions should eventually be emitted into `dist/runtime/` instead of remaining runtime-only files
- keep manifest hashing and deterministic emission rules intact as new runtime documents are added
- add contract tests that cover any new emitted task metadata
- update registry/runtime docs so downstream consumers know which artifacts are authoritative for task orchestration

Definition of done:

- runtime consumers can discover task-oriented metadata from emitted artifacts where appropriate
- new metadata remains deterministic, hashed, and covered by contract tests

### Cross-track sequencing

Recommended execution order:

1. Track A: finish the portable `review_repository` journey because it is the flagship proof.
2. Track B: remove shared-runtime drift while the control-plane surface is still small enough to consolidate cleanly.
3. Track C: decompose the Worker after task flows stabilize enough to preserve the external contract during refactor.
4. Track D: extend emitted metadata in lockstep with proven runtime needs, not ahead of them.

### Explicit near-term milestones

#### Milestone 1 - Resume readiness

Target:

- complete T015 and T016
- prove weak-start -> strong-resume with preserved findings

#### Milestone 2 - Runtime convergence

Target:

- share task-facing execution logic across MCP, dashboard, and Worker paths

#### Milestone 3 - Worker maintainability

Target:

- split Worker internals without changing public endpoints

#### Milestone 4 - Emitted task metadata maturity

Target:

- formalize which task-route and task-input definitions belong in `dist/runtime/`

### Key success metrics

| KPI | Target | When |
|---|---|---|
| Portable task completeness (all required fields present) | 100% | End of Week 2 |
| Deterministic route correctness (fixture scenarios) | >= 98% | End of Week 2 |
| Contract honesty (route, equivalence, missing caps match reality) | 100% | Continuous |
| Resume readiness (no user restatement needed) | >= 90% | MVA release |
| Route-upgrade success (upgrade preserves findings) | >= 85% | MVA release |
| Handoff friction (median user actions to continue) | <= 1 | MVA release |
| Findings provenance coverage (verified/reused/hypothesis after transition) | 100% | MVA release |
| Control-plane reliability (Worker endpoints) | >= 99.5% | Production |
| Working staging flow (start → finish with preserved state) | 21 calendar days | Sprint 1 |

### Risk register

| Risk | Mitigation |
|---|---|
| Mistaking substrate for product — Worker + runtime exist but resolver is still admin-first | T004 explicitly replaces hardcoded resolver before any new UI work |
| Drifting back into agent thinking | Providers and IDEs are adapters at the edge only; no orchestration framework |
| Continuity theatre — handoff exists but resumed system isn't ready | Resume readiness is a first-class KPI; adversarial suite tests incomplete state |
| Over-engineering before the flagship workflow is complete | No broad platform parity, no marketplace expansion until `review_repository` journey is proven |

### Pre-MVA gates

Before the MVA merges:
- All PortableTaskObject schemas are versioned with snapshot tests
- TaskStore and RouteResolver have failing tests written first
- Hardcoded admin-first resolver is removed or isolated
- `review_repository` acceptance flow passes locally: task creation → continuation → resume

Before staging:
- Worker control-plane endpoints are contract-tested and return version-consistent task-control artefacts required for route and contract resolution
- Contracts computed from actual capabilities and routes
- Continuation packages and handoff tokens are validated, expiring, signature-checked, task-bound, and replay-safe
- Findings provenance visible through route upgrade
- Adversarial suite passes

Before broadening to more task types or hosts:
- Web-to-desktop review journey must feel ready without user re-explanation
- Route upgrade deepens work rather than restarts it
- One week of staging metrics: low handoff friction, strong resume readiness, full provenance coverage

### Build order constraint

**Do not:**
- Add UI or integrations before task-state and governed routing
- Build another agent framework (keep providers as adapters at the edge)
- Use chat as the continuity layer (persist structured task state first)
- Put route selection in prompts (route selection must be deterministic runtime logic)

---

## Deferred work

| Item | Why deferred |
|---|---|
| Interop marker protocol | No proven need yet; plain markdown references suffice |
| Sync locking and conflict sentinels | Single-user repo; `git rebase --autostash` handles it |
| Plugin splitting | One plugin is fine until context pressure is observable |
| Windows support | Not needed now; watcher/service changes are isolatable |
| Token-efficient registry (dist/registry/summary.json) | Nice-to-have; defer until Phase 9.7 and MVA complete |
| Test harness for schema + policy + compiler integration | Defer until MVA stabilizes |

---

## Acceptance criteria

- [x] `claude plugin validate .` passes at repo root
- [ ] Claude Code can add the marketplace and install `core-skills` (pending device test)
- [ ] Installed plugin exposes expected skills (awaiting full validation)
- [ ] Cross-device sync: push from device A, restart Claude Code on device B reflects changes
- [x] `adapters/claude/dev-test.sh` runs clean
- [x] CI validates plugin structure and symlink integrity on every push
- [x] `ops/new-skill.sh <name>` creates skill, symlink, and bumps version
- [x] `CLAUDE.md` is loaded when opening the repo in Claude Code
- [ ] Codex can read `shared/manifest.md` and reference skill files (not tested yet)
- [x] No secrets in tracked files
- [x] Delivery contract: 28 tests protecting dist/ artifacts
- [x] Portability contract: 76 tests protecting materialisation
- [x] All 22 skills have structured capability contracts
- [x] Compiler resolves compatibility from platform capabilities (not hardcoded)
- [x] Phase 9.7 runtime gating wired and tested (Steps 2-4)
- [x] T004: outcome resolver moved from hardcoded mappings to loader-backed definitions with tests
- [x] T005: outcome resolver deterministic/validation cleanup completed with tests
- [x] T001: Autospec artefacts created for `review_repository` MVA
- [x] T002: versioned control-plane schemas defined with tests
- [x] T003: TaskStore implemented with versioned optimistic concurrency and snapshot retrieval tests
- [x] T006: deterministic RouteResolver implemented using capability profiles with route-definition loader and tests
- [x] T007: EffectiveExecutionContract engine implemented with deterministic route-derived contract projection and tests
- [x] T008: review_repository route runtime implemented with canonical four routes and route-input validation tests
- [x] T009: PortableTaskObject lifecycle/state transition runtime implemented with canonical transition rules, route-history updates, and TaskStore integration tests
- [x] T010: FindingsLedger implemented with provenance transitions for route upgrades, plus TaskStore integration/tests
- [x] T011: ProgressEvent pipeline implemented with validated event emission + TaskStore integration tests
- [x] MVA: `review_repository` portable journey proven end-to-end

---

## Completed phases (reference)

<details>
<summary>Phase 1: Scaffold and validate (v0.1.0)</summary>

Repo skeleton, marketplace.json, core-skills plugin.json, shared/manifest.md, shared/principles.md, adapters/claude/dev-test.sh, ops/new-skill.sh, shared/skills/_template/, .github/workflows/validate.yml, CLAUDE.md, .claude/hooks/session-start.sh, README.md. Six initial skills: session-start-hook, web-search, commit-conventions, git-ops, principles, plugin-setup.
</details>

<details>
<summary>Phase 2: Enhanced SKILL.md frontmatter and content</summary>

All skills enhanced with full YAML frontmatter: multi-model variants (opus/sonnet/haiku), testing framework (tests in frontmatter), composition framework, performance monitoring/analytics infrastructure. Template updated at shared/skills/_template/SKILL.md.
</details>

<details>
<summary>Phase 3: Multi-device sync</summary>

`ops/sync/ai-sync.sh` — pull/push/status commands for single-user multi-device workflow.
</details>

<details>
<summary>Phase 4: Codex adapter</summary>

`adapters/codex/install.sh` — thin shim that syncs config before invoking Codex.
</details>

<details>
<summary>Phase 5: Iterate and harden</summary>

Deferred improvements: interop markers, sync guardrails, plugin splitting, background auto-sync. Only triggered by observed need.
</details>

<details>
<summary>Phase 6: Feature expansion — 14 items (v0.4.0)</summary>

**Branch:** `claude/analyze-propose-features-kyrYH`

6 new skills (debug, changelog, task-decompose, explain-code, skill-audit, release-checklist), 3 ops tools (lint-skill.sh, skill-stats.sh, enhanced new-skill.sh), 2 hooks (pre-tool-use, post-tool-use), 2 workflows (code-quality, release-agent), CI frontmatter validation, Cursor adapter.
</details>

<details>
<summary>Phase 7: Code quality & workflow expansion (v0.4.7)</summary>

**Branch:** `claude/review-features-plan-omLC3`

7 new skills (memory, test-writer, security-review, refactor, review-pr, issue-triage, simplify). 2 workflows (daily-brief, pre-commit). Infrastructure: ops/validate-pins.sh, .claude/hooks/post-tool-use-metrics.sh. Total: 22 skills.
</details>

<details>
<summary>Phase 8: Runtime integration (v0.5.0)</summary>

**Branch:** `claude/phase-8-runtime-Z3Zo4`

Three-tier config (global, machine, project) with field-level merge for MCPs. Tool registry (claude-code, cursor, codex) with adapter abstraction. Adapter layer: MCP, CLI, file adapters. Sync engine with manifest state tracking and dry-run. MCP server exposing runtime operations as Claude Code tools. React dashboard with 6 tabs. Updated session-start hook. Ops tools: runtime-status.sh, validate-registry.sh. CI integration.
</details>

<details>
<summary>Phase 9.1: Distribution first slice (v0.5.1)</summary>

**Branch:** `claude/plan-config-os-distribution-rjqcI`

Skill schema (JSON Schema draft 2020-12), compiler (scripts/build/compile.mjs), Cloudflare Worker (worker/), CI build workflow (.github/workflows/build.yml), materialiser adapter (adapters/claude/materialise.sh). Fixed 7 YAML quoting bugs.
</details>

<details>
<summary>Phase 9.2: Capability-driven compatibility (v0.5.2)</summary>

Platform registry (shared/targets/platforms/), capability contracts (required/optional/fallback_mode), compatibility resolver, runtime probe (ops/capability-probe.sh), Node linters (scripts/lint/). All 22 skills migrated to structured capability contracts.
</details>

<details>
<summary>Phase 9.3: Close compatibility loop (v0.5.3)</summary>

Emitter wiring (compatibility-filtered skills to emitters), validate-only pipeline, skill linter AJV schema validation, probe accuracy fixes, Cursor emitter (.cursorrules generation).
</details>

<details>
<summary>Phase 9.4: Validation architecture overhaul (v0.5.3+)</summary>

**Branch:** `claude/analyze-product-feedback-FQeFT`

Shared validation layer (scripts/build/lib/validate-skill-policy.mjs), schema tightening (fallback_mode conditional, strict variant defs, namespaced extensions), compiler strictness (platform validation, zero-emit detection, O(n^2) fix), linter refactoring (shared validators, error/warning separation).
</details>

<details>
<summary>Phase 9.5: Delivery contract (v0.5.3+)</summary>

28 automated tests (scripts/build/test/delivery-contract.test.mjs) protecting: emitted file existence, required frontmatter, valid JSON structure, registry completeness, version consistency, cross-file reference validity, prompt file presence.
</details>

<details>
<summary>Phase 9.6: Portability contract — TDD (v0.6.0)</summary>

**Branch:** `claude/tdd-portability-contract-kRY5U`

Formalised and enforced portability contract with 76 tests across 4 files: canonical-source-contract, materialisation-contract, source-change-flow, materialiser-core. Implementation: scripts/build/lib/materialise-client.mjs, enhanced emit-claude-code.mjs. CI gates and docs updated.
</details>

<details>
<summary>Execution & contracts contributions (v0.5.3–v0.5.4)</summary>

Multiple Codex-contributed branches merged to main:

- **Outcome resolver:** `runtime/lib/outcome-resolver.mjs` — route-based execution with admin mappings
- **Remote executor:** `runtime/remote-executor/server.mjs` — HTTP proxied tool execution
- **Request signing:** `shared/contracts/request-signature.mjs`, `validate.mjs` — canonical signing + ingress verification
- **Contracts package:** `packages/contracts/` — shared types + validation
- **Schemas:** `schemas/outcome.schema.json`, `schemas/route.schema.json`
- **Route definitions:** `shared/routes/full-automation.yaml`, `manual-fallback.yaml`
- **Outcome definitions:** `shared/outcomes/repository-audit.yaml`
- **Executor runtime:** `runtime/mcp/executor-runtime.mjs` — centralized guardrails
- **Tool definitions:** `runtime/tool-definitions.mjs` — canonical registry with validation
- **Dashboard security:** Tunnel security, backward-compatible API
- **Manifest feature flags:** `runtime/manifest.sh` + validation (Phase 9.7 Step 1)
</details>

---

## Platform maturity

| Platform | Compiler | Worker | Runtime sync | Status |
|----------|----------|--------|-------------|--------|
| Claude Code | Full emitter | Serves latest bundle | Full desired-state sync | **Production** |
| Cursor | Emits rules | Not served | No runtime adapter | **Partial** |
| claude-web, claude-ios, codex | Capability model loaded | Not served | No adapter | **Model only** |
</content>
</invoke>
