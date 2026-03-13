# Next Atomic Task Plan (KISS + TDD)

## Next atomic task from PLAN.md

**Task:** **T004** — refactor `runtime/lib/outcome-resolver.mjs` from hardcoded admin-first mappings to loader-backed task-and-route resolution.

Why this is next:
- PLAN.md calls out hardcoded outcome resolver removal as a blocker before MVA work can proceed.
- Sprint build order puts this in Week 1 foundations (T004–T005), ahead of route resolver and UI/integration work.

## KISS test-driven plan

### 0) Freeze current behavior with a focused characterization test
- Add a small test file for `outcome-resolver` that captures current externally visible behavior for one known route.
- Keep scope tiny: one passing test to ensure we do not break call contract while refactoring internals.

### 1) RED: add first failing test for loader-backed resolution
- Add a failing unit test asserting resolver uses loader-provided task/route definitions (not hardcoded table).
- Minimal scenario:
  - Inject fake loader with one task type and one route.
  - Call resolver with matching input.
  - Expect resolved route from loader data.

### 2) GREEN: introduce smallest seam for dependency injection
- In `runtime/lib/outcome-resolver.mjs`, add a simple optional loader parameter (or `setResolverLoader` helper if existing style prefers module-level config).
- Implement lookup through loader first.
- Keep old hardcoded path temporarily as fallback to avoid broad breakage.
- Make failing test pass.

### 3) RED: enforce non-hardcoded path for supported tasks
- Add failing test that supported task types must resolve via loader when loader data exists.
- Add failing test that unknown task/route returns clear error with context.

### 4) GREEN: remove admin-first hardcoded mapping from main path
- Flip precedence so loader-backed resolution is authoritative.
- Keep compatibility shim only if required by existing callers, but isolate it and mark for deletion in T005.
- Make new tests pass.

### 5) REFACTOR: tighten API and error messages
- Extract tiny pure functions:
  - `resolveTaskDefinition(...)`
  - `resolveRouteDefinition(...)`
- Standardize descriptive errors (include `taskType`, `outcomeId`/`routeId`, and whether loader returned data).
- Keep implementation boring and explicit.

### 6) T005 follow-through (cleanup + confidence)
- Remove/retire hardcoded map entirely once all tests pass.
- Add regression tests for:
  - deterministic resolution order,
  - no prompt-based branching,
  - stable output shape used by runtime handlers.

### 7) Verification commands
- Run targeted tests first, then broader runtime/build tests.
- Keep change set small and reversible.

## Definition of done for this atomic task
- Resolver no longer depends on admin-first hardcoded mapping for normal path.
- Loader-backed tests cover success + failure paths.
- Existing public resolver contract remains stable for callers.
- All relevant tests pass locally.

## Implementation status
- [x] Added loader-backed outcome definitions in `runtime/outcome-definitions.yaml`.
- [x] Added cached definition loader module and dependency-injection seam for tests.
- [x] Refactored resolver to read tool/outcome/route mappings from loader data.
- [x] Added loader-focused tests (injected loader success + unknown-route failure).
- [x] Verified resolver and MCP handler contract tests pass locally.

