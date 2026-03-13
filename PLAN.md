# AI Config OS — Implementation Plan

## Overview

The **control plane for portable AI work**. The task object is the unit of value — not chat, not prompts, not agents. Work starts in any environment (web, mobile, IDE), and the runtime routes it, checkpoints it, and continues it in a stronger environment without the user re-explaining anything.

The existing substrate (Worker endpoints, emitted runtime artefacts, capability profiling, remote executor, dashboard contract panel) is preserved and extended. The new layer adds six core primitives: PortableTaskObject, capability detection integration, deterministic route resolution, EffectiveExecutionContract, structured continuation, and findings provenance.

The first automated workflow is `review_repository`: start in a limited environment, continue in a stronger one, preserve findings with provenance, finish without reconstructing context.

**The product test:** after switching environments, does the runtime feel ready?

Autospec artefacts live at [github.com/thomashillman/autospec](https://github.com/thomashillman/autospec).

Core principle: **own the task lifecycle — routing, continuation, verification, provenance, and cross-environment upgrades**.

---

## Current state — v0.5.4, updated 2026-03-11

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
| Manifest feature flags | Partial | `runtime/manifest.sh` — flags defined + validated; runtime gating NOT wired |

---

## Immediate next actions (before any new work proceeds)

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
- Deterministic RouteResolver using real capability profiles (T006)
- EffectiveExecutionContract engine (T007)
- `review_repository` task type with all four routes (T008)
- PortableTaskObject lifecycle and state transitions (T009)
- FindingsLedger with provenance rules (T010)
- ProgressEvent pipeline (T011)
- ContinuationPackage builder (T012)
- Deliverables: working local task runtime for `review_repository` with persisted state, explicit contracts, visible progress, preserved findings

**Week 3 — handoff, route upgrade, and validation**
- HandoffToken service: task binding, expiry, signature, replay protection (T013)
- Extend Worker control-plane endpoints for task-centric operations (T014)
- Weak-environment start flow (T015)
- Strong-environment resume flow: load existing task → re-evaluate capabilities → upgrade to `local_repo` → preserve findings with provenance (T016)
- Dashboard and API views: task readiness, route history, progress, findings provenance, stronger-route availability (T017)
- Telemetry and audit events (T018)
- Adversarial suite: fake capabilities, replayed tokens, injected repo text, route mismatches, missing task state (T019)
- Staging deployment and release checklist (T020)
- Deliverables: staging-ready MVA — start anywhere, finish where the tools are, never re-explain the task

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
- Worker endpoints load and return real task state
- Contracts computed from actual capabilities and routes
- Continuation packages and handoff tokens are valid, expiring, and replay-safe
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
- [ ] MVA: `review_repository` portable journey proven end-to-end

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
