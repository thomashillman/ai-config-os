# Resource policy execution stack — Implementation Plan

> **For agentic workers:** Use **superpowers:subagent-driven-development** or **superpowers:executing-plans** to run this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **Canonical spec:** [`docs/superpowers/specs/2026-04-01-resource-policy-execution-stack-design.md`](../specs/2026-04-01-resource-policy-execution-stack-design.md).

**Goal:** Land resource policy (contracts, meter, planner, context pack, telemetry, enforcer, integration pilots) as **seven PRs** with minimal merge conflicts and deterministic tests.

**Architecture:** `ExecutionPolicy` + normalized accounting flow from skill `resource_budget` through planner → context pack → execute → meter → enforcer → observations; Atom 7 facade owns bounded replan (§4.2a of spec). Policy tables live in YAML under `runtime/config/`; pricing in versioned config.

**Tech Stack:** Node ESM (`.mjs`), existing runtime layout, Vitest/Node `assert` tests per repo patterns, optional YAML for rules, Cloudflare Worker only where Atom 5/7 touch dashboard routes.

**Dependency order:** **Atom 1 → (Atoms 2–6 parallel) → Atom 7.** Atom 5 before Atom 7 if goldens assert read-model/dashboard fields.

---

## File map (create / own)

| Area         | Create / modify                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts    | `shared/contracts/resource-policy-types.mjs`, optional `schemas/resource-policy-*.json`, `resolveExecutionPolicy` + tests                                           |
| Meter        | `runtime/lib/resource-meter/*.mjs`, `runtime/config/pricing-profile.yaml`, `runtime/lib/adapters/*-provider-signals.mjs`                                            |
| Planner      | `runtime/lib/execution-planner.mjs`, `runtime/config/planner-rules.yaml`                                                                                            |
| Context pack | `runtime/lib/context-pack-builder.mjs`, `runtime/lib/token-estimate.mjs`                                                                                            |
| Telemetry    | `runtime/lib/observation-sources/execution-resource.mjs`, glue in `observation-read-model.mjs`, `dashboard-analytics-contracts.mjs`, dashboard UI, Worker if needed |
| Enforcer     | `runtime/lib/execution-budget-enforcer.mjs`, `runtime/config/degradation-ladders.yaml`                                                                              |
| Integration  | `runtime/lib/execution-policy-compose.mjs`, wire `context_cost`, task control plane, autoresearch path; golden tests                                                |

---

## Atom 1 — Contracts and normalized shapes

**Branch:** `feat/resource-policy-atom-01-contracts`  
**PR title:** `feat(resource-policy): atom 1 — contracts and normalized shapes`

### Task A1: Types and resolver

**Files:**

- Create: `shared/contracts/resource-policy-types.mjs` (JSDoc `@typedef` + `/** @type */` exports or plain objects)
- Create: `scripts/build/test/resource-policy-contracts.test.mjs` (or colocated)
- Modify: only if required: `shared/contracts/resource-budget-normalize.mjs` (surgical)

- [ ] **Step 1:** Read spec §4.2b and §4.3; list final field names for `ExecutionPolicy`, `NormalizedAccountingResult`, `ExecutionObservation` extension.

- [ ] **Step 2:** Write failing tests: `resolveExecutionPolicy({ skillBudget, projectConfig, machineConfig, route })` — at least: route overrides mode for safety; skill defaults; project override key when present.

  Run: `node scripts/build/test/run-tests.mjs scripts/build/test/resource-policy-contracts.test.mjs` (or `npm run test:file --` if available)

  Expected: FAIL (function missing).

- [ ] **Step 3:** Implement minimal `resolveExecutionPolicy` + validators for empty/minimal payloads; export types as JSDoc.

- [ ] **Step 4:** Run tests; expect PASS.

- [ ] **Step 5:** `node scripts/build/compile.mjs` (if compiler touches contracts) and `npm test` or targeted suite.

- [ ] **Step 6:** `bash ops/pre-pr-mergeability-gate.sh`

- [ ] **Step 7:** Commit: `feat(resource-policy): atom 1 — contracts and normalized shapes`

---

## Atom 2 — Resource meter

**Branch:** `feat/resource-policy-atom-02-resource-meter`  
**PR title:** `feat(resource-policy): atom 2 — resource meter adapters`  
**Precondition:** Atom 1 merged to `main`; `git pull` and branch from latest `main`.

### Task A2: Adapters + pricing

**Files:**

- Create: `runtime/lib/resource-meter/index.mjs` (factory)
- Create: `runtime/lib/resource-meter/api-key-adapter.mjs`, `subscription-adapter.mjs`, `hybrid-adapter.mjs`
- Create: `runtime/config/pricing-profile.yaml` (version field)
- Create: `runtime/lib/adapters/*-provider-signals.mjs` (throttle / model-unavailable parsing)
- Create: `scripts/build/test/resource-meter.test.mjs`

- [ ] **Step 1:** Red tests: known tokens × pricing → `estimated_cost_minor`; subscription signals → `pressure_score` increases with throttle/premium.

- [ ] **Step 2:** Implement adapters; load pricing from YAML.

- [ ] **Step 3:** `npm test` (targeted + full if feasible), mergeability gate.

- [ ] **Step 4:** Commit with conventional prefix.

---

## Atom 3 — Execution planner

**Branch:** `feat/resource-policy-atom-03-execution-planner`  
**PR title:** `feat(resource-policy): atom 3 — execution planner`  
**Precondition:** Atom 1 on `main`.

**Files:**

- Create: `runtime/lib/execution-planner.mjs`
- Create: `runtime/config/planner-rules.yaml`
- Create: `scripts/build/test/execution-planner.test.mjs`

- [ ] **Step 1:** Scenario tests: same synthetic task + skill id → three distinct planner outputs for subscription / api_key / hybrid (mock signals).

- [ ] **Step 2:** Implement planner reading rules YAML only (no LLM).

- [ ] **Step 3:** Test + gate + commit.

---

## Atom 4 — Context pack builder

**Branch:** `feat/resource-policy-atom-04-context-pack-builder`  
**PR title:** `feat(resource-policy): atom 4 — context pack builder`  
**Precondition:** Atom 1 on `main`.

**Files:**

- Create: `runtime/lib/token-estimate.mjs`
- Create: `runtime/lib/context-pack-builder.mjs`
- Create: `scripts/build/test/context-pack-builder.test.mjs`

- [ ] **Step 1:** Tests: same large fake task state → different packed size / breakdown for each mode.

- [ ] **Step 2:** Implement builder + breakdown structure.

- [ ] **Step 3:** Test + gate + commit.

---

## Atom 5 — Telemetry and UI

**Branch:** `feat/resource-policy-atom-05-telemetry-ui`  
**PR title:** `feat(resource-policy): atom 5 — telemetry and UI`  
**Precondition:** Atom 1 on `main`.

**Files:**

- Create: `runtime/lib/observation-sources/execution-resource.mjs`
- Modify: `runtime/lib/observation-read-model.mjs` (thin import + call)
- Modify: `runtime/lib/dashboard-analytics-contracts.mjs`, dashboard components as needed
- Modify: Worker dashboard handlers only if API contract requires

- [ ] **Step 1:** Add additive optional fields per spec §4.3; contract tests for dashboard API shape.

- [ ] **Step 2:** Read-model aggregation in helper (not React).

- [ ] **Step 3:** UI: “Resource Use” / mode toggle copy.

- [ ] **Step 4:** `npm test`, dashboard tests if present, gate, commit.

---

## Atom 6 — Budget enforcer

**Branch:** `feat/resource-policy-atom-06-budget-enforcer`  
**PR title:** `feat(resource-policy): atom 6 — budget enforcer`  
**Precondition:** Atom 1 on `main`.

**Files:**

- Create: `runtime/lib/execution-budget-enforcer.mjs`
- Create: `runtime/config/degradation-ladders.yaml`
- Create: `scripts/build/test/execution-budget-enforcer.test.mjs`

- [ ] **Step 1:** Ladder tests per mode: mock meter output → constraint delta or terminal reason.

- [ ] **Step 2:** Implement enforcer (data-driven ladders).

- [ ] **Step 3:** Test + gate + commit.

---

## Atom 7 — Integration and pilots

**Branch:** `feat/resource-policy-atom-07-integration-pilots`  
**PR title:** `feat(resource-policy): atom 7 — integration and pilots`  
**Precondition:** Atoms **1–6** on `main`; prefer Atom **5** merged if goldens need telemetry.

**Pilots (spec §5.7):**

1. `shared/skills/context-budget`, MCP `context_cost`, Worker `runtime.context_cost`, `/v1/skill/context-budget`
2. `runtime/lib/task-control-plane-service*.mjs` journey
3. `shared/skills/autoresearch` (+ Worker analytics if needed)

**Files:**

- Create: `runtime/lib/execution-policy-compose.mjs`
- Modify: minimal wire points only
- Create: golden / integration tests under `scripts/build/test/` or `runtime/**/*.integration.test.mjs`

- [ ] **Step 1:** Facade composes policy + calls 2–6 public APIs.

- [ ] **Step 2:** Wire three pilots; bounded replan `K` default 3.

- [ ] **Step 3:** Golden tests per pilot × three modes (or document deferral of dashboard goldens if Atom 5 late).

- [ ] **Step 4:** Full `npm test`, gate, commit.

---

## Verification ladder (every PR)

1. `node scripts/build/compile.mjs` when skills/registry/dist affected
2. `npm test` (or targeted `run-tests.mjs` paths)
3. `bash ops/pre-pr-mergeability-gate.sh`
4. Conventional Commits: `feat(resource-policy): atom N — …`

---

## Plan review

**Spec:** [`2026-04-01-resource-policy-execution-stack-design.md`](../specs/2026-04-01-resource-policy-execution-stack-design.md) (human-approved)  
Optional: run **plan-document-reviewer** subagent on this file + spec (see writing-plans skill).

---

## Execution handoff

**Option A — Subagent-driven (recommended):** One Task subagent per atom (below); merge Atom 1 before merging 2–6.

**Option B — Inline:** Execute checkboxes in this session with checkpoints after each atom.
