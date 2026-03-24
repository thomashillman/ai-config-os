# AI Config OS — Implementation Plan

## Overview

The **control plane for portable AI work**. The task object is the unit of value — not chat, not prompts, not agents. Work starts in any environment (web, mobile, IDE), and the runtime routes it, checkpoints it, and continues it in a stronger environment without the user re-explaining anything.

The existing substrate (Worker endpoints, emitted runtime artefacts, capability profiling, remote executor, dashboard contract panel) is preserved and extended. The new layer adds six core primitives: PortableTaskObject, capability detection integration, deterministic route resolution, EffectiveExecutionContract, structured continuation, and findings provenance.

The first automated workflow is `review_repository`: start in a limited environment, continue in a stronger one, preserve findings with provenance, finish without reconstructing context.

**The product test:** after switching environments, does the runtime feel ready?

Autospec artefacts live at [github.com/thomashillman/autospec](https://github.com/thomashillman/autospec).

Core principle: **own the task lifecycle — routing, continuation, verification, provenance, and cross-environment upgrades**.

---

## Current state — Phase 10 milestone, updated 2026-03-24

Versioning note: `VERSION` is the canonical repository release number (see `./VERSION`), while phase/milestone labels in this plan track delivery checkpoints.

Last reconciled: 2026-03-24 (skills/tests/tabs/platform inventory claims verified against repository source-of-truth).

### Completed infrastructure

| Area | Version | Notes |
|---|---|---|
| Repo scaffold, .gitignore, marketplace.json | v0.1.0 | Phase 1 |
| core-skills plugin.json | v0.5.4 | Inventory source is `shared/skills/*/SKILL.md`; 34 installable skills currently materialized (excluding `_template`) |
| shared/manifest.md (skill index) | — | Mirrors current `shared/skills/*/SKILL.md` inventory (34 installable skills, excluding `_template`) plus workflows/components |
| shared/principles.md | — | Opinionated AI behaviour defaults |
| adapters/claude/dev-test.sh | — | Non-interactive validation |
| CLAUDE.md (dev context) | — | Extended with self-improvement, portability contract, delivery contract, CI pitfalls |
| README.md | — | Full getting-started, architecture, troubleshooting |
| .github/workflows/ | — | `validate.yml` (structure), `build.yml` (compile + test + dist artifact) |
| .claude/hooks/ | — | session-start, pre-tool-use, post-tool-use, post-tool-use-metrics, skill-outcome-tracker |

### Skills (34 installable total from `shared/skills/*/SKILL.md`, excluding `_template`)

Canonical declaration format (validated in CI): `Installable skill count: <number> (source: shared/skills/*/SKILL.md; excluding _template).`

| Skill | Type | Phase |
|---|---|---|
| session-start-hook, web-search, commit-conventions, git-ops, principles, plugin-setup | prompt/hook | Phase 1 |
| code-review, context-budget, pr-description | prompt | Phase 2 |
| debug, changelog, task-decompose, explain-code, skill-audit, release-checklist | prompt/agent/workflow-blueprint | Phase 6 |
| memory, test-writer, security-review, refactor, review-pr, issue-triage, simplify | prompt/agent | Phase 7 |
| task-start, task-save, task-resume | agent | Phase 10 (KV persistence) |
| momentum-reflect | agent | Phase 10 (Momentum Engine skill surface) |
| list-available-skills, surface-probe | prompt/agent | Phase 10 (Runtime visibility + surface diagnostics) |
| failed-build-analysis, ci-conditional-audit, lockfile-audit | prompt/agent | Phase 10 (CI/build reliability) |
| post-merge-retrospective | prompt/agent | Phase 10 (Post-merge process improvement) |
| skill-effectiveness, autoresearch | prompt/agent | Phase 10 (Skill Analytics) |

All 34 installable skills in `shared/skills/*/SKILL.md` (excluding `_template`) have: YAML frontmatter, structured capability contracts, and tests defined in frontmatter.
skill-effectiveness and autoresearch now have opus/sonnet/haiku prompt variants.

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
| Platform definitions (14 targets) | Done | Canonical target definitions in `shared/targets/platforms/*.yaml` (including claude-code/web/ios, codex, cursor, and CI/IDE variants) |
| Capability-driven compatibility resolver | Done | Skills declare required/optional caps; compiler resolves |
| Claude Code emitter | Done | Full package: plugin.json + skill copies + prompts/ |
| Cursor emitter | Done | .cursorrules from compatible skills with degradation notes |
| Codex emitter | Done | `scripts/build/lib/emit-codex.mjs` — emits Codex-compatible package |
| Registry emitter | Done | dist/registry/index.json with compatibility matrix |
| Node linters (skill + platform) | Done | `scripts/lint/skill.mjs`, `scripts/lint/platform.mjs` |
| Shared validation layer | Done | `scripts/build/lib/validate-skill-policy.mjs` — used by both compiler and linter |
| Materialiser core | Done | `scripts/build/lib/materialise-client.mjs` — path validation, security, extraction |
| Materialise adapter (claude) | Done | `adapters/claude/materialise.sh` — fetch from Worker to local cache |
| Materialise adapter (codex) | Done | `adapters/codex/materialise.sh` — Codex-compatible fetch and cache |
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
| Modularity refactoring | 46 (4 files) | task-shared, kv-persistence, load-runtime-data, worker-task-validators |
| Dashboard formatters | 17 (2 files) | taskFormatters, dateFormatters |
| **Total test files** | **133** | `scripts/build/test/` + `dashboard/src/__tests__/` |

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
| React dashboard | Done | `dashboard/` — 8 top-level tabs: Tasks, Tools, Skills, Context Cost, Config, Audit, Analytics, Bootstrap Runs (Task Detail is nested within Tasks) |
| Ops tools | Done | `ops/runtime-status.sh`, `ops/validate-all.sh`, etc. |
| KV-backed task store | Done | `runtime/lib/task-store-kv.mjs` — portable task persistence via Cloudflare KV |
| Worker task store adapter | Done | `runtime/lib/task-store-worker.mjs` — thin Worker-side adapter over KV store |
| Worker task control plane service | Done | `runtime/lib/task-control-plane-service-worker.mjs` — Worker-compatible service layer |
| Session-start task resumption | Done | `.claude/hooks/session-start.sh` — queries Worker KV for active tasks on session start |
| Shared task primitives | Done | `runtime/lib/task-shared.mjs` — error classes, readiness view, findings provenance (DRY extraction) |
| KV persistence layer | Done | `runtime/lib/kv-persistence.mjs` — key builders, low-level KV helpers, index management (SRP extraction) |
| Build-local runtime data loaders | Done | `scripts/build/lib/load-runtime-data.mjs` — decouples compiler from runtime imports (DIP) |
| Worker task validators | Done | `worker/src/validation/tasks.ts` — pure validators split from HTTP handlers (SRP) |
| Dashboard shared formatters | Done | `dashboard/src/lib/taskFormatters.js`, `dateFormatters.js`, `workerClient.js` — DRY extraction |

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

**Status (2026-03-23):** Internal modularity/cohesion refactoring complete — 5 SRP/DRY/DIP violations resolved (see runtime layer table above). Remaining highest-leverage track: staging the weak-start → strong-resume `review_repository` journey (Milestone 1).

These tracks are grounded in:

- `specs/repository-research.md`
- `specs/runtime-lib-control-plane-research.md`
- `specs/worker-endpoint-inventory.md`
- `specs/build-pipeline-research.md`

### 1. Historical completion record — Phase 9.7 manifest-controlled runtime feature flags

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

### 2. Historical completion record — hardcoded outcome resolver removal before MVA

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

**Track D completion update (2026-03-14):**
- ✓ Compiler runtime emission now publishes task route metadata into `dist/runtime/task-route-definitions.json` and `dist/runtime/task-route-input-definitions.json`.
- ✓ Runtime manifest document mapping and artifact hashing now cover both task metadata files for deterministic integrity checks.
- ✓ Contract coverage now verifies emitted task metadata presence, hashing, canonical source parity, and deterministic ordering.
- ✓ Repository docs now identify `dist/runtime/` as the authoritative emitted surface for task orchestration metadata.

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

- validate and operationalize completed T015/T016 flows in staging
- prove weak-start -> strong-resume with preserved findings via staged runbooks and KPI tracking

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

## Momentum Engine — The Experience Layer (COMPLETE)

**Goal:** Make the task control plane *speak*. The MVA proved that tasks can start weak, resume strong, and preserve findings. The Momentum Engine makes the user *feel* that — through intelligent narration, confidence evolution, self-improvement, and a shelf that surfaces what to continue next.

**Core principle:** The narrator is the product. Schemas serve the narrator, not the other way around. Every component exists to produce the exact right sentence at the exact right moment.

**Milestone tag:** Phase 10

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│               Self-Improvement Loop                     │
│      /loop 10m /momentum-reflect                        │
│  reads observations → proposes narrator improvements    │
└────────────────────────┬────────────────────────────────┘
                         │ improves
┌────────────────────────▼────────────────────────────────┐
│              Momentum Narrator                          │
│   narrate(task, event, contract) → prose + structured   │
│                                                         │
│   Calls into:                                           │
│   ┌──────────┐ ┌──────────┐ ┌────────────┐             │
│   │Confidence│ │ Strength │ │  Upgrade   │             │
│   │  Rules   │ │  Labels  │ │Explanation │             │
│   └──────────┘ └──────────┘ └────────────┘             │
└────────────────────────┬────────────────────────────────┘
                         │ emits narrations
┌────────────────────────▼────────────────────────────────┐
│              Momentum Observer                          │
│   Records: narration_shown, user_response               │
│   Feeds: self-improvement reflector                     │
│   Plugs into: existing ProgressEventPipeline            │
└────────────────────────┬────────────────────────────────┘
                         │ reads
┌────────────────────────▼────────────────────────────────┐
│   Shelf + Intent Lexicon                                │
│   Shelf: ranks continuable tasks by environment fit     │
│   Lexicon: resolves natural language → task outcomes     │
└─────────────────────────────────────────────────────────┘
                         │ reads
┌────────────────────────▼────────────────────────────────┐
│  Task + Contract + Findings (existing MVA substrate)    │
│  PortableTaskObject, EffectiveExecutionContract,        │
│  FindingsLedger, ProgressEventPipeline, TaskStore       │
└─────────────────────────────────────────────────────────┘
```

### Design principles

1. **Narrator-first:** Every component feeds the narrator. The narrator produces prose + structured output. The prose *is* the UX.
2. **Templates as data:** Narration templates are mutable data objects, not hardcoded strings. The self-improvement loop modifies templates, not code.
3. **Workflow-agnostic protocol:** The narrator accepts any PortableTaskObject + EffectiveExecutionContract. `review_repository` is the first consumer, not the only one.
4. **Observation is non-negotiable:** Every narration emitted is recorded. Every user response is recorded. Without observation, self-improvement is impossible.
5. **Confidence evolves narratives, not just metadata:** Finding summaries change text as confidence grows — "Possible null pointer risk" → "Confirmed null pointer risk".
6. **The shelf surfaces environment-aware continuation value:** A task with 3 findings waiting for `local_repo` verification ranks higher when the user *has* local repo access.

### Slice 1 — Momentum Narrator (core)

**Files:**
- `runtime/lib/momentum-narrator.mjs` — narrator engine
- `runtime/lib/momentum-templates.mjs` — mutable narration templates (data, not code)
- `scripts/build/test/momentum-narrator.test.mjs` — tests

**What it does:**

The narrator takes task state and produces structured prose. It is the single integration point between the task control plane and user-facing surfaces.

**Narrator protocol — five narration points:**

```javascript
// Each returns { headline, progress, strength, next_action, upgrade, findings[] }

narrator.onStart(task, contract)
// → "Starting repository review with the diff you provided. I can begin analysis
//    now. If you continue on your computer later, I can verify findings against
//    the full repository."

narrator.onResume(task, contract, previousContract)
// → "Continuing your repository review. 2 earlier findings are ready.
//    Full repository access is now available — I can verify call sites
//    and dependency impact."

narrator.onFindingEvolved(task, finding, previousConfidence, newConfidence)
// → "Earlier I flagged a possible null pointer risk based on the diff.
//    I've now verified it against the full repository — confirmed."

narrator.onUpgradeAvailable(task, currentContract, availableContract)
// → "With full repository access, I can verify these 2 findings against
//    call sites and related tests. Continue with deeper inspection?"

narrator.onShelfView(tasks[], currentCapabilities)
// → [{ task_id, headline, continuation_reason, environment_fit }]
```

**Narration output shape:**

```javascript
{
  headline: "Continuing your repository review",           // string — the lead sentence
  progress: "2 findings from earlier session, ready for full verification",
  strength: {
    level: "full",                                         // "limited" | "degraded" | "full"
    label: "Full repository access",
    description: "Can verify call sites, run tests, inspect dependencies"
  },
  next_action: "Verify earlier findings against call sites and related tests",
  upgrade: null,                                           // or { before, now, unlocks }
  findings: [
    {
      finding_id: "f1",
      narrative: "Confirmed null pointer risk in webhook handler",   // evolves with confidence
      confidence_change: { from: "hypothesis", to: "verified" },
      evidence_summary: "Verified against repository — no null check before access on line 42"
    }
  ]
}
```

**Template structure:**

Templates are plain objects. The narrator engine interpolates them with task state. The self-improvement loop can replace any template without code changes.

```javascript
// momentum-templates.mjs — initial handcrafted templates
export const templates = {
  onStart: {
    headline: "Starting {taskType} with {routeLabel}",
    progress: null,
    strength: "{strengthDescription}",
    next_action: "{contract.next_action}",
    upgrade: {
      available: "If you continue in {strongerRoute}, I can {upgradeUnlocks}",
      not_available: null,
    },
  },
  onResume: {
    headline: "Continuing your {taskType}",
    progress: "{findingsCount} findings from earlier session{upgradeClause}",
    // ...
  },
  // ...
};
```

**Strength labels (embedded in narrator, not separate module):**

| Route | Level | Label | Description |
|-------|-------|-------|-------------|
| `pasted_diff` | `limited` | Diff-only review | Can spot patterns in changed lines; cannot verify broader impact |
| `github_pr` | `degraded` | PR metadata + diff | Can see PR context and diff; cannot run local analysis |
| `uploaded_bundle` | `degraded` | Uploaded snapshot | Can inspect files; cannot run tools or verify live state |
| `local_repo` | `full` | Full repository access | Can verify call sites, run tests, inspect dependencies |

**Confidence-driven narrative evolution:**

The narrator changes finding *text* based on provenance status, not just metadata badges:

| Provenance | Narrative prefix | Example |
|------------|-----------------|---------|
| `hypothesis` | "Possible" / "Potential" | "Possible null pointer risk in webhook handler" |
| `reused` | "Previously identified" | "Previously identified null pointer risk — awaiting verification" |
| `verified` | "Confirmed" / "Verified" | "Confirmed null pointer risk in webhook handler" |

The narrator applies this transformation when producing finding narratives, using the finding's `provenance.status` field from the existing FindingsLedger.

**Upgrade explanation (embedded in narrator):**

When `contract.stronger_host_guidance` exists or when the current route is not the strongest available, the narrator produces an upgrade block:

```javascript
{
  before: "Diff-only review — pattern matching without repository context",
  now: "Full repository access",
  unlocks: "Verify call sites, check related tests, inspect dependency graph"
}
```

**Implementation rules:**
- Pure function — no side effects, no I/O
- Takes only existing types: `PortableTaskObject`, `EffectiveExecutionContract`, `FindingsLedgerEntry[]`
- Returns structured output that any surface (MCP, dashboard, CLI, skill) can render
- Templates imported from separate module for self-improvement mutability
- All narration points tested with fixture tasks covering each route and provenance state

**Tests (minimum):**
- `onStart` produces correct headline, strength, and upgrade for each of the 4 routes
- `onResume` with route upgrade shows correct before/after strength and finding evolution
- `onResume` without upgrade shows progress without upgrade block
- `onFindingEvolved` produces correct narrative prefix for each provenance transition
- `onUpgradeAvailable` describes what becomes possible
- Strength labels are correct for all 4 routes
- Narrator returns valid structured output (not just strings)

### Slice 2 — Momentum Observer

**Files:**
- `runtime/lib/momentum-observer.mjs` — observation recording
- `scripts/build/test/momentum-observer.test.mjs` — tests

**What it does:**

Records what the narrator produced and how the user responded. Extends the existing `ProgressEventPipeline` with two new event types. No new storage system — uses the same append-only event store.

**Two new progress event types:**

```javascript
// Type: narration_shown
{
  taskId,
  eventId: "evt_{version}_narration_{point}",
  type: "narration_shown",
  message: "Narration shown: onResume",
  createdAt: now,
  metadata: {
    narration_point: "onResume",       // onStart | onResume | onFindingEvolved | onUpgradeAvailable | onShelfView
    template_version: "1.0.0",         // tracks which template produced this
    narration_output: { /* full narrator output */ },
    route_at_narration: "pasted_diff",
    findings_count_at_narration: 2,
  }
}

// Type: user_response
{
  taskId,
  eventId: "evt_{version}_user_response_{point}",
  type: "user_response",
  message: "User responded to narration: engaged",
  createdAt: now,
  metadata: {
    narration_event_id: "evt_3_narration_onResume",  // links to the narration
    response_type: "engaged",           // engaged | ignored | follow_up | changed_course | accepted_upgrade | declined_upgrade
    time_to_action_ms: 4200,            // time between narration and user action
    follow_up_text: null,               // if response_type is follow_up, what they said
  }
}
```

**Observer API:**

```javascript
// Record a narration being shown to the user
observer.recordNarration({ taskId, narrationPoint, templateVersion, narratorOutput, taskSnapshot })

// Record the user's response to a narration
observer.recordResponse({ taskId, narrationEventId, responseType, timeToActionMs, followUpText })

// Query observation pairs for analysis
observer.getObservationPairs({ taskId })  // returns [{ narration, response }]
observer.getRecentObservations({ since, limit })  // for the reflector
```

**Implementation rules:**
- Uses existing `ProgressEventStore.append()` — no new storage
- Validates event metadata shape before appending
- Observation pairs are linked by `narration_event_id` reference
- `time_to_action_ms` is computed by the caller (the integration layer), not the observer

**Tests (minimum):**
- Recording a narration event produces valid ProgressEvent with correct type and metadata
- Recording a response event links correctly to its narration event
- `getObservationPairs` returns matched narration+response pairs
- `getRecentObservations` filters by time window
- Invalid response types are rejected
- Duplicate event IDs are rejected (existing pipeline behavior)

### Slice 3 — Journey Integration

**Files:**
- `runtime/lib/review-repository-journey.mjs` — modify existing functions
- `scripts/build/test/review-repository-journey.test.mjs` — extend existing tests

**What it does:**

Wires the narrator and observer into the existing `review_repository` journey. This is where narration reaches the user. The journey functions return narrator output alongside their existing return values.

**Changes to `startReviewRepositoryTask()`:**

```javascript
// Current return:
return { task, effective_execution_contract };

// New return:
return { task, effective_execution_contract, narration };
// where narration = narrator.onStart(task, effective_execution_contract)
```

The narrator is injected as an optional dependency (default: the real narrator). When omitted, `narration` is `null` — preserving backward compatibility with all existing tests and consumers.

**Changes to `resumeReviewRepositoryTask()`:**

```javascript
// Current return:
return { task, effective_execution_contract, upgraded };

// New return:
return { task, effective_execution_contract, upgraded, narration };
// where narration = narrator.onResume(task, effective_execution_contract, previousContract)
// If upgraded: narration includes upgrade explanation and finding evolution narratives
```

**Changes to `buildTaskReadinessView()`:**

Add optional `narration` field to the readiness view when a narrator is provided:

```javascript
return {
  // ... existing fields ...
  narration: narrator ? narrator.onUpgradeAvailable(task, contract, strongerContract) : undefined,
};
```

**Observer integration:**

After producing narration, the journey emits a `narration_shown` event via the observer. The observer is also injected as an optional dependency.

**Implementation rules:**
- Narrator and observer are optional constructor/parameter injections
- All existing tests pass without modification (narrator defaults to null)
- New tests verify narration output shape when narrator is provided
- No changes to task lifecycle, state transitions, or findings provenance — those are settled

**Tests (minimum):**
- `startReviewRepositoryTask` returns narration when narrator is injected
- `startReviewRepositoryTask` returns `narration: null` when narrator is not injected (backward compat)
- `resumeReviewRepositoryTask` with upgrade returns narration with upgrade explanation
- `resumeReviewRepositoryTask` without upgrade returns narration without upgrade block
- Narration event is emitted to observer when observer is injected
- Existing journey tests still pass without changes

### Slice 4 — Momentum Shelf

**Files:**
- `runtime/lib/momentum-shelf.mjs` — shelf ranking engine
- `scripts/build/test/momentum-shelf.test.mjs` — tests

**What it does:**

Given a list of tasks and the current environment's capabilities, produces a ranked list of tasks ordered by continuation value. The shelf answers: "What should I continue next, given what this environment can do?"

**Shelf API:**

```javascript
buildMomentumShelf({ tasks, currentCapabilities, narrator })
// Returns:
[
  {
    task_id: "task_abc",
    rank: 1,
    headline: "Repository review — 2 findings ready for full verification",
    continuation_reason: "Full repository access unlocks verification of 2 earlier findings",
    environment_fit: "strong",     // "strong" | "neutral" | "weak"
    findings_pending_verification: 2,
    route_upgrade_available: true,
    current_route: "pasted_diff",
    best_route: "local_repo",
  },
  // ...
]
```

**Ranking factors (ordered by weight):**

1. **Environment fit** — tasks that would upgrade to a stronger route in the current environment rank highest. A task stuck on `pasted_diff` when `local_repo` is available has high continuation value.
2. **Findings awaiting verification** — tasks with `hypothesis` or `reused` findings that would transition to `verified` on route upgrade rank higher.
3. **Recency** — more recently active tasks rank higher when other factors are equal.
4. **Progress** — tasks closer to completion (higher `completed_steps / total_steps`) rank higher when other factors are equal.

**Environment fit classification:**

| Scenario | Fit |
|----------|-----|
| Current environment supports a stronger route than the task's current route | `strong` |
| Current environment supports the same route | `neutral` |
| Current environment supports only a weaker route | `weak` |

**Implementation rules:**
- Pure function — no side effects
- Uses `buildEffectiveExecutionContract` to determine what route each task would get in the current environment
- Uses narrator to produce `headline` and `continuation_reason` for each shelf entry (calls `narrator.onShelfView`)
- Tasks in `completed` or `failed` state are excluded
- Empty task list returns empty shelf

**Tests (minimum):**
- Task with route upgrade available in current environment ranks above task without
- Task with more unverified findings ranks above task with fewer (same environment fit)
- Completed/failed tasks are excluded
- Empty input returns empty output
- Shelf entries have correct environment_fit classification
- Narrator is called to produce headline/continuation_reason

### Slice 5 — Intent Lexicon

**Files:**
- `runtime/lib/intent-lexicon.mjs` — intent resolution engine
- `runtime/lib/intent-lexicon-definitions.mjs` — intent definitions (mutable data)
- `scripts/build/test/intent-lexicon.test.mjs` — tests

**What it does:**

Resolves natural language user phrases into structured task outcomes. The same request resolves reliably everywhere — web, CLI, IDE. The lexicon is a lookup layer, not NLP. It maps known phrases and patterns to task type + initial parameters.

**Lexicon API:**

```javascript
resolveIntent(phrase)
// Returns: { resolved: true, taskType, routeHints, goal, confidence } or { resolved: false, suggestions[] }

// Examples:
resolveIntent("review this repository")
// → { resolved: true, taskType: "review_repository", routeHints: {}, goal: "Review repository", confidence: 1.0 }

resolveIntent("review this PR")
// → { resolved: true, taskType: "review_repository", routeHints: { prefer_route: "github_pr" }, goal: "Review pull request", confidence: 1.0 }

resolveIntent("check this diff")
// → { resolved: true, taskType: "review_repository", routeHints: { prefer_route: "pasted_diff" }, goal: "Review diff", confidence: 0.9 }

resolveIntent("something unknown")
// → { resolved: false, suggestions: [{ phrase: "review this repository", taskType: "review_repository" }] }
```

**Intent definitions (mutable data, not code):**

```javascript
// intent-lexicon-definitions.mjs — the self-improvement loop can modify this
export const definitions = [
  {
    patterns: ["review this repository", "review the repo", "review repo", "audit this repo"],
    taskType: "review_repository",
    routeHints: {},
    goal: "Review repository",
    confidence: 1.0,
  },
  {
    patterns: ["review this PR", "review the pull request", "review PR #*", "check this PR"],
    taskType: "review_repository",
    routeHints: { prefer_route: "github_pr" },
    goal: "Review pull request",
    confidence: 1.0,
  },
  {
    patterns: ["check this diff", "review this diff", "look at this diff"],
    taskType: "review_repository",
    routeHints: { prefer_route: "pasted_diff" },
    goal: "Review diff",
    confidence: 0.9,
  },
  {
    patterns: ["review this bundle", "check this archive", "review uploaded code"],
    taskType: "review_repository",
    routeHints: { prefer_route: "uploaded_bundle" },
    goal: "Review uploaded code bundle",
    confidence: 0.9,
  },
];
```

**Pattern matching:**
- Case-insensitive exact match first
- Wildcard `*` matches any token (for "PR #123" → captures PR number)
- Longest match wins when multiple patterns match
- Unresolved phrases return suggestions based on Levenshtein distance to known patterns
- New task types added by appending to definitions — no code changes required

**Implementation rules:**
- Pure function — no I/O, no side effects
- Definitions imported from separate module for self-improvement mutability
- Pattern matching is deterministic — same input always produces same output
- When `resolved: false`, suggestions are ordered by edit distance to input phrase
- Wildcard captures are returned in `routeHints.captures` (e.g., `{ pr_number: "123" }`)

**Tests (minimum):**
- Each defined pattern resolves to correct taskType and routeHints
- Case-insensitive matching works
- Wildcard patterns capture values correctly
- Unknown phrases return `resolved: false` with suggestions
- Suggestions are ordered by relevance
- Empty/null input returns `resolved: false`
- Multiple definitions for same taskType with different routeHints resolve distinctly

### Slice 6 — Momentum Reflector (Self-Improvement)

**Files:**
- `runtime/lib/momentum-reflector.mjs` — analysis engine
- `shared/skills/momentum-reflect/SKILL.md` — skill definition (enables `/momentum-reflect`)
- `shared/skills/momentum-reflect/prompts/balanced.md` — sonnet prompt
- `scripts/build/test/momentum-reflector.test.mjs` — tests

**What it does:**

Reads observation data (narration+response pairs) and produces improvement insights. Initially report-only — logs what's working and what isn't. Designed so that future iterations can auto-apply template changes.

**Reflector API:**

```javascript
reflect({ observations, currentTemplates, currentDefinitions })
// Returns:
{
  report: {
    period: { from, to },
    total_narrations: 47,
    total_responses: 38,
    engagement_rate: 0.81,
    insights: [
      {
        id: "insight_001",
        type: "template_effectiveness",
        finding: "Resume headlines with finding counts get 3x more engagement than generic progress",
        evidence: { narrations_with_counts: 12, engaged: 10, narrations_without: 15, engaged: 4 },
        suggestion: {
          target: "templates.onResume.headline",
          current: "Continuing your {taskType}",
          proposed: "Continuing your {taskType} — {findingsCount} findings ready",
          confidence: 0.85,
        },
      },
      {
        id: "insight_002",
        type: "intent_coverage",
        finding: "3 unresolved phrases could map to review_repository",
        evidence: { phrases: ["look at my code", "scan this project", "check the codebase"] },
        suggestion: {
          target: "definitions",
          action: "add_patterns",
          patterns: ["look at my code", "scan this project", "check the codebase"],
          taskType: "review_repository",
          confidence: 0.7,
        },
      },
    ],
  },
  applied: [],  // empty in v1 — future: auto-applied changes
}
```

**Analysis capabilities (v1 — report only):**

1. **Template effectiveness** — which narration points get engagement vs. are ignored
2. **Upgrade acceptance rate** — how often users accept upgrade narrations
3. **Finding narrative impact** — do evolved finding narratives drive engagement?
4. **Intent coverage gaps** — unresolved phrases that could map to known task types
5. **Response time patterns** — do certain narrations get faster responses?

**Self-improvement loop via `/loop`:**

```bash
/loop 10m /momentum-reflect
```

Every 10 minutes:
1. Load recent observations (since last reflection)
2. Run `reflect()` to produce insights
3. Log insights as a `system_improvement` progress event
4. (Future v2: apply high-confidence suggestions automatically)

**Skill definition (`SKILL.md` frontmatter):**

```yaml
---
skill: momentum-reflect
description: Analyzes momentum narration effectiveness and proposes improvements.
type: agent
status: experimental
capabilities:
  required: [fs.read]
  optional: [fs.write]
  fallback_mode: prompt-only
version: "1.0.0"
---
```

**Implementation rules:**
- `reflect()` is a pure function — takes data in, returns report out
- The skill wrapper calls `reflect()` and formats the report for the user
- Insights include evidence (observation counts) and confidence scores
- Suggestions with confidence < 0.6 are flagged as "needs human review"
- The reflector never modifies templates directly in v1 — it proposes changes
- All improvement events are logged as progress events so they're themselves observable

**Tests (minimum):**
- Reflector produces insights from mock observation pairs
- Template effectiveness insight is generated when engagement rate differs across narration points
- Intent coverage gap is identified for unresolved phrases
- Empty observations produce empty insights (no crash)
- Insight confidence scores are within [0, 1]
- Reflector does not modify templates (v1 constraint)

### Sprint plan

**Completion update (2026-03-17):** All 6 slices implemented and merged.

- ✓ Slice 1: `runtime/lib/momentum-narrator.mjs` + `runtime/lib/momentum-templates.mjs` — narrator engine with confidence-driven finding evolution and strength labels for all 4 routes
- ✓ Slice 2: `runtime/lib/momentum-observer.mjs` — records `narration_shown` and `user_response` events via existing ProgressEventPipeline
- ✓ Slice 3: `runtime/lib/review-repository-journey.mjs` updated — narrator and observer injected as optional dependencies; `startReviewRepositoryTask` and `resumeReviewRepositoryTask` return narration; full backward compatibility preserved
- ✓ Slice 4: `runtime/lib/momentum-shelf.mjs` — ranks tasks by environment-aware continuation value (environment fit, pending findings, recency, progress)
- ✓ Slice 5: `runtime/lib/intent-lexicon.mjs` + `runtime/lib/intent-lexicon-definitions.mjs` — resolves natural language phrases to task types with wildcard matching and Levenshtein suggestions
- ✓ Slice 6: `runtime/lib/momentum-reflector.mjs` + `shared/skills/momentum-reflect/SKILL.md` — produces improvement insights from observation data; `/momentum-reflect` skill invocable via `/loop`

Additional implementation (2026-03-17):
- ✓ `runtime/lib/task-control-plane-service-worker.mjs` — Worker-compatible task control plane service (parallel to existing `task-control-plane-service.mjs`)
- ✓ `shared/contracts/schemas/v1/narration-output.schema.json` — JSON Schema for narrator output
- ✓ `shared/contracts/schemas/v1/shelf-entry.schema.json` — JSON Schema for shelf entries
- ✓ `shared/contracts/schemas/v1/progress-event.schema.json` — extended progress event schema covering new event types
- ✓ MCP handler updates in `runtime/mcp/handlers.mjs` and tool definitions in `runtime/mcp/tool-definitions.mjs` — exposes narrator, shelf, and lexicon operations as MCP tools
- ✓ `runtime/lib/momentum-engine.mjs` — top-level façade wiring narrator, observer, shelf, and lexicon
- ✓ New test suites in `scripts/build/test/`: `momentum-narrator.test.mjs`, `momentum-observer.test.mjs`, `momentum-shelf.test.mjs`, `intent-lexicon.test.mjs`, `momentum-reflector.test.mjs`, `momentum-engine.test.mjs` (6 files)

**Slice execution order (reference):**

| Order | Slice | Depends on | Status |
|-------|-------|------------|--------|
| 1 | Narrator (Slice 1) | Existing MVA substrate | ✓ Done |
| 2 | Observer (Slice 2) | Existing ProgressEventPipeline | ✓ Done |
| 3 | Integration (Slice 3) | Slices 1 + 2 | ✓ Done |
| 4 | Shelf (Slice 4) | Slice 1 (narrator) | ✓ Done |
| 5 | Lexicon (Slice 5) | None (independent) | ✓ Done |
| 6 | Reflector (Slice 6) | Slices 1 + 2 | ✓ Done |

### Definition of done

- Narrator produces correct prose for all 4 routes at start, resume, upgrade, and finding evolution points
- Observer records narration+response pairs via existing ProgressEventPipeline
- `startReviewRepositoryTask` and `resumeReviewRepositoryTask` return narration output
- Existing journey tests pass without modification (backward compatibility)
- Shelf ranks tasks by environment-aware continuation value
- Intent lexicon resolves known phrases to task types and returns suggestions for unknown phrases
- Reflector produces improvement insights from observation data
- `/momentum-reflect` skill is defined and can be invoked via `/loop`
- All new modules are pure functions with no I/O side effects (except observer which uses existing event store)
- All new modules have tests covering success paths, edge cases, and backward compatibility

### Key success metrics

| KPI | Target | When |
|---|---|---|
| Narrator coverage (all journey points produce prose) | 100% | Slice 3 complete |
| Observer event capture rate | 100% of narrations recorded | Slice 3 complete |
| Shelf ranking correctness (fixture scenarios) | >= 95% | Slice 4 complete |
| Intent resolution accuracy (known phrases) | 100% | Slice 5 complete |
| Reflector insight generation (from mock data) | >= 3 insight types | Slice 6 complete |
| Backward compatibility (existing tests pass) | 100% | All slices |
| Template mutability (reflector can propose changes) | Demonstrated | Slice 6 complete |

### Risk register

| Risk | Mitigation |
|---|---|
| Narrator templates feel generic/robotic | Handcraft initial templates with real task scenarios; reflector improves over time |
| Observer adds overhead to hot path | Observer is append-only to existing store; no new I/O system |
| Self-improvement loop modifies templates unsafely | v1 is report-only; auto-apply gated behind confidence threshold in v2 |
| Shelf ranking is meaningless with one task type | Design ranking factors to generalize; prove with fixture scenarios using mock task types |
| Intent lexicon is too rigid without NLP | Start with exact+wildcard matching; reflector identifies coverage gaps; expand patterns over time |

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
| Codex hook parallel implementation | `.claude/settings.json` hooks (skill-usage, tool-inefficiency logging) are Claude Code-only. `codex-desktop` declares hook support (vendor-verified) but no equivalent hook wiring exists yet; `codex` CLI excludes hooks in v0.5.2. Implement once Codex Desktop hook surface is documented: wire `log-skill-usage.sh` and `log-tool-inefficiencies.sh` equivalents via Codex's lifecycle mechanism (likely `AGENTS.md` instructions or a Codex-native hook config). Acceptance: skill-usage analytics parity between Claude Code and Codex Desktop surfaces. |

---

## Acceptance criteria

### Operational validation evidence note (2026-03-24)

Evidence artifacts captured from command runs (UTC ISO date):
- `artifacts/evidence/2026-03-24/build-compile.log`
- `artifacts/evidence/2026-03-24/env-a-claude.log`
- `artifacts/evidence/2026-03-24/env-b-codex.log`
- `artifacts/evidence/2026-03-24/cross-device-sync.log`
- `artifacts/evidence/2026-03-24/claude-plugin-validate.log`
- `artifacts/evidence/2026-03-24/pre-pr-mergeability-gate.log`

- [ ] Marketplace add + `core-skills` install (Claude Code surface)
  - [x] Local emitted `core-skills` package built successfully (`node scripts/build/compile.mjs`).
  - [ ] Real Claude Code marketplace add/install flow blocked in this run (no `claude` binary and no interactive Claude Code UI in runner).
  - Blocker owner: Platform/Ops (provide interactive Claude Code-capable device + auth token).
- [x] Installed skill exposure verified on at least two real environments
  - [x] Environment A (`claude-code` package): `extract` materialized 34 skills into local cache.
  - [x] Environment B (`codex` package): `extract` + `install` wrote `~/.codex/AGENTS.md`; skill names verified in installed file (`list-available-skills`, `task-start`).
- [ ] Cross-device sync: push from device A, restart on device B, verify sync
  - [x] Push/pull sync verified using distinct device A/B clones against a bare remote; marker committed on A appeared on B.
  - [ ] Post-sync “restart on device B” full re-materialization failed in fresh clone because build dependencies were absent (`ERR_MODULE_NOT_FOUND: yaml` during compile), so end-to-end restart validation remains incomplete.
  - Blocker owner: Developer Experience/Build (ensure dependency bootstrap on fresh device before restart validation).
- [x] `adapters/claude/dev-test.sh` runs clean
- [x] CI validates plugin structure and symlink integrity on every push
- [x] `ops/new-skill.sh <name>` creates skill, symlink, and bumps version
- [x] `CLAUDE.md` is loaded when opening the repo in Claude Code
- [ ] Codex can read `shared/manifest.md` and reference skill files (not tested yet)
- [x] No secrets in tracked files
- [x] Delivery contract: 28 tests protecting dist/ artifacts
- [x] Portability contract: 76 tests protecting materialisation
- [x] All 26 skills have structured capability contracts
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
- [x] Portable task persistence: KV-backed TaskStore (`runtime/lib/task-store-kv.mjs`) for cross-environment continuity
- [x] Codex emitter: `scripts/build/lib/emit-codex.mjs` and `adapters/codex/materialise.sh`
- [x] Dashboard: Tasks tab and nested Task Detail view shipped (`dashboard/src/tabs/HubTab.jsx`, `TaskDetailTab.jsx`)
- [x] Session-start hook: queries Worker KV for active tasks to surface resume opportunities
- [x] Momentum Engine (Phase 10 milestone): narrator, observer, shelf, intent lexicon, and reflector — all 6 slices complete
- [x] `momentum-reflect` skill: enables `/momentum-reflect` and `/loop 10m /momentum-reflect` self-improvement workflow
- [x] Modularity/cohesion refactoring (2026-03-23): 5 SRP/DRY/DIP violations resolved across runtime, Worker, build, and dashboard layers; 63 new tests added

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

Three-tier config (global, machine, project) with field-level merge for MCPs. Tool registry (claude-code, cursor, codex) with adapter abstraction. Adapter layer: MCP, CLI, file adapters. Sync engine with manifest state tracking and dry-run. MCP server exposing runtime operations as Claude Code tools. React dashboard with 8 top-level tabs (Tasks, Tools, Skills, Context Cost, Config, Audit, Analytics, Bootstrap Runs) plus nested Task Detail in Tasks. Updated session-start hook. Ops tools: runtime-status.sh, validate-registry.sh. CI integration.
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

<details>
<summary>Phase 10: KV persistence + Momentum Engine (milestone)</summary>

**Branch:** merged to main 2026-03-17

**KV persistence:**
- `runtime/lib/task-store-kv.mjs` — portable task persistence via Cloudflare KV; tasks survive across sessions and environments
- `runtime/lib/task-store-worker.mjs` — thin Worker-side adapter over the KV store
- `runtime/lib/task-control-plane-service-worker.mjs` — Worker-compatible service layer (parallel to existing `task-control-plane-service.mjs`)
- `worker/src/task-runtime.ts` — Worker task runtime wiring KV into the control plane
- 3 new skills: `task-start`, `task-save`, `task-resume` — user-facing MCP skills for task lifecycle management
- Dashboard Tasks tab (`dashboard/src/tabs/HubTab.jsx`): active task list with shelf ranking
- Dashboard Task Detail nested view (`dashboard/src/tabs/TaskDetailTab.jsx`): task state, findings, route history
- ResumeSheet component (`dashboard/src/components/ResumeSheet.jsx`): surfaces continuable tasks at session start
- Session-start hook enhanced: queries `GET /v1/tasks?status=active&limit=1&updated_within=86400` on session start; presents resume prompt when active task found
- Codex emitter (`scripts/build/lib/emit-codex.mjs`) and materialise adapter (`adapters/codex/materialise.sh`)

**Momentum Engine:**
- Slice 1: `runtime/lib/momentum-narrator.mjs` + `runtime/lib/momentum-templates.mjs`
- Slice 2: `runtime/lib/momentum-observer.mjs` — extends ProgressEventPipeline with `narration_shown` + `user_response` event types
- Slice 3: `review-repository-journey.mjs` updated with optional narrator/observer injection
- Slice 4: `runtime/lib/momentum-shelf.mjs` — environment-aware task ranking
- Slice 5: `runtime/lib/intent-lexicon.mjs` + `runtime/lib/intent-lexicon-definitions.mjs` — phrase-to-task resolver
- Slice 6: `runtime/lib/momentum-reflector.mjs` + `shared/skills/momentum-reflect/SKILL.md`
- Additional façade: `runtime/lib/momentum-engine.mjs` — top-level wiring of narrator, observer, shelf, and lexicon
- New schemas in `shared/contracts/schemas/v1/`: `narration-output.schema.json`, `shelf-entry.schema.json`, `progress-event.schema.json` (extended)
- New test suites in `scripts/build/test/`: 6 files covering all engine modules (narrator, observer, shelf, reflector, engine, intent-lexicon)
- Total skills: 26 (up from 22)
</details>

---

## Platform maturity

| Platform | Compiler | Worker | Runtime sync | Status |
|----------|----------|--------|-------------|--------|
| Claude Code | Full emitter | Serves latest bundle | Full desired-state sync | **Production** |
| Cursor | Emits rules | Not served | No runtime adapter | **Partial** |
| Codex | Emits Codex package | Not served | `adapters/codex/materialise.sh` | **Partial** |
| claude-web, claude-ios | Capability model loaded | Not served | No adapter | **Model only** |

---

## Surface-Aware Skill Discovery — branch `claude/list-available-skills-NSuJq`

**Goal:** Claude presents only skills that work on the current surface. Detection is automatic at every session start and re-runs when the device changes. No user configuration required.

**Design principles (KISS):**
- Use existing compiled registry + existing probe output — no new runtime services
- Each atom is independently committable and independently testable
- Probe stays bash; filtering logic lives in the skill prompt itself
- No new Worker endpoints; no schema changes unless essential
- Tests are written before implementation (red → green → commit)

**New surfaces discovered in documentation research (2026-03-18):**

| Surface | Detection signal | Runtime detectable? | Capability profile |
|---|---|---|---|
| `claude-desktop` | No unique env var yet; spawns local CLI | No (compile-time only) | + preview.server, + connectors |
| `claude-vscode` | `VSCODE_INJECTION` or `VSCODE_IPC_HOOK_CLI` | Yes | same as claude-code + IDE diff |
| `claude-jetbrains` | `IDEA_HOME` or `JETBRAINS_TOOLBOX_TOOL_NAME` | Yes | same as claude-vscode |
| `github-actions` | `GITHUB_ACTIONS=true` | Yes | headless CI; no user interaction |
| `gitlab-ci` | `GITLAB_CI=true` | Yes | headless CI; `AI_FLOW_*` context vars |
| `claude-ssh` | `SSH_CONNECTION` set; no `CLAUDE_CODE_REMOTE` | Yes | shell access; no local UI |
| `codex-cli` | `$CODEX_SURFACE=cli` (Codex-set env var) | Yes | shell/fs/git; cloud-sandbox |
| `codex-desktop` | `$CODEX_SURFACE=desktop` (Codex-set env var) | Yes | parallel agents; isolated worktrees |
| `chatgpt-web` | `CLAUDE_CODE_ENTRYPOINT=web` (our runtime) | Yes (via Claude entrypoint) | prompt-only; no shell |
| `chatgpt-ios` | `CLAUDE_CODE_ENTRYPOINT=remote_mobile` | Yes (via Claude entrypoint) | prompt-only; no shell |

`claude-ssh` stays distinct from `claude-code-remote` because plain SSH only proves a generic remote shell session, while `claude-code-remote` should win whenever `CLAUDE_CODE_REMOTE` is present and can safely imply Claude-managed remote runtime semantics.

**Web/mobile fundamental limitation (confirmed by Codex/ChatGPT docs):**
ChatGPT web, iOS, and Android code execution environments are intentionally surface-agnostic — they expose no `$CODEX_SURFACE`, `$VSCODE_*`, or equivalent env var to user code. Surface detection for these is only possible via entrypoint signals set by the Claude/Codex _runtime_ (not user code), or via compile-time package selection. The probe correctly relies on `CLAUDE_CODE_ENTRYPOINT` (runtime-set) for these surfaces. Skill filtering for web/mobile falls back to the compiled `compatible_platforms[]` list in the registry, not runtime probe results.

**Probe already captures:** `platform_hint`, `surface_hint`, `hostname`, all capability results. Session-start hook already runs the probe in remote sessions. Registry already has per-platform capability definitions embedded.

**Progress snapshot (2026-03-21):**
- [x] Requested five platform YAMLs are complete.
- [x] Deterministic runtime detection is complete for the supported runtime-detectable platforms.
- [ ] SSH parity is **not** complete yet; keep it pending until the registry/emitter story exists.

**What's missing (the 5 atoms):**

---

### Atom A — New platform YAML definitions

**What:** Add 5 platform YAML files to `shared/targets/platforms/`. Identical schema to existing files.

**Platforms to add:**
- `github-actions.yaml` — surface: `ci-pipeline`; shell/fs/git/network supported; mcp.client unsupported; detection: `GITHUB_ACTIONS=true`
- `gitlab-ci.yaml` — surface: `ci-pipeline`; same as github-actions; detection: `GITLAB_CI=true`
- `claude-vscode.yaml` — surface: `desktop-ide`; same as claude-code; mcp medium-confidence; detection: `VSCODE_INJECTION`
- `claude-desktop.yaml` — surface: `desktop-app`; same as claude-code; detection: compile-time only (no unique env var); add `preview.server` as an `unknown`-status capability
- `codex-desktop.yaml` — surface: `desktop-app`; shell/fs/git supported; parallel agents noted; detection: `CODEX_SURFACE=desktop`

**Note on `codex` vs `codex-desktop`:** The existing `codex.yaml` (surface: `cloud-sandbox`) maps to `CODEX_CLI` env var — which is the CLI/cloud path. `codex-desktop.yaml` is the Codex Desktop App (Windows/macOS) where `$CODEX_SURFACE=desktop` is set by Codex. These are different surfaces with different capability profiles.

**Test first (red):** The delivery-contract suite (`scripts/build/test/delivery-contract.test.mjs`) already checks that all platform definitions used in the registry are valid. Add assertions:
```js
// In delivery-contract.test.mjs (add 5 new assertions)
assert(platforms.includes('github-actions'),  'github-actions platform must exist')
assert(platforms.includes('gitlab-ci'),        'gitlab-ci platform must exist')
assert(platforms.includes('claude-vscode'),    'claude-vscode platform must exist')
assert(platforms.includes('claude-desktop'),   'claude-desktop platform must exist')
assert(platforms.includes('codex-desktop'),    'codex-desktop platform must exist')
```

**Implement:** Create each YAML file. Compiler picks them up automatically. Run `node scripts/build/compile.mjs`.

**Verify (green):** `npm test -- scripts/build/test/delivery-contract.test.mjs` passes.

**Commit:** `feat: add platform definitions for vscode, desktop, github-actions, gitlab-ci, codex-desktop`

---

### Atom B — Probe detects CI and IDE surfaces

**What:** Extend `detect_platform()` and `detect_surface()` in `ops/capability-probe.sh` with 5 new signals. Check CI env vars before falling back to `claude-code`.

**Priority order matters.** More-specific signals must come before generic ones. `CODEX_SURFACE` (set by Codex runtime) is the most authoritative Codex signal; `CLAUDE_CODE_ENTRYPOINT` (set by Claude runtime) is the most authoritative Claude signal. Both must be checked before any generic env var heuristics.

**Signals to add (in priority order, inserted before the existing `CLAUDE_CODE_REMOTE` check):**
```bash
# Codex Desktop App — Codex runtime sets $CODEX_SURFACE explicitly
case "${CODEX_SURFACE:-}" in
  desktop) echo "codex-desktop"; return ;;
  cli)     echo "codex";         return ;;  # overrides existing CODEX_CLI heuristic
esac

# CI surfaces — most specific signals, check first
if [ "${GITHUB_ACTIONS:-}" = "true" ]; then echo "github-actions"; return; fi
if [ "${GITLAB_CI:-}" = "true" ];      then echo "gitlab-ci";      return; fi
if [ "${CI:-}" = "true" ];             then echo "ci-generic";      return; fi

# IDE surfaces (checked after CI to avoid misidentifying CI runners with IDE vars)
if [ -n "${VSCODE_INJECTION:-}" ] || [ -n "${VSCODE_IPC_HOOK_CLI:-}" ]; then
  echo "claude-vscode"; return
fi
if [ -n "${IDEA_HOME:-}" ] || [ -n "${JETBRAINS_TOOLBOX_TOOL_NAME:-}" ]; then
  echo "claude-jetbrains"; return
fi

# SSH sessions (checked last among heuristics — broadest signal)
if [ -n "${SSH_CONNECTION:-}" ] && [ -z "${CLAUDE_CODE_REMOTE:-}" ]; then
  echo "claude-ssh"; return
fi
```

**Surface mappings to add to `detect_surface()`:**
```bash
codex-desktop)    echo "desktop-app" ;;
github-actions)   echo "ci-pipeline" ;;
gitlab-ci)        echo "ci-pipeline" ;;
ci-generic)       echo "ci-pipeline" ;;
claude-vscode)    echo "desktop-ide" ;;
claude-jetbrains) echo "desktop-ide" ;;
claude-ssh)       echo "remote-shell" ;;
```

**Test first (red):** New Node.js test `scripts/build/test/capability-probe-detection.test.mjs`:
```js
// Runs probe with injected env vars; asserts platform_hint + surface_hint
// Shell-based; skipped in Windows CI (follow CI pitfall rules from CLAUDE.md)
const probeWith = (env) => JSON.parse(
  execFileSync('bash', ['ops/capability-probe.sh', '--quiet'],
    { env: { ...minimalEnv, ...env }, encoding: 'utf8' })
);
assert.equal(probeWith({ CODEX_SURFACE: 'desktop' }).platform_hint,  'codex-desktop');
assert.equal(probeWith({ CODEX_SURFACE: 'desktop' }).surface_hint,   'desktop-app');
assert.equal(probeWith({ CODEX_SURFACE: 'cli' }).platform_hint,      'codex');
assert.equal(probeWith({ GITHUB_ACTIONS: 'true' }).platform_hint,    'github-actions');
assert.equal(probeWith({ GITHUB_ACTIONS: 'true' }).surface_hint,     'ci-pipeline');
assert.equal(probeWith({ GITLAB_CI: 'true' }).platform_hint,         'gitlab-ci');
assert.equal(probeWith({ VSCODE_INJECTION: '1' }).platform_hint,     'claude-vscode');
assert.equal(probeWith({ VSCODE_INJECTION: '1' }).surface_hint,      'desktop-ide');
// Web/mobile: controlled by CLAUDE_CODE_ENTRYPOINT (already tested in existing probe tests)
```

**Note on web/mobile:** ChatGPT web, iOS, Android — no user-discoverable env var exists. Detection for these surfaces relies entirely on `CLAUDE_CODE_ENTRYPOINT` (already handled by existing `detect_platform()` logic). No new probe logic needed; skill filtering for these surfaces uses compile-time `compatible_platforms[]` from the registry.

**Verify (green):** New test passes; existing probe tests unaffected.

**Commit:** `feat: probe detects Codex Desktop, CI pipelines, VS Code, JetBrains, SSH`

---

### Atom C — Probe runs on every session start; re-runs on device change

**What:** Two changes to `.claude/hooks/session-start.sh`:
1. Move `bash ops/capability-probe.sh --quiet` out of the `if CLAUDE_CODE_REMOTE` block — run it unconditionally
2. Before running the probe, check if the cached report's hostname matches the current hostname; if different (device change), force re-run even if cache is fresh

**Implementation (minimal diff):**
```bash
# After the existing remote-only block, add unconditional probe:
CURRENT_HOSTNAME="$(hostname 2>/dev/null || echo 'unknown')"
CACHED_HOSTNAME="$(python3 -c "import json,sys; d=json.load(open('$HOME/.ai-config-os/probe-report.json')); print(d.get('hostname',''))" 2>/dev/null || echo '')"

if [ "$CURRENT_HOSTNAME" != "$CACHED_HOSTNAME" ] || [ ! -f "$HOME/.ai-config-os/probe-report.json" ]; then
  echo "[probe] Device changed or no cache — running capability probe..."
  bash ops/capability-probe.sh --quiet
else
  echo "[probe] Same device ($CURRENT_HOSTNAME) — using cached probe"
fi
```

**Test:** This is a shell script; tested locally with `adapters/claude/dev-test.sh`. Document in test file as local-only. For CI: add a smoke-test assertion in `scripts/build/test/adapter-scripts.test.mjs` that the session-start hook file contains the hostname-check pattern.

**Commit:** `feat: session-start always probes; re-probes on device change`

---

### Atom D — Registry emits per-skill capability requirements

**What:** Add a `skills` array to `dist/registry/index.json`. Each entry: `{name, description, capabilities: {required[], optional[]}, compatible_platforms[]}`. This lets the `list-available-skills` skill do runtime filtering without re-parsing SKILL.md files.

**Compiler change (`scripts/build/compile.mjs`):** After resolving compatibility, add skills array to the registry output:
```js
skills: parsedSkills.map(s => ({
  name: s.skill,
  description: s.description,
  type: s.type,
  status: s.status,
  capabilities: s.capabilities ?? { required: [], optional: [] },
  compatible_platforms: compatibilityMatrix[s.skill] ?? [],
}))
```

**Test first (red):** Extend `scripts/build/test/delivery-contract.test.mjs`:
```js
assert(Array.isArray(index.skills), 'registry must have skills array')
assert(index.skills.length > 0, 'skills array must not be empty')
const firstSkill = index.skills[0];
assert(firstSkill.name, 'skill must have name');
assert(firstSkill.capabilities, 'skill must have capabilities');
assert(Array.isArray(firstSkill.capabilities.required), 'capabilities.required must be array');
```

**Verify (green):** `npm test -- scripts/build/test/delivery-contract.test.mjs` passes.

**Commit:** `feat: registry emits per-skill capability requirements for runtime filtering`

---

### Atom E — `list-available-skills` skill

**What:** Create `shared/skills/list-available-skills/SKILL.md`. This is a prompt-type skill that:
1. Reads `~/.ai-config-os/probe-report.json` (cached probe)
2. Reads the cached manifest at `~/.ai-config-os/cache/claude-code/latest.json`
3. Filters skills: `compatible` (all required caps supported), `degraded` (some optional caps missing), `unavailable` (required cap unsupported), `ci-only` (headless skills in CI surface)
4. Presents a clean, grouped list with surface context at the top

**Key surface-aware groupings:**
- `ci-pipeline` surface: suppress interactive skills (`context-budget`, `momentum-reflect`, `plugin-setup`, `memory`); surface CI-appropriate skills first (`code-review`, `commit-conventions`, `changelog`, `pr-description`)
- `mobile-app` / `web-app`: suppress shell-dependent skills; surface prompt-only skills
- `desktop-cli` / `desktop-ide` / `desktop-app`: show all compatible skills

**Frontmatter skeleton:**
```yaml
---
skill: list-available-skills
description: List skills available on the current surface, filtered by detected runtime capabilities.
type: prompt
status: stable
capabilities:
  required: [fs.read, env.read]
  optional: [shell.exec]
  fallback_mode: prompt-only
  fallback_notes: "Without shell.exec, probe data may be stale"
variants:
  sonnet:
    prompt_file: prompts/default.md
    description: Standard skill listing
    cost_factor: 1.0
    latency_baseline_ms: 300
  haiku:
    prompt_file: prompts/brief.md
    description: Compact listing
    cost_factor: 0.3
    latency_baseline_ms: 150
  fallback_chain: [sonnet, haiku]
version: "1.0.0"
---
```

**Test first (red):** Delivery-contract checks new skill exists and has required frontmatter. Then structure-check test confirms prompts/ files exist.

**Verify (green):** `npm test` passes. `node scripts/build/compile.mjs` emits the new skill to `dist/clients/claude-code/`.

**Commit:** `feat: add list-available-skills skill with surface-aware capability filtering`

---

### Atom F — Compile, full test suite, push

```bash
node scripts/build/compile.mjs
npm test
git push -u origin claude/list-available-skills-NSuJq
```

All 70+ tests pass. The new skill is in `dist/`. The probe correctly identifies 11 surfaces. Session start always probes and re-probes on device change.

---

### Acceptance criteria

| Check | How to verify |
|---|---|
| Probe detects `github-actions` surface | `GITHUB_ACTIONS=true bash ops/capability-probe.sh \| jq .platform_hint` → `"github-actions"` |
| Probe detects `claude-vscode` surface | `VSCODE_INJECTION=1 bash ops/capability-probe.sh \| jq .platform_hint` → `"claude-vscode"` |
| Session-start re-probes on device change | Change `hostname` in cached probe-report.json; confirm hook re-runs probe |
| Registry has skills array | `jq '.skills \| length' dist/registry/index.json` → 27+ |
| `list-available-skills` skill emitted | `ls dist/clients/claude-code/skills/list-available-skills/` |
| CI surface suppresses interactive skills | Read `list-available-skills` prompt: confirm CI-mode logic present |
| Full test suite passes | `npm test` → 0 failures |

---

### Updated platform maturity table

| Platform | Detection signal | Detectable at runtime? | Compiler | Probe | Status |
|---|---|---|---|---|---|
| `claude-code` | `CLAUDE_CODE` env var | Yes | Full emitter | ✓ | Production |
| `cursor` | `CURSOR_SESSION` env var | Yes | Rules emitter | ✓ | Partial |
| `codex` (CLI/cloud) | `CODEX_CLI` env var OR `CODEX_SURFACE=cli` | Yes | Codex emitter | ✓ existing → **Atom B** | Partial |
| `claude-web` | `CLAUDE_CODE_ENTRYPOINT=web` | Via Claude runtime only | Model only | ✓ | Model only |
| `claude-ios` | `CLAUDE_CODE_ENTRYPOINT=remote_mobile` | Via Claude runtime only | Model only | ✓ | Model only |
| `github-actions` | `GITHUB_ACTIONS=true` | Yes | **Atom A** | **Atom B** | Complete |
| `gitlab-ci` | `GITLAB_CI=true` | Yes | **Atom A** | **Atom B** | Complete |
| `claude-vscode` | `VSCODE_INJECTION` or `VSCODE_IPC_HOOK_CLI` | Yes | **Atom A** | **Atom B** | Complete |
| `codex-desktop` | `CODEX_SURFACE=desktop` (Codex-set) | Yes | **Atom A** | **Atom B** | Complete |
| `claude-desktop` | No unique env var (compile-time only) | No — registry filtering only | **Atom A** | n/a | Complete |
| `claude-ssh` | `SSH_CONNECTION` (no `CLAUDE_CODE_REMOTE`) | Yes | future | **Atom B** | Pending registry story |
| `chatgpt-web` | No env var exposed to user code | No — sandboxed | future | n/a | Future |
| `chatgpt-mobile` | No env var exposed to user code | No — sandboxed | future | n/a | Future |
