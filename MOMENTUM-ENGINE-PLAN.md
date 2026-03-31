# Momentum Engine — Atomic KISS / TDD Plan

## 1. Critique of the original plan

### What the plan gets right

The **product thesis is excellent**: momentum, not storage. The four visible concepts (Work, Findings, Strength, Next Step) are the right UX primitives. The confidence-evolving findings idea is genuinely differentiating. The restraint in the "what not to build" section is correct.

### What the plan gets wrong or is redundant

**Problem 1: The plan doesn't know what already exists.**

The codebase already has 80% of the "engineering plan" built:

| Plan slice                           | Already exists                                                                                                                                                                         | What's missing                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Schemas (Slice 1)                    | 16 contract schemas in `shared/contracts/schemas/v1/` — PortableTaskObject, FindingsLedgerEntry, ProvenanceMarker, EffectiveExecutionContract, ContinuationPackage, HandoffToken, etc. | MomentumView schema only                 |
| Route definitions (Slice 1)          | `runtime/task-route-definitions.yaml` — 4 routes for `review_repository` with equivalence levels and required capabilities                                                             | None                                     |
| Intent vocabulary (Slice 2)          | Not built                                                                                                                                                                              | Everything                               |
| Capability profiles (Slice 3)        | `runtime/lib/capability-profile.mjs` — runtime detection. `task-route-resolver.mjs` — capability-based scoring.                                                                        | Strength labels mapping                  |
| EffectiveExecutionContract (Slice 4) | `runtime/lib/effective-execution-contract.mjs` — builds contract with `stronger_host_guidance` string                                                                                  | Structured upgrade explanation           |
| Checkpoints (Slice 5)                | `runtime/lib/task-store.mjs` — versioned persistence with optimistic concurrency, snapshots                                                                                            | Momentum projection function             |
| Findings (Slice 6)                   | `runtime/lib/findings-ledger.mjs` — provenance markers (verified/reused/hypothesis), route upgrade transitions                                                                         | Confidence level + confidence basis      |
| Continuation (Slice 7)               | `runtime/lib/continuation-package.mjs` + `handoff-token-service.mjs` — HMAC signing, replay protection                                                                                 | Derived UX fields (resumeHeadline, etc.) |
| Journey (Slice 9)                    | `runtime/lib/review-repository-journey.mjs` — start, resume, readiness view with route upgrade                                                                                         | Momentum-specific acceptance tests       |

The plan proposes to "create" schemas and modules that already exist. **Rebuilding them wastes tokens and risks breaking 55 existing test files.**

**Problem 2: Too many slices for the actual net-new work.**

9 slices + 3 sprints is over-structured for what amounts to 5 genuinely new concerns:

1. Intent lexicon (small lookup table)
2. Strength labels (small lookup table)
3. Confidence on findings (schema extension + one function)
4. Structured upgrade explanation (schema extension + one function)
5. MomentumView projection (new schema + one projection function)

**Problem 3: The plan mixes product vision with engineering spec.**

Sections 1-6 are product prose. Sections 8-9 are engineering. The prose is useful for alignment but shouldn't appear in an implementation plan — it creates ambiguity about what to build vs. what to aspire to.

**Problem 4: "github_repo" route doesn't exist.**

The plan references 4 routes: `local_repo`, `github_pr`, `github_repo`, `pasted_diff`. The codebase has: `local_repo`, `github_pr`, `uploaded_bundle`, `pasted_diff`. There is no `github_repo` route. The plan should use the actual route set.

**Problem 5: The plan invents UI requirements without a UI target.**

"Momentum Shelf" and the UX flows describe a frontend that doesn't exist. The dashboard is a React SPA at `dashboard/` but it's for tool/skill status, not task work surfaces. Building a new UI is out of scope for an engine plan.

The MomentumView should be a **data contract** that any UI can consume — not a UI specification.

---

## 2. What actually needs to be built (the delta)

Given the existing codebase, here is the **net-new work** required to deliver the momentum engine promise:

### A. Intent Lexicon (`runtime/lib/intent-lexicon.mjs`)

A deterministic lookup that maps natural language phrases to task types and user-facing titles.

**New files:** 1 module + 1 test
**Touches:** nothing existing

### B. Strength Labels (`runtime/lib/strength-labels.mjs`)

A lookup that maps route IDs to user-facing strength descriptors.

**New files:** 1 module + 1 test
**Touches:** nothing existing

### C. Confidence on Findings (schema extension + function)

Extend `FindingsLedgerEntry` and `ProvenanceMarker` schemas to include `confidence` (low/medium/high) and `confidence_basis`. Add a function to compute confidence evolution on route upgrade.

**Modified files:** 2 schemas, 1 module
**New files:** 0 modules, 0 tests (extend existing `findings-ledger.test.mjs`)
**Risk:** Schema change affects existing tests — must be additive (optional fields)

### D. Structured Upgrade Explanation

Replace the `stronger_host_guidance` string with a structured object: `{ before, now, unlocks }`. Expose this from the effective execution contract builder.

**Modified files:** 1 schema, 1 module
**New files:** 0
**Risk:** Schema change — must keep backward compat or update all consumers

### E. MomentumView Projection (`runtime/lib/momentum-view.mjs`)

A pure function that takes a task + contract + strength labels and produces the user-facing MomentumView object. This is the **only new schema**.

**New files:** 1 schema, 1 module, 1 test

### F. Momentum-Aware Continuation

Extend `createContinuationPackage` to include derived UX fields: `resume_headline`, `best_next_step`, `upgrade_value_statement`.

**Modified files:** 1 schema, 1 module
**New files:** 0

### G. Acceptance Test: Full Momentum Journey

One end-to-end test that validates the complete weak-start → strong-resume → confidence-growth → momentum-view journey.

**New files:** 1 test

---

## 3. Atomic KISS / TDD implementation plan

Each slice is one commit. Each commit adds tests first, then implementation. No slice depends on uncommitted work from another slice.

---

### Slice 1: Intent Lexicon

**Purpose:** The same natural language request always resolves to the same task type and user-facing title.

**Test file:** `scripts/build/test/intent-lexicon.test.mjs`

```
Tests:
  - "review repo" resolves to { taskType: "review_repository", workTitle: "Repository review" }
  - "review this repo" resolves to same
  - "inspect this PR" resolves to same
  - "review repository" resolves to same
  - unknown intent returns null
  - resolution is case-insensitive
  - resolution is deterministic (same input → same output, 100 iterations)
```

**Implementation file:** `runtime/lib/intent-lexicon.mjs`

```javascript
// Exports:
//   resolveIntent(phrase: string) → { taskType: string, workTitle: string } | null
//
// Data: static Map of normalised phrases → { taskType, workTitle }
// Normalisation: lowercase, trim, strip articles ("this", "the", "a")
```

**Schema:** None needed. Output is a plain object consumed by MomentumView.

**Depends on:** Nothing.

---

### Slice 2: Strength Labels

**Purpose:** Every route has a user-facing strength label. Users see "Limited", not "pasted_diff".

**Test file:** `scripts/build/test/strength-labels.test.mjs`

```
Tests:
  - "pasted_diff" → { level: "limited", label: "Diff-only review", description: "Can inspect changed lines only" }
  - "uploaded_bundle" → { level: "partial", label: "Bundle review", description: "Can inspect included files" }
  - "github_pr" → { level: "guided", label: "GitHub-level inspection", description: "Can inspect PR metadata, changed files, and related context" }
  - "local_repo" → { level: "full", label: "Full repository analysis", description: "Can inspect all files, dependencies, tests, and history" }
  - unknown route → throws Error
  - all 4 routes have distinct levels
  - strength ordering: limited < partial < guided < full (ordinal comparison)
```

**Implementation file:** `runtime/lib/strength-labels.mjs`

```javascript
// Exports:
//   getStrengthLabel(routeId: string) → { level, label, description }
//   STRENGTH_ORDER → ['limited', 'partial', 'guided', 'full']
//   compareStrength(a, b) → -1 | 0 | 1
```

**Depends on:** Nothing.

---

### Slice 3: Confidence on Findings

**Purpose:** Findings carry confidence that improves with stronger evidence. Confidence cannot increase without evidence.

**Schema changes (additive — new optional fields):**

`shared/contracts/schemas/v1/provenance-marker.schema.json`:

```json
// Add optional fields:
"confidence": { "type": "string", "enum": ["low", "medium", "high"] }
"confidence_basis": { "type": "string", "enum": ["diff_only", "bundle_context", "github_context", "full_repo_verification"] }
```

`shared/contracts/schemas/v1/findings-ledger-entry.schema.json`:

```json
// Add optional field:
"verification_status": { "type": "string", "enum": ["unverified", "partially_verified", "verified", "ruled_out"] }
```

**Test additions to:** `scripts/build/test/findings-ledger.test.mjs`

```
New tests:
  - finding created in pasted_diff route has confidence "low" and basis "diff_only"
  - finding created in github_pr route has confidence "medium" and basis "github_context"
  - finding created in local_repo route has confidence "high" and basis "full_repo_verification"
  - confidence increases after route upgrade to stronger route (low→medium, medium→high)
  - confidence CANNOT increase without route upgrade (same route → same confidence)
  - confidence_basis updates when confidence changes
  - verification_status transitions: unverified → partially_verified → verified
  - verification_status can become "ruled_out" (finding disproven)
  - ruled_out finding cannot become verified again
  - existing tests still pass (backward compat — fields are optional)
```

**Implementation changes to:** `runtime/lib/findings-ledger.mjs`

```javascript
// Add to createFindingsLedgerEntry:
//   Optional: confidence, confidence_basis (derived from recordedByRoute if not provided)
//   Optional: verification_status (defaults to "unverified")
//
// Add new export:
//   deriveConfidenceForRoute(routeId) → { confidence, confidence_basis }
//
// Modify transitionFindingsForRouteUpgrade:
//   When upgrading to equal equivalence route, re-derive confidence from new route
//   Only increase confidence, never decrease
```

**New helper:** `runtime/lib/confidence-rules.mjs`

```javascript
// Pure functions:
//   confidenceForRoute(routeId) → { confidence, confidence_basis }
//   canUpgradeConfidence(current, proposed) → boolean
//   CONFIDENCE_ORDER → ['low', 'medium', 'high']
//   ROUTE_CONFIDENCE_MAP → { pasted_diff: 'low', uploaded_bundle: 'low', github_pr: 'medium', local_repo: 'high' }
```

**Depends on:** Nothing (schema changes are additive).

---

### Slice 4: Structured Upgrade Explanation

**Purpose:** Route upgrades explain what was possible before, what is possible now, and what value the upgrade unlocks. This replaces the existing `stronger_host_guidance` string.

**Schema change:**

`shared/contracts/schemas/v1/effective-execution-contract.schema.json`:

```json
// Add optional field alongside existing stronger_host_guidance:
"upgrade_explanation": {
  "type": "object",
  "additionalProperties": false,
  "required": ["before", "now", "unlocks"],
  "properties": {
    "before": { "type": "string", "minLength": 1 },
    "now": { "type": "string", "minLength": 1 },
    "unlocks": { "type": "string", "minLength": 1 }
  }
}
```

**Test additions to:** `scripts/build/test/effective-execution-contract.test.mjs`

```
New tests:
  - contract for pasted_diff route includes upgrade_explanation with before/now/unlocks
  - contract for local_repo route has no upgrade_explanation (already strongest)
  - upgrade_explanation.before describes current route's limitations
  - upgrade_explanation.now describes current route's capabilities
  - upgrade_explanation.unlocks describes what stronger route adds
  - upgrade_explanation fields are non-empty strings
  - existing tests still pass (field is optional)
```

**Implementation changes to:** `runtime/lib/effective-execution-contract.mjs`

```javascript
// Add new internal function:
//   buildUpgradeExplanation({ selectedRoute, candidates, taskType }) → { before, now, unlocks } | undefined
//
// Add to buildEffectiveExecutionContract output when route is degraded
```

**New data file:** `runtime/lib/upgrade-explanations.mjs`

```javascript
// Static data: route-pair → { before, now, unlocks } templates
// Example:
//   pasted_diff → local_repo: {
//     before: "Using pasted diff, only changed lines can be inspected",
//     now: "Diff analysis is available",
//     unlocks: "Full repository access enables call site verification, dependency impact analysis, and related test inspection"
//   }
```

**Depends on:** Nothing (schema change is additive).

---

### Slice 5: MomentumView Schema and Projection

**Purpose:** The single user-facing data contract. Everything the UI needs to show Work, Findings, Strength, Next Step.

**New schema:** `shared/contracts/schemas/v1/momentum-view.schema.json`

```json
{
  "title": "MomentumView",
  "type": "object",
  "required": [
    "schema_version",
    "task_id",
    "work_title",
    "progress_summary",
    "top_findings",
    "current_strength",
    "best_next_action"
  ],
  "properties": {
    "schema_version": { "const": "1.0.0" },
    "task_id": { "type": "string" },
    "work_title": { "type": "string", "minLength": 1 },
    "progress_summary": { "type": "string", "minLength": 1 },
    "top_findings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["summary", "confidence"],
        "properties": {
          "summary": { "type": "string" },
          "confidence": { "type": "string", "enum": ["low", "medium", "high"] },
          "verification_status": { "type": "string" }
        }
      }
    },
    "current_strength": {
      "type": "object",
      "required": ["level", "label"],
      "properties": {
        "level": { "type": "string" },
        "label": { "type": "string" }
      }
    },
    "best_next_action": { "type": "string", "minLength": 1 },
    "upgrade_opportunity": {
      "type": "object",
      "properties": {
        "target_label": { "type": "string" },
        "unlocks": { "type": "string" }
      }
    }
  }
}
```

**New test file:** `scripts/build/test/momentum-view.test.mjs`

```
Tests:
  - buildMomentumView with active task produces valid MomentumView
  - work_title comes from intent lexicon (task_type → title)
  - progress_summary is human-readable ("2 of 6 steps complete, 3 findings recorded")
  - top_findings extracts summary + confidence from task findings
  - current_strength reflects active route's strength label
  - best_next_action comes from task.next_action
  - upgrade_opportunity present when stronger route available
  - upgrade_opportunity absent when already on strongest route
  - completed task has appropriate progress_summary
  - task with zero findings produces empty top_findings array
  - MomentumView validates against schema
  - same inputs always produce same output (deterministic)
```

**New implementation:** `runtime/lib/momentum-view.mjs`

```javascript
// Exports:
//   buildMomentumView({ task, effectiveExecutionContract, intentLexicon?, strengthLabels? }) → MomentumView
//
// Pure function. No side effects. No I/O.
// Composes: intent-lexicon + strength-labels + task state → MomentumView
```

**Register in:** `shared/contracts/validate.mjs` (add schema to validator)

**Depends on:** Slices 1, 2, 3 (uses intent lexicon, strength labels, confidence fields).

---

### Slice 6: Momentum-Aware Continuation

**Purpose:** Continuation packages include derived UX fields so the receiving environment can immediately show momentum, not a blank resume prompt.

**Schema change to:** `shared/contracts/schemas/v1/continuation-package.schema.json`

```json
// Add optional fields:
"resume_headline": { "type": "string", "minLength": 1 },
"best_next_step": { "type": "string", "minLength": 1 },
"upgrade_value_statement": { "type": "string", "minLength": 1 }
```

**Test additions to:** `scripts/build/test/continuation-package.test.mjs`

```
New tests:
  - continuation package includes resume_headline derived from task
  - resume_headline format: "Continuing {workTitle}"
  - best_next_step comes from task.next_action
  - upgrade_value_statement present when stronger route exists
  - upgrade_value_statement absent when already strongest
  - existing tests still pass (fields are optional)
```

**Implementation changes to:** `runtime/lib/continuation-package.mjs`

```javascript
// Modify createContinuationPackage:
//   Derive resume_headline from task type → intent lexicon
//   Copy best_next_step from task.next_action
//   Derive upgrade_value_statement from effective execution contract's upgrade_explanation
```

**Depends on:** Slices 1, 4 (intent lexicon, upgrade explanation).

---

### Slice 7: Momentum Journey Acceptance Test

**Purpose:** One test that validates the complete product promise end-to-end.

**New test file:** `scripts/build/test/momentum-journey.test.mjs`

```
Tests:
  Weak-start scenario (pasted_diff):
    - intent "review this repo" resolves to review_repository
    - task created with pasted_diff route
    - MomentumView shows:
        work_title: "Repository review"
        current_strength.level: "limited"
        best_next_action is non-empty
        upgrade_opportunity.unlocks mentions repository access
    - finding recorded with confidence "low", basis "diff_only"

  Strong-resume scenario (local_repo):
    - same task loaded from store
    - route upgrades to local_repo
    - MomentumView shows:
        current_strength.level: "full"
        upgrade_opportunity is absent
    - earlier finding's confidence upgraded to "high"
    - continuation package has resume_headline "Continuing Repository review"

  Confidence growth scenario:
    - finding starts at low confidence (pasted_diff)
    - after upgrade to github_pr: confidence becomes "medium"
    - after upgrade to local_repo: confidence becomes "high"
    - confidence never decreases during journey

  Momentum shelf scenario:
    - multiple tasks exist in store with different states
    - buildMomentumShelf returns tasks ranked by continuation value
    - active tasks with findings rank higher than pending tasks
    - tasks with upgrade opportunities in current environment rank highest

  Determinism:
    - replaying exact same journey produces byte-identical MomentumViews
```

**New implementation:** `runtime/lib/momentum-shelf.mjs`

```javascript
// Exports:
//   buildMomentumShelf({ tasks, capabilityProfile }) → MomentumView[]
//
// Ranks tasks by continuation value:
//   1. Tasks with upgrade opportunities in current environment
//   2. Active tasks with unverified findings
//   3. Active tasks
//   4. Pending tasks
```

**Depends on:** All previous slices.

---

## 4. Dependency graph

```
Slice 1 (Intent Lexicon)      ─┐
                                ├──→ Slice 5 (MomentumView) ──→ Slice 7 (Acceptance)
Slice 2 (Strength Labels)     ─┤                                     ↑
                                │                                     │
Slice 3 (Confidence)           ─┤                                     │
                                │                                     │
Slice 4 (Upgrade Explanation)  ─┴──→ Slice 6 (Continuation) ─────────┘
```

Slices 1-4 are independent and can be built in parallel.
Slice 5 depends on 1-4.
Slice 6 depends on 1, 4.
Slice 7 depends on all.

---

## 5. Files changed/created summary

### New files (9)

| File                                                    | Slice | Type   |
| ------------------------------------------------------- | ----- | ------ |
| `runtime/lib/intent-lexicon.mjs`                        | 1     | Module |
| `scripts/build/test/intent-lexicon.test.mjs`            | 1     | Test   |
| `runtime/lib/strength-labels.mjs`                       | 2     | Module |
| `scripts/build/test/strength-labels.test.mjs`           | 2     | Test   |
| `runtime/lib/confidence-rules.mjs`                      | 3     | Module |
| `runtime/lib/upgrade-explanations.mjs`                  | 4     | Data   |
| `shared/contracts/schemas/v1/momentum-view.schema.json` | 5     | Schema |
| `runtime/lib/momentum-view.mjs`                         | 5     | Module |
| `scripts/build/test/momentum-view.test.mjs`             | 5     | Test   |
| `runtime/lib/momentum-shelf.mjs`                        | 7     | Module |
| `scripts/build/test/momentum-journey.test.mjs`          | 7     | Test   |

### Modified files (7)

| File                                                                   | Slice | Change                                        |
| ---------------------------------------------------------------------- | ----- | --------------------------------------------- |
| `shared/contracts/schemas/v1/provenance-marker.schema.json`            | 3     | Add optional `confidence`, `confidence_basis` |
| `shared/contracts/schemas/v1/findings-ledger-entry.schema.json`        | 3     | Add optional `verification_status`            |
| `runtime/lib/findings-ledger.mjs`                                      | 3     | Support confidence fields, derive from route  |
| `shared/contracts/schemas/v1/effective-execution-contract.schema.json` | 4     | Add optional `upgrade_explanation` object     |
| `runtime/lib/effective-execution-contract.mjs`                         | 4     | Build upgrade explanation                     |
| `shared/contracts/schemas/v1/continuation-package.schema.json`         | 6     | Add optional UX fields                        |
| `runtime/lib/continuation-package.mjs`                                 | 6     | Derive UX fields                              |
| `shared/contracts/validate.mjs`                                        | 5     | Register MomentumView schema                  |

### Untouched (preserved as-is)

All 55 existing test files, all 16 existing schemas (modified ones get additive optional fields only), all existing runtime modules, all build infrastructure, all skills, all workflows.

---

## 6. What this plan does NOT include (and why)

| Excluded                                       | Reason                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| New `spec/` directory with outcome/route YAML  | Already exists as `runtime/task-route-definitions.yaml` and `runtime/task-route-input-definitions.yaml` |
| New OutcomeDefinition/RouteDefinition schemas  | Already exist in `shared/contracts/schemas/v1/`                                                         |
| BehaviourStateObject schema                    | Not needed — PortableTaskObject already captures all task state                                         |
| Finding.schema.json                            | Already exists as `findings-ledger-entry.schema.json`                                                   |
| HandoffToken.schema.json                       | Already exists and is fully implemented with HMAC + replay protection                                   |
| `github_repo` route                            | Does not exist in route definitions. The plan's intent is covered by `github_pr`                        |
| UI components / React views                    | Engine layer only. MomentumView is a data contract, not a component                                     |
| Momentum Shelf as a UI                         | `buildMomentumShelf` returns ranked data. Rendering is out of scope                                     |
| Sprint/week structure                          | Unnecessary. Slices are atomic commits. Ship when green                                                 |
| Connected capabilities (Slack, issue creation) | Out of scope for engine. These are skill-level concerns                                                 |

---

## 7. Risk register

| Risk                                | Mitigation                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| Schema changes break existing tests | All changes are additive (optional fields). Run full suite after each slice.         |
| MomentumView becomes a kitchen sink | Schema is strict: 7 required fields, 1 optional. No extensibility in v1.             |
| Intent lexicon becomes a classifier | Keep it as a static lookup table. No NLP. If phrase isn't in the table, return null. |
| Strength labels become opinion      | Labels are factual descriptions of what the route can access, not quality judgments. |
| Confidence rules become complex     | Three levels only. One rule: confidence = f(route). No scoring, no weighting.        |

---

## 8. Definition of done

All of these must be true:

- [ ] `npm test` passes (all 55+ existing tests + new tests)
- [ ] `resolveIntent("review this repo")` → `{ taskType: "review_repository", workTitle: "Repository review" }`
- [ ] `getStrengthLabel("pasted_diff")` → `{ level: "limited", ... }`
- [ ] Finding created in pasted_diff has `confidence: "low"`
- [ ] Finding confidence upgrades to "high" after route upgrade to local_repo
- [ ] EffectiveExecutionContract includes `upgrade_explanation` for degraded routes
- [ ] `buildMomentumView(task)` produces valid MomentumView with all 7 fields
- [ ] ContinuationPackage includes `resume_headline` and `best_next_step`
- [ ] Full journey test passes: weak-start → strong-resume → confidence-growth → momentum-view
- [ ] No existing test was modified to pass (only new tests added, existing tests remain green)
- [ ] `buildMomentumShelf` ranks tasks by continuation value
- [ ] All changes are backward-compatible (optional schema fields only)
