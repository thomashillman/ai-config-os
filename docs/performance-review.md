# Performance review

## Scope

This review focused on the dashboard front end and the runtime dashboard API because they contain the highest concentration of UI rendering work, repeated array scans, and file-backed analytics endpoints.

## Highest-priority opportunities

### 1. Code-split dashboard tabs to reduce initial bundle cost

**Why it matters**

- `dashboard/src/App.jsx` previously imported every tab eagerly, so the initial dashboard bundle always included Tasks, Tools, Skills, Context Cost, Config, Audit, Analytics, and Observability views.
- Several of those tabs are only used occasionally and contain their own fetch logic and rendering trees.

**Improvement**

- Load tabs with `React.lazy()` and render the active view inside `Suspense` so only the selected tab is fetched and executed on demand.

**Expected benefit**

- Lower initial JavaScript parse/evaluate cost.
- Faster first render for the default Tasks view.
- Smaller amount of code executed during startup.

**Status**

- Implemented in this change.

### 2. Stream or tail large analytics files instead of parsing the entire file

**Why it matters**

- `runtime/mcp/dashboard-api.mjs` reads `.claude/metrics.jsonl` with `readFileSync(...).trim().split('\n')` and then `JSON.parse()`s every line for `/api/analytics`.
- That creates a full in-memory copy of the file, a full array of lines, and a full array of parsed objects on every request.

**Improvement**

- Apply the same defensive strategy already used by `/api/skill-analytics`: cap bytes read, tail the file, or stream/aggregate incrementally.
- Return summarized aggregates when the dashboard only needs counts rather than raw event payloads.

**Expected benefit**

- Lower memory usage and less GC pressure for large metrics files.
- More predictable latency for analytics requests.

**Status**

- Analysis only; not changed in this patch.

### 3. Consolidate repeated findings scans into a shared summarizer

**Why it matters**

- `HubTab`, `ResumeSheet`, and `TaskDetailTab` repeatedly scan `task.findings` with multiple `filter()` passes.
- This is inexpensive for tiny arrays, but it scales linearly several times per render and duplicates business logic across components.

**Improvement**

- Introduce a small shared helper that classifies findings in one pass and returns counts/groups for open items, questions, verified items, and provenance buckets.
- Memoize the derived result where components receive stable `findings` references.

**Expected benefit**

- Less repeated work during list renders.
- Lower risk of logic drift between task cards, resume sheets, and detail panels.

**Status**

- Analysis only; the repo already memoizes part of this work inside `TaskDetailTab`.

### 4. Avoid full-directory rescans for autoresearch analytics

**Why it matters**

- `/api/autoresearch-runs` scans all skill directories and all `autoresearch-*` run directories on each request, then reads each `results.json`.
- This is acceptable for small repositories but can become expensive as the shared skills inventory grows.

**Improvement**

- Cache the run index in memory with a short TTL, or maintain a small materialized summary file updated by the writer path.
- Keep the current file size guards.

**Expected benefit**

- Faster repeated dashboard refreshes.
- Less synchronous filesystem work per request.

**Status**

- Analysis only; not changed in this patch.

## Medium-priority opportunities

### 5. Memoize or normalize event-story derivations in `TaskDetailTab`

`EventStory` maps every event to an annotated copy, slices prior events when computing labels, and filters the result again. For long histories, that becomes quadratic for some event types because `slice(0, index).some(...)` repeats prefix scans. A single-pass derivation that tracks whether the first state change has been seen would remove repeated prefix work.

### 6. Add request deduping/cache for analytics and observability panels

`AnalyticsTab` and `ObservabilityTab` re-fetch full datasets on each refresh and initial mount. A light client-side cache keyed by endpoint, or an HTTP cache strategy on the worker/API side, would reduce redundant work during tab switching.

### 7. Replace JSON clone helpers in hot paths with targeted copies

Several runtime modules use `JSON.parse(JSON.stringify(value))` for cloning. That is simple and safe for plain data, but it allocates heavily and drops richer types. Where these functions sit on write-heavy task/event paths, targeted shallow copies or `structuredClone` would likely be cheaper and clearer.

## Notes on methodology

I based this review on:

- component import patterns in the dashboard shell,
- repeated array/filter logic in task-related components,
- synchronous filesystem access in dashboard API endpoints,
- and existing repo tests that already call out a memoization-oriented performance improvement in `TaskDetailTab`.
