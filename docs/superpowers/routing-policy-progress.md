# Routing Policy Implementation Progress

**Status Date:** 2026-04-04  
**Branch:** `claude/implement-routing-path-selection-WQsVn`  
**Session:** 019qR8WaTcoCEuJZ8fcfkfMz

## Library Implementation Status

### ✅ Complete (Core Library Components)

#### 1. Route Narrowing (CORRECT)

- **Component:** `runtime/lib/route-capability-narrowing.mjs`
- **Status:** COMPLETE - monotonically narrows capabilities based on facts
- **Tests:** 23 passing
- **Contract:** All effective capabilities correctly narrow or preserve, never widen
- **Known issues:** None

#### 2. Model-Path Evaluator (v1 COMPLETE)

- **Component:** `runtime/lib/model-path-evaluator.mjs`
- **Status:** COMPLETE for v1 design
- **Tests:** 29 passing
- **Hard gates implemented:** execution_mode, minimum_model_tier, reliability_floor, availability
- **Frontier selection:** Non-dominated frontier over cost_basis, reliability_margin, latency_risk
- **Known limitation:** See "Policy Intent Fields - v1 Unused" section below

#### 3. Execution Selection Resolver (CORRECT)

- **Component:** `runtime/lib/execution-selection-resolver.mjs`
- **Status:** COMPLETE
- **Tests:** 73 passing
- **Pair-cost formula:** Monotonic with respect to route broadness (broader = lower cost)
- **Version stamping:** ✅ FIXED - stamps nested policy_version + separate execution_selection_schema_version
- **Known issues:** None

#### 4. ExecutionSelection Identity & Digest (FIXED)

- **Component:** `runtime/lib/execution-selection-identity.mjs`
- **Status:** COMPLETE (just fixed hardcoded version bug)
- **Tests:** 31 passing
- **Critical fix (2026-04-04):** Now reads stamped `execution_selection_schema_version` instead of hardcoding "v1"
- **Contract violations fixed:**
  - `canonicalIdentityProjection` now reads actual version
  - `computeSelectionRevision` now includes stamped version
  - `enrichWithIdentity` now preserves stamped version (doesn't overwrite)
- **Known issues:** None

#### 5. Versioning & Compatibility (CORRECT)

- **Component:** `runtime/lib/routing-policy-versioning.mjs`
- **Status:** COMPLETE
- **Tests:** 25 passing
- **Contract:** Four independent version tracks (route, model, resolver, schema)
- **Known issues:** None

#### 6. Route Instance Facts & Validators (CORRECT)

- **Components:** `runtime/lib/route-instance-facts.mjs`, `runtime/lib/routing-policy-validators.mjs`
- **Status:** COMPLETE
- **Tests:** All validators and fact extraction passing
- **Known issues:** None

#### 7. Route Profiles & Model Registry (CORRECT)

- **Components:** `runtime/config/route-profiles.mjs`, `runtime/config/model-path-registry.mjs`
- **Status:** COMPLETE
- **Known issues:** None

---

## ⏳ Missing System Integration (Not Library-Level)

### 1. Task State Integration (NOT STARTED)

- **What's needed:** Stamp ExecutionSelection into authoritative task state
- **Where:** Task service, task state store (unknown location - to be discovered)
- **Why:** Selections must be persisted as part of task identity and history
- **Not in current branch:** ❌

### 2. Action History Integration (NOT STARTED)

- **What's needed:** Record ExecutionSelection in ActionCommit or action history
- **Where:** ActionCommit implementation (location TBD)
- **Why:** Actions need to reference the selection that governed them
- **Not in current branch:** ❌

### 3. Segregated Diagnostic Sink (NOT STARTED)

- **What's needed:** Diagnostic collection and storage for execution traces
- **Why:** Observability of selection reasoning during execution
- **Where:** New diagnostic store (location TBD)
- **Not in current branch:** ❌

### Summary: Library Complete, System Integration Pending

The routing policy **library layer is complete**: all core selection logic, versioning, identity, and narrowing work correctly and are tested. However, the **integration layer is incomplete**: the branch stops at the library boundary and does not include:

- Stamping selections into task lifecycle
- Recording selections in action history
- Segregated diagnostic capture

This is **intentional scope separation**: the library is production-ready but system integration requires collaboration with task-service and action-history subsystems.

---

## Policy Intent Fields - v1 Behavior & Documentation

The evaluator accepts policy_intent with four fields, but **v1 uses only two for filtering**. This section documents the contract mismatch to prevent confusion about what's actually active.

### Fields Used in v1 (Hard Constraints)

- ✅ `policy_intent.reliability_tier` - USED as minimum reliability floor
- ✅ `dynamic_runtime_overlays.availability_state` - USED to filter unavailable models

### Fields Accepted But NOT Used in v1 (Carried Through Only)

#### `policy_intent.quality_tier`

- **Status:** ACCEPTED (required field)
- **Used for v1 filtering:** ❌ NO
- **Rationale:** Model tier is already constrained by `route_compatibility_projection.minimum_model_tier`. Quality preference is deferred to future versions.
- **Future use:** May influence model selection preference in v2+ (preference ranking, not hard floor)
- **Risk if assumed active:** Code expecting quality_tier to filter models will silently get all tiers ≥ minimum_model_tier

#### `policy_intent.latency_posture`

- **Status:** ACCEPTED (required field)
- **Used for v1 filtering:** ❌ NO
- **Rationale:** The frontier selection naturally includes multiple latency profiles. v1 leaves selection to caller (resolver tie-breaks).
- **Future use:** May drive latency-aware ranking in v2+
- **Risk if assumed active:** Code expecting latency_posture to filter will silently get all latency profiles in frontier

#### `policy_intent.cost_posture`

- **Status:** ACCEPTED (required field)
- **Used for v1 filtering:** ❌ NO
- **Rationale:** Cost is handled by pair-cost formula and non-dominated frontier. cost_posture preference is deferred.
- **Future use:** May influence which representative is chosen from frontier in v2+ (cost preference ranking)
- **Risk if assumed active:** Code expecting cost_posture to select specific cost level will silently get cheapest valid pair regardless

#### `route_compatibility_projection.preferred_model_tier`

- **Status:** ACCEPTED (optional field)
- **Used for v1 filtering:** ❌ NO
- **Rationale:** Tie-breaking uses evidence_depth, reliability, latency. Preferred tier is deferred to future ranking.
- **Future use:** May bias representative selection toward preferred tier in v2+
- **Risk if assumed active:** Code expecting preferred_model_tier to influence selection will silently be ignored

### Dynamic Runtime Overlays - v1 Behavior

#### `dynamic_runtime_overlays.live_cost_pressure_class`

- **Status:** ACCEPTED (optional)
- **Used for v1 filtering:** ❌ NO
- **Rationale:** Not used in v1 evaluator. Intended for runtime cost constraints in future.
- **Note:** Unlike other fields, this is actually a runtime override mechanism (not just preference)

#### `dynamic_runtime_overlays.overflow_posture`

- **Status:** ACCEPTED (optional)
- **Used for v1 filtering:** ❌ NO
- **Rationale:** Deferred to v2+ for token-overflow handling during execution

#### `dynamic_runtime_overlays.temporary_policy_suppressions`

- **Status:** ACCEPTED (optional)
- **Used for v1 filtering:** ❌ NO
- **Rationale:** Deferred to v2+ for temporary constraint relaxation

---

## Summary: What Changed, What Remains

### This Branch Delivers

- ✅ Core library: narrowing, evaluator, resolver, identity, versioning (211 tests, all passing)
- ✅ Monotonicity locks: pair-cost verified as monotonic with route broadness
- ✅ Contract corrections: identity helper now respects version stamping
- ✅ Design alignment: evaluator simplified to v1 gates only

### This Branch Does NOT Deliver

- ❌ Task state embedding of ExecutionSelection
- ❌ Action history integration with selections
- ❌ Segregated diagnostic sink
- ❌ Behavioral activation of quality_tier, latency_posture, cost_posture, preferred_model_tier

### Recommendation

**Branch is ready for merge as library-complete**. System integration work should be addressed in follow-on branches that coordinate with:

- Task service subsystem (for state embedding)
- Action history subsystem (for ActionCommit integration)
- Observability subsystem (for diagnostics)

Unactivated policy intent fields should be documented in resolver API docs to prevent silent misconfigurations.
