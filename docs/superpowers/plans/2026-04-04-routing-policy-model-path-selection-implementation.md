# Routing policy plus model-path selection — Implementation Plan

**Status:** Proposed  
**Canonical spec:** [`docs/superpowers/specs/2026-04-04-routing-policy-model-path-selection-design.md`](../specs/2026-04-04-routing-policy-model-path-selection-design.md)  
**Related plan:** [`docs/superpowers/plans/2026-04-03-authoritative-task-command-store-implementation-v2.md`](2026-04-03-authoritative-task-command-store-implementation-v2.md)

> **Execution principle:** Keep route truth, model truth, narrowing, evaluation, and final resolution in separate, boring layers. No scoring engine. No shadow receipt. No runtime-state leakage into static registries.

**Goal:** Land one contract-first routing policy and model-path selection system that produces one canonical `ExecutionSelection`, integrates with the authoritative task-command-store direction, and keeps runtime simple while staying enterprise-shaped.

---

## Architecture summary

**Static truth layers**

- versioned declarative route-profile registry
- versioned declarative model-path registry
- validators for both registries

**Derived truth layers**

- route instance facts
- route narrowing function
- model-path evaluator
- final resolver

**Canonical stamped truth**

- `ExecutionSelection` only when selection is created or replaced
- latest convenience snapshot on task state
- lightweight reference (`selection_revision`, `selection_digest`) only where explicitly allowed

**Non-canonical diagnostics**

- segregated, opt-in `execution_selection_diagnostic_context`
- never copied into `ActionCommit`

---

## File map (create / own)

| Area                    | Create / modify                                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route registry          | Create `runtime/config/route-profiles.*` or equivalent typed module; create validator under `shared/contracts/` or `runtime/lib/`; tests under `scripts/build/test/` or colocated |
| Route facts + narrowing | Create `runtime/lib/route-instance-facts.mjs`; create `runtime/lib/route-capability-narrowing.mjs`; tests for facts and narrowing                                                 |
| Model registry          | Create `runtime/config/model-path-registry.*` or equivalent typed module; create validator; optional data-only template source expanded before validation                         |
| Model evaluator         | Create `runtime/lib/model-path-evaluator.mjs`; tests for admissible frontier and representative ordering                                                                          |
| Final resolver          | Create `runtime/lib/execution-selection-resolver.mjs`; tests for pair-cost derivation, cheapest-valid-pair, tie-breaks, and fallback shaping                                      |
| Canonical identity      | Create `runtime/lib/execution-selection-identity.mjs`; tests for identity projection, digest stability, revision triggers                                                         |
| Task integration        | Modify task service / authoritative store integration points to stamp `ExecutionSelection` and references only where appropriate                                                  |
| Diagnostics             | Create segregated debug or observation sink helpers for `execution_selection_diagnostic_context`; tests for TTL / segregation / default-off behaviour                             |
| Docs and validation     | Create validation scripts or test suites that fail fast on registry drift and contract drift                                                                                      |

---

## Dependency order

**Step 1 → Step 2 → Step 3 → Step 4** are sequential.  
**Step 5** can begin after Steps 2–4 stabilise.  
Do not wire authoritative stamping into task actions until `ExecutionSelection` identity, resolver, and diagnostic boundaries are all green.

---

## Step 1 — Static registries and validators

**Branch:** `feat/routing-policy-step-01-registries`  
**PR title:** `feat(routing-policy): step 1 — route and model registries`

### Goal

Create the two canonical static truth artifacts, each versioned, declarative, expanded, and validated.

### Deliverables

- route-profile registry with canonical nested schema:
  - `identity`
  - `default_capabilities`
  - `static_limits`
  - `static_preferences`
- model-path registry with canonical nested schema:
  - `identity`
  - `compatibility`
  - `policy_classes`
- route and model validators
- data-only template expansion for model registry if needed, expanded before validation

### Checklist

- [ ] **Step 1.1:** Write failing schema-validation tests for the route-profile registry.
- [ ] **Step 1.2:** Write failing schema-validation tests for the model-path registry.
- [ ] **Step 1.3:** Implement declarative route-profile registry with `route_contract_version`.
- [ ] **Step 1.4:** Implement declarative model-path registry with `model_policy_version`.
- [ ] **Step 1.5:** Add data-only template expansion for model registry only if needed; ensure the expanded artifact is what validation consumes.
- [ ] **Step 1.6:** Add validator coverage for enum values, missing fields, forbidden dynamic fields, and template-expansion correctness.
- [ ] **Step 1.7:** Run tests and contract checks.

### Guardrails

- registries stay declarative and boring
- no dynamic conditions in either registry
- no evaluator logic in the registries
- no route-family or model-family live helpers carrying policy meaning

---

## Step 2 — Route instance facts and monotonic narrowing

**Branch:** `feat/routing-policy-step-02-route-facts-narrowing`  
**PR title:** `feat(routing-policy): step 2 — route facts and narrowing`

### Goal

Introduce a clean route-side derivation pipeline:
raw surface input → canonical route instance facts → effective route capabilities.

### Deliverables

- `deriveRouteInstanceFacts(raw_surface_input)`
- `deriveEffectiveRouteCapabilities(route_profile, route_instance_facts)`
- separate validators and tests for both boundaries

### Checklist

- [ ] **Step 2.1:** Write failing contract tests for `route_instance_facts`.
- [ ] **Step 2.2:** Write failing narrowing tests proving only the allowed capability fields can narrow.
- [ ] **Step 2.3:** Implement route-instance-facts derivation with fields:
  - `route_id`
  - `route_kind`
  - `artifact_surface`
  - `history_surface`
  - `repository_binding`
  - `task_shape_evidence`
- [ ] **Step 2.4:** Implement monotonic narrowing of only:
  - `artifact_completeness`
  - `history_availability`
  - `locality_confidence`
  - `verification_ceiling`
  - `allowed_task_classes`
- [ ] **Step 2.5:** Prove that `static_limits` and `static_preferences` are never narrowed.
- [ ] **Step 2.6:** Run tests and gate.

### Guardrails

- facts remain observational
- narrowing never widens
- narrowing never invents new route identity
- route facts and narrowing stay separately validated

---

## Step 3 — Model-path evaluator and bounded admissible frontier

**Branch:** `feat/routing-policy-step-03-model-evaluator`  
**PR title:** `feat(routing-policy): step 3 — model evaluator and admissible frontier`

### Goal

Implement one model-path evaluator that consumes the canonical model registry, policy intent, coarse route compatibility projection, and bounded dynamic overlays, then emits a max-3 admissible frontier.

### Deliverables

- typed evaluator input envelope:
  - `registry_snapshot`
  - `policy_intent`
  - `route_compatibility_projection`
  - `dynamic_runtime_overlays`
- admissible-only bounded frontier
- deterministic representative ordering from the non-dominated set

### Checklist

- [ ] **Step 3.1:** Write failing evaluator tests for admissibility filtering.
- [ ] **Step 3.2:** Write failing tests for non-dominated frontier construction over:
  - `cost_basis`
  - `reliability_margin`
  - `latency_risk`
- [ ] **Step 3.3:** Write failing tests for deterministic representative ordering and hard cap of 3.
- [ ] **Step 3.4:** Implement evaluator with exact route compatibility whitelist:
  - `allowed_execution_modes`
  - `minimum_model_tier`
  - `preferred_model_tier`
- [ ] **Step 3.5:** Ensure no rejected candidates and no prose leave the evaluator.
- [ ] **Step 3.6:** Add tests proving the evaluator does not consume broader route constraints or final pair-cost logic.
- [ ] **Step 3.7:** Run tests and gate.

### Guardrails

- evaluator output stays a resolver input, not a trace
- no hidden numeric mapping of policy classes
- no broad route constraints in evaluator input

---

## Step 4 — Final resolver, pair-cost derivation, and fallback shaping

**Branch:** `feat/routing-policy-step-04-resolver`  
**PR title:** `feat(routing-policy): step 4 — resolver and execution selection`

### Goal

Implement the final join algorithm that selects the cheapest valid route-plus-model pair and derives `ExecutionSelection` plus fallback chain.

### Deliverables

- deterministic pair-cost derivation from fixed tuple
- cheapest-valid-pair logic
- deterministic tie-break rule
- route-preserving fallback by default
- explicit, policy-declared cross-route fallback handling

### Checklist

- [ ] **Step 4.1:** Write failing tests for valid pair formation and hard-constraint elimination.
- [ ] **Step 4.2:** Write failing tests for pair-cost derivation from:
  - model `cost_basis`
  - route `artifact_completeness`
  - route `history_availability`
  - diff-only versus broader route scope
- [ ] **Step 4.3:** Write failing tests for tie-break order:
  - higher evidence depth
  - stronger reliability margin
  - lower latency risk
  - deterministic config order
- [ ] **Step 4.4:** Write failing tests for route-preserving fallback and explicit cross-route fallback visibility.
- [ ] **Step 4.5:** Implement resolver and `ExecutionSelection` shaping.
- [ ] **Step 4.6:** Prove monotonic pair-cost behaviour with respect to route broadness unless a documented exception exists.
- [ ] **Step 4.7:** Run tests and gate.

### Guardrails

- no weighted scoring
- fallback generation happens after primary pair selection
- cross-route fallback stays exceptional and predeclared

---

## Step 5 — ExecutionSelection identity, embedding, and diagnostics

**Branch:** `feat/routing-policy-step-05-selection-identity`  
**PR title:** `feat(routing-policy): step 5 — execution selection identity and diagnostics`

### Goal

Define and wire canonical `ExecutionSelection` identity, embedding points, and non-canonical diagnostic capture.

### Deliverables

- canonical identity projection and digest
- revision-trigger logic
- task-state snapshot shape
- action-ledger embedding rules
- segregated `execution_selection_diagnostic_context`

### Checklist

- [ ] **Step 5.1:** Write failing tests for canonical identity projection and digest stability.
- [ ] **Step 5.2:** Write failing tests for revision triggers when canonical core changes and for no-op changes in derived fields.
- [ ] **Step 5.3:** Implement `selection_revision` + `selection_digest` logic from canonical identity projection only.
- [ ] **Step 5.4:** Wire full `ExecutionSelection` only on create-or-replace actions.
- [ ] **Step 5.5:** Wire latest snapshot into task state as convenience state only.
- [ ] **Step 5.6:** Define an explicit allow-list of actions permitted to carry lightweight references only.
- [ ] **Step 5.7:** Implement segregated, default-off `execution_selection_diagnostic_context` with TTL and explicit capture intent.
- [ ] **Step 5.8:** Run tests and gate.

### Guardrails

- derived fields do not affect identity
- diagnostics are never copied into `ActionCommit`
- diagnostic capture is safe to discard
- lightweight references are allow-list-based, not opportunistic

---

## Step 6 — Versioning, compatibility, and validation artifacts

**Branch:** `feat/routing-policy-step-06-versioning-validation`  
**PR title:** `feat(routing-policy): step 6 — versioning and validation`

### Goal

Make the policy contracts auditable and hard to drift.

### Deliverables

- semantic version bump rules for:
  - `route_contract_version`
  - `model_policy_version`
  - `resolver_version`
  - `execution_selection_schema_version`
- optional non-canonical `policy_release_label`
- validation tests and scripts that fail fast on contract drift

### Checklist

- [ ] **Step 6.1:** Add fixture tests for each semantic version field and bump-trigger scenarios.
- [ ] **Step 6.2:** Add compatibility notes or fixture harness for historical major versions that may remain in data.
- [ ] **Step 6.3:** Add validation checks proving `execution_selection_schema_version` participates in canonical identity.
- [ ] **Step 6.4:** Add contract-drift checks for registry schemas, route facts, narrowing outputs, evaluator outputs, and `ExecutionSelection` identity projection.
- [ ] **Step 6.5:** Wire validation into the standard verification ladder.
- [ ] **Step 6.6:** Run full tests and mergeability gate.

### Guardrails

- semantic versions are not hashes
- optional release labels remain non-canonical
- compatibility notes must be updated on major bumps

---

## Verification ladder (every PR)

1. targeted tests for the changed layer
2. `node scripts/build/compile.mjs` when registry or contract compilation paths are touched
3. `npm test` or equivalent targeted path
4. `bash ops/pre-pr-mergeability-gate.sh`
5. contract-drift checks for touched registry or selection shapes

---

## Acceptance criteria

The work is complete when:

1. route truth is centralised in one declarative registry and one monotonic narrowing flow
2. model truth is centralised in one declarative expanded registry and one bounded evaluator
3. the final resolver chooses the cheapest valid route-plus-model pair with deterministic tie-breaks
4. `ExecutionSelection` is stamped only when created or replaced and remains self-explanatory without diagnostic context
5. diagnostics remain optional, bounded, segregated, and discardable
6. identity, revision, digest, and semantic versions are all deterministic and validated
7. no part of the implementation reintroduces a hidden scoring engine or a shadow receipt model
