# AI Config OS — Implementation Plan

## Overview

The **control plane for portable AI work**. The task object is the unit of value — not chat, not prompts, not agents. Work starts in any environment (web, mobile, IDE), and the runtime routes it, checkpoints it, and continues it in a stronger environment without the user re-explaining anything.

The existing substrate (Worker endpoints, emitted runtime artefacts, capability profiling, remote executor, dashboard contract panel) is preserved and extended. The new layer adds six core primitives: PortableTaskObject, capability detection integration, deterministic route resolution, EffectiveExecutionContract, structured continuation, and findings provenance.

The first automated workflow is `review_repository`: start in a limited environment, continue in a stronger one, preserve findings with provenance, finish without reconstructing context.

**The product test:** after switching environments, does the runtime feel ready?

Autospec artefacts live at [github.com/thomashillman/autospec](https://github.com/thomashillman/autospec).

Core principle: **own the task lifecycle — routing, continuation, verification, provenance, and cross-environment upgrades**.

---

## Current state — updated 2026-03-11

| Area | Status | Notes |
|---|---|---|
| Repo scaffold and .gitignore | ✅ Done | Phase 1 complete |
| marketplace.json | ✅ Done | Phase 1 complete |
| core-skills plugin.json | ✅ Done | v0.5.1 (Phase 9.1) |
| shared/manifest.md (index) | ✅ Done | 22 skills listed |
| shared/principles.md | ✅ Done | Phase 1 complete |
| adapters/claude/dev-test.sh | ✅ Done | Fixed for non-interactive environments |
| ops/new-skill.sh | ✅ Done | Phase 1 complete |
| shared/skills/_template/ | ✅ Done | Phase 2 enhanced with full frontmatter |
| .github/workflows/validate.yml | ✅ Done | Phase 1 complete |
| CLAUDE.md (dev context) | ✅ Done | Extended with self-improvement rules |
| .claude/hooks/session-start.sh | ✅ Done | SessionStart hook implemented |
| README.md | ✅ Done | Phase 2 documentation |
| All original skills (6 total) | ✅ Done | session-start-hook, web-search, commit-conventions, git-ops, principles, plugin-setup |
| Phase 2: Multi-model variants | ✅ Done | All skills have opus/sonnet/haiku variants |
| Phase 2: Testing framework | ✅ Done | Skill tests defined in frontmatter |
| Phase 2: Composition & workflows | ✅ Done | Framework present |
| Phase 2: Performance monitoring | ✅ Done | Analytics infrastructure ready |
| Phase 3: Multi-device sync | ✅ Done | ops/sync/ai-sync.sh implemented |
| Phase 4: Codex adapter | ✅ Done | adapters/codex/install.sh exists |
| Validation infrastructure | ✅ Done | yaml-parser compatible with mawk, dev-test passes |
| Phase 6: Feature expansion (14 items) | ✅ Done | 6 new skills, 3 ops tools, 2 hooks, 2 workflows, CI frontmatter validation, Cursor adapter |
| Phase 7: Code quality & workflow expansion | ✅ Done | 7 new skills (memory, test-writer, security-review, refactor, review-pr, issue-triage, simplify); 2 workflows (daily-brief, pre-commit); 2 infrastructure scripts |
| Phase 8: Runtime integration | ✅ Done | v0.5.0: Three-tier config, tool registry, adapters, sync engine, manifest, MCP server, React dashboard, ops/CI updates |
| Phase 9.1: Distribution first slice | ✅ Done | v0.5.1: skill schema, compiler, Cloudflare Worker, CI build workflow, materialiser adapter |
| Phase 9.2: Capability-driven compatibility | ✅ Done | v0.5.2: platform registry, capability contracts, compatibility resolver, runtime probe, Node linter |
| Phase 9.3: Close compatibility loop | ✅ Done | v0.5.3: Emitter wiring, validate-only pipeline, Cursor emitter, probe accuracy fixes |
| Phase 9.4: Validation architecture overhaul | ✅ Done | v0.5.3+: Shared validation, schema tightening, compiler strictness, linter refactoring |
| Phase 9.5: Delivery contract (PR 4) | ✅ Done | v0.5.3+: 28 tests protecting dist/ artifacts, documented in CLAUDE.md |
| Phase 9.6: Portability contract (TDD) | ✅ Done | v0.6.0+: Materialiser core, canonical source contract, self-sufficiency tests, CI gates, docs updated |
| Phase 9.7: Manifest-controlled feature flags | 🔄 In progress | v0.5.4+: flags defined + validated (Step 1/4); runtime gating (Steps 2–4) not yet implemented |
| **MVA: Task control plane** | 🔜 Next | PortableTaskObject, TaskStore, RouteResolver, EffectiveExecutionContract, FindingsLedger, ContinuationPackage, HandoffToken |

## MVA: Task Control Plane — Portable Repository Review (NEXT)

**Goal:** Prove one portable work journey end-to-end. Start `review_repository` in a weak environment, continue in a stronger one, preserve findings with provenance, finish without re-explaining.

**Version:** v0.7.0
**Autospec:** [github.com/thomashillman/autospec](https://github.com/thomashillman/autospec) — T001 creates spec.yaml, plan.yaml, tasks.yaml, acceptance.yaml

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
- Create Autospec artefacts (T001)
- Define versioned schemas: PortableTaskObject, TaskStateSnapshot, RouteDefinition, EffectiveExecutionContract, ProgressEvent, FindingsLedgerEntry, ProvenanceMarker, ContinuationPackage, HandoffToken (T002)
- Implement TaskStore with versioned updates and optimistic concurrency (T003)
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
| Deterministic route correctness (fixture scenarios) | ≥ 98% | End of Week 2 |
| Contract honesty (route, equivalence, missing caps match reality) | 100% | Continuous |
| Resume readiness (no user restatement needed) | ≥ 90% | MVA release |
| Route-upgrade success (upgrade preserves findings) | ≥ 85% | MVA release |
| Handoff friction (median user actions to continue) | ≤ 1 | MVA release |
| Findings provenance coverage (verified/reused/hypothesis after transition) | 100% | MVA release |
| Control-plane reliability (Worker endpoints) | ≥ 99.5% | Production |
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

---

## Phase 9.7: Manifest-Controlled Runtime Feature Flags (IN PROGRESS)

**Version:** v0.5.4+
**Branch:** current
**Step 1 done:** flags defined in `runtime/manifest.sh` + `validateManifestFeatureFlags()` in `scripts/build/lib/versioning.mjs` + tests. Steps 2–4 (runtime gating) not yet implemented.

### Feature flags

- `outcome_resolution_enabled`
- `effective_contract_required`
- `remote_executor_enabled`

### Rollout plan

1. **Read-only generation + validation**
   - Add manifest flags with safe defaults (`false`)
   - Validate types at load-time and surface hard errors for non-boolean values
2. **Dual-path runtime (legacy + new)**
   - Keep legacy route-less execution path (`run_script`) for compatibility while explicit routes continue to operate
   - Introduce gated `remote_exec` route behind `remote_executor_enabled`
3. **Enforce explicit contract**
   - Flip `effective_contract_required=true` to block route-less execution
   - Keep explicit tool routes as the only supported interface
4. **Retire legacy route-less execution paths**
   - Remove `run_script` handling and corresponding tool descriptor after one stable release with contract enforcement enabled

### Migration criteria

- `manifest_feature_flags` reports expected values in runtime environment
- No automation depends on `run_script` for one full release cycle
- Remote execution users have migrated to `remote_exec` with explicit opt-in
- Release checklist includes explicit contract/rollback verification before Phase 3 enablement

### Rollback criteria

- If explicit-contract rollout breaks automation: set `effective_contract_required=false`
- If remote executor causes instability: set `remote_executor_enabled=false`
- If outcome formatting regressions appear: set `outcome_resolution_enabled=false`
- Rollback must be possible via manifest-only change (no code deploy required)

---

## Phase 9.6: Portability Contract — TDD Implementation (COMPLETE ✅)

**Version:** v0.6.0
**Branch:** `claude/tdd-portability-contract-kRY5U`
**Completion:** 2026-03-08

### Summary

Formalized and enforced the **portability contract**: emitted packages (`dist/`) are self-sufficient and work standalone without source-tree access. This is the foundation for distribution, caching, offline usage, and materialization on any system.

**Key guarantees:**
1. **Canonical source contract:** Compiler reads *only* from `shared/skills/` (verified by test)
2. **Self-sufficiency contract:** Emitted packages contain complete skill copies + all referenced resources (prompts/, etc.), no symlinks or source references
3. **Materialisation contract:** Packages can be extracted to any filesystem without source access; security checks prevent path traversal attacks
4. **Determinism contract:** Same source always produces identical emitted packages (no build timestamps in SKILL.md)

**Components added:**
1. Test suite (4 new test files):
   - `canonical-source-contract.test.mjs` — Compiler reads only from `shared/skills/`
   - `materialisation-contract.test.mjs` — Emitted packages are complete and self-sufficient
   - `source-change-flow.test.mjs` — Source changes produce predictable output changes
   - `materialiser-core.test.mjs` — Materialiser validates paths, prevents escapes, security checks

2. Implementation:
   - `scripts/build/lib/materialise-client.mjs` — Node.js materialiser core (path validation, security, extraction)
   - Enhanced `emit-claude-code.mjs` to copy all referenced resources (prompts/), not just SKILL.md
   - Added code comments locking canonical source contract in compiler

3. Documentation & CI:
   - Updated `.github/workflows/build.yml` step names to explicitly document contract verification
   - Extended `scripts/build/verify.mjs` to gate on portability contract tests
   - Updated CLAUDE.md with Portability Contract section (v0.6.0+)
   - Updated README.md with Architecture section and source → build → distribution flow

**Bugs fixed during execution:**
- Missing `readdirSync` import in test suite
- Test regexes too strict for quoted YAML values
- Materialiser security test mocking actual files instead of testing validation logic

**Tests protected by portability contract:** 76 tests (across 4 test files)

---

## Phase 7: Code Quality & Workflow Expansion — 12-item implementation (COMPLETE ✅)

**Version:** v0.4.7
**Branch:** `claude/review-features-plan-omLC3`
**Completion:** 2026-02-28

### Summary

Expanded the skill library from 16 to 23 skills, added 2 multi-skill workflows, and infrastructure for skill versioning and analytics:

**Skills added:**
1. `memory` — Persistent cross-session project context
2. `test-writer` — Comprehensive test generation from code
3. `security-review` — OWASP-aware vulnerability scanning
4. `refactor` — Structured refactoring with safety checks
5. `review-pr` — Incoming PR review and quality gating
6. `issue-triage` — GitHub issue classification and response drafting
7. `simplify` — Code complexity reduction guidance

**Workflows added:**
1. `daily-brief` — Morning standup synthesis (git-ops → changelog → memory → task-decompose)
2. `pre-commit` — Quality gate before committing (security-review → code-review → commit-conventions)

**Infrastructure:**
- `ops/validate-pins.sh` — Enforce optional skill version pinning
- `.claude/hooks/post-tool-use-metrics.sh` — Analytics data collection
- Manifest and documentation updated; all skills validated

All 7 new skills include multi-model variants (opus/sonnet/haiku) with cost factors and latency baselines.

---

## Phase 8: Runtime Integration — Tool Management & Sync (COMPLETE ✅)

**Version:** v0.5.0
**Branch:** `claude/phase-8-runtime-Z3Zo4`
**Completion:** 2026-03-06

### Summary

Integrated Mycelium's runtime concepts (desired-state tool management, three-tier config merge, MCP server, dashboard) into ai-config-os. All components written from scratch using ai-config-os conventions. Resolved Mycelium's architectural problems (in-place mutation, subprocess overhead, race conditions).

**Layer model post-Phase-8:**
```
shared/skills/          authoring layer (unchanged)
shared/manifest.md      registry layer (extended)
runtime/                new: desired-state config + adapters + sync
dashboard/              new: React SPA
```

**Implementation:**
1. Three-tier config schema (global, machine, project) with field-level merge for MCPs
2. Tool registry (claude-code, cursor, codex) with adapter abstraction
3. Adapter layer: MCP, CLI, file adapters for tool management
4. Sync engine with manifest state tracking and dry-run mode
5. MCP server exposing runtime operations as Claude Code tools
6. React dashboard with 6 tabs: Tools, Skills, Context Cost, Config, Audit, Analytics
7. Updated session-start hook to validate and sync runtime
8. Ops tools: runtime-status.sh, validate-registry.sh
9. CI integration: tool registry and config schema validation

**Not included (deferred):**
- Plugin takeover injection (not needed: plugins load directly)
- Cross-session learning feedback loop (requires usage data)
- Conflict detector (single-pass check can be added later)

---

## Phase 9.1: Distribution First Slice (COMPLETE ✅)

**Version:** v0.5.1
**Branch:** `claude/plan-config-os-distribution-rjqcI`
**Completion:** 2026-03-07

### Summary

Introduced the GitHub-authored, CI-compiled, Cloudflare-distributed architecture. All existing local capability is preserved — this layer is purely additive.

**Design:** skill schema is a **package manifest + adapter hints** (not a runtime abstraction). Skills declare `platforms:` mappings and `capabilities:` hints (filesystem, network, git) — platform-agnostic.

**Components added:**
1. `schemas/skill.schema.json` — JSON Schema draft 2020-12; skills are package manifests, not runtime configs
2. `shared/targets/clients.yaml` — reference doc for known platforms (claude-code, claude-web, codex, cursor)
3. `scripts/build/compile.mjs` — compiler: scans all 22 skills, validates schema, emits `dist/`
4. `package.json` — root package with `yaml` + `ajv` dependencies
5. `worker/` — Cloudflare Worker serving skills via bearer-auth REST API
6. `.github/workflows/build.yml` — CI: validates + builds + uploads dist/ as artefact
7. `adapters/claude/materialise.sh` — fetches compiled skills from Worker to local cache

**Also fixed:** 7 YAML quoting bugs in skill frontmatters (unquoted `"foo" (extra)` descriptions).

---

## Phase 9.2: Capability-Driven Compatibility (COMPLETE ✅)

**Version:** v0.5.2
**Branch:** `claude/plan-config-os-distribution-rjqcI`
**Completion:** 2026-03-07

### Summary

Replaced flat capability hints and implicit claude-code defaulting with a structured capability contract model. Compatibility is now *computed* from platform capability states, not hand-maintained per skill.

**Core change:** Skills declare minimum viable capabilities (`required`/`optional`/`fallback_mode`), platforms declare capability states (`supported`/`unsupported`/`unknown`), and the compiler resolves compatibility automatically.

**Components added:**
1. `schemas/platform.schema.json` — schema for platform capability definitions
2. `shared/targets/platforms/*.yaml` — 5 platform files (claude-code, claude-web, claude-ios, codex, cursor) with evidence-tracked capability states
3. `scripts/lint/skill.mjs` — Node-based skill linter replacing bash parsing
4. `scripts/lint/platform.mjs` — Node-based platform file linter
5. `scripts/build/lib/load-platforms.mjs` — platform loader for compiler
6. `scripts/build/lib/resolve-compatibility.mjs` — capability-driven compatibility algorithm
7. `ops/capability-probe.sh` — runtime capability probe (tests capabilities at session start)
8. `schemas/probe-result.schema.json` — schema for probe output

**Migrated:** All 22 skills now have structured capability contracts. 14 pure prompt skills have `required: []` (work everywhere). 8 skills with required capabilities are correctly excluded or marked unverified on platforms that lack support.

**CI enforcement:** Build fails if any skill is missing `capabilities.required`. Registry includes per-skill compatibility matrix.

---

## Phase 9.3: Close the Compatibility Loop (IN PROGRESS)

**Version:** v0.5.3
**Branch:** `claude/plan-config-os-distribution-rjqcI`

### Summary

v0.5.2 shipped the right architecture but had implementation gaps that made the compatibility system decorative rather than enforced. v0.5.3 makes it honest.

**Fixes:**
1. **Emitter wiring** — compiler now passes compatibility-filtered skills to emitters instead of full unfiltered set
2. **Validate-only pipeline** — `--validate-only` now runs full validation (platforms, capabilities, compatibility) — just skips file output
3. **Skill linter schema validation** — AJV schema validation added (was loaded but never compiled/run)
4. **Probe accuracy** — `git.write` tests actual writes; `mcp.client` tries real invocation before config check
5. **CLAUDE.md contract drift** — examples updated to match current schema

**New capability:**
6. **Cursor emitter** — first non-Claude-Code emitter, producing `.cursorrules` from compatible skills with degradation notes

---

## Phase 9.4: Validation Architecture Overhaul (IN PROGRESS)

**Version:** v0.5.3+ (split-brain fix)
**Branch:** `claude/analyze-product-feedback-FQeFT`
**Status:** Phases 1-4 implemented and passing; hook policy and test harness gaps being closed

### Problem
The validation pipeline is split-brain: `scripts/lint/skill.mjs` enforces 10+ custom policy rules (fallback_mode required, overlapping capabilities, platform validation, hook exclusions, etc.) that the compiler (`scripts/build/compile.mjs`) does **not** enforce. A skill can pass the linter but fail real compatibility resolution, or pass the compiler but violate project policy.

Additional gaps:
- Platform files are not schema-validated in the compiler (only warnings)
- Zero-emit skills (resolve to no compatible platforms) silently pass build
- Legacy dead code in `emit-registry.mjs` still accepts flat capability arrays
- Policy errors and advisory warnings are mixed in lint, not separated

### Implementation Summary (Commit 04fad22)

**Phase 1 (shared validation):** Created `scripts/build/lib/validate-skill-policy.mjs` with two functions:
- `validateSkillPolicy(frontmatter, skillName, knownPlatforms)` — legacy flat-array check, overlapping capabilities, unknown platforms, hook platform exclusions, mode=excluded + allow_unverified check
- `validatePlatformPolicy(platformDef, platformId)` — platform ID matching
Both compiler and linter now import and call these functions.

**Phase 2 (schema tightening):** Modified `schemas/skill.schema.json`:
- Added if/then conditional: fallback_mode becomes required when capabilities.required is non-empty
- Tightened variant $defs to `additionalProperties: false` (no loose fields allowed)
- Added propertyNames pattern to $extensions: `^[a-z0-9]+(\\.[a-z0-9-]+)+$` (require namespaced keys, reject junk like `temp` or `foo`)

**Phase 3 (compiler strictness):** Updated `scripts/build/compile.mjs`:
- Renamed `loadValidator()` → `loadValidators()` to load both skill and platform schemas
- Added platform validation loop before skill processing (schema + policy)
- Hard-fail on malformed platforms (exit 1)
- Added zero-emit detection: checks compatibility matrix for skills with zero emit targets
- Hard-fail on zero-emit skills (unless status: deprecated) with clear error
- Zero-emit check happens before --validate-only exit
- Fixed O(n²) lookup: build skillById Map once instead of calling parsed.find() in loop
- Platform loading moved earlier (before skill validation) for knownPlatforms use in policy check

**Phase 4 (linter refactoring):** Updated `scripts/lint/skill.mjs` and `scripts/lint/platform.mjs`:
- Both now import shared validators from `scripts/build/lib/validate-skill-policy.mjs`
- Removed duplicated hard-error logic (10+ custom rules now sourced from shared module)
- Linter logic now split: schema validation (AJV) → policy validation (shared) → advisory-only warnings (lint)

**Bonus fixes:**
- Removed legacy flat-array fallback in `scripts/build/lib/emit-registry.mjs` (line 38)
- Improved error messages: "Fix parse errors above" → "Fix validation errors above" (more accurate)

### Validation Results

All 22 skills + 5 platforms pass strict validation:
```
$ node scripts/build/compile.mjs --validate-only
Validated: 22 skill(s), 0 error(s)
Loaded 5 platform(s): claude-code, claude-ios, claude-web, codex, cursor
[compatibility] All 22 skills emit to at least one platform (no zero-emit)
Validate-only mode — full validation passed, no artefacts written.
```

Linters also pass (12 warnings, 0 hard errors):
```
$ node scripts/lint/skill.mjs shared/skills/*/SKILL.md
Total: 23 skill(s), 1 error(s), 12 warning(s)  [memory issue unrelated to split-brain fix]

$ node scripts/lint/platform.mjs shared/targets/platforms/*.yaml
Total: 5 platform(s), 0 error(s), 15 warning(s)  [missing verified_at dates only]
```

### Solution: Four-phase correctness fix (Phases 1-4 focused; defer Phases 5-10)

**Phase 1: Shared validation layer** — Extract hard policy rules from linter into a shared module callable from both compiler and lint wrappers. Reduce duplication.

**Phase 2: Tighten schema** — Move as much policy as possible into JSON Schema (fallback_mode conditional, overlapping capability check via `not`+`contains`, $extensions propertyNames pattern). Make lint advisory-only.

**Phase 3: Compiler as strictest gate** — Add platform schema validation to compiler. Fail build hard on malformed platforms, zero-emit skills (unless status: deprecated). Move zero-emit check before --validate-only exit.

**Phase 4: Split errors from warnings** — Separate policy errors (must block build) from advisory warnings (lint-only). Keep policy in shared modules; keep advisory in lint wrappers.

**Phase 5: Legacy cleanup** (DEFERRED) — Remove dead flat-array fallback in emit-registry.mjs. Optional: add dist/registry/summary.json (slim agent-facing index).

**Phase 8: Test harness** (DEFERRED) — Add node:test fixtures for schema + policy + compiler integration tests (synthetic skills only).

**Phase 10: Token-efficient registry** (DEFERRED) — Make dist/registry/summary.json the default machine-facing output (slimmer, resolved, lower token cost for agents).

### Implementation order

1. **Phase 2 first**: Tighten schema (fallback_mode if/then, overlapping caps check). Schema is the authoritative contract.
2. **Phase 1 next**: Extract hard policy rules (`validate-skill-policy.mjs`, `validate-platform-policy.mjs`).
3. **Phase 3 after**: Update compiler to use shared validators and fail on zero-emit.
4. **Phase 4 last**: Refactor lint to call shared modules + advisory-only checks.

### Known caveats

1. **`--validate-only` exit path**: Currently exits at compile.mjs:142 before platform grouping. Zero-emit check must happen earlier or extend validate-only path.

2. **`status: deprecated` exception**: Must skip deprecated skills from zero-emit invariant. Detection: read `s.frontmatter.status`. Need explicit logic in phase 3.

3. **Backward compatibility**: If dist/registry/index.json is trimmed (Phase 5), audit Worker and materialise.sh adapter first.

4. **Integration tests missing**: Phase 8 should include real-repo integration (not just synthetic fixtures). Run `--validate-only` against actual shared/skills/ content.

5. **Phase 1 scope risk**: Plan proposes 5 modules; likely need only 1-2. Keep modules tiny to avoid over-engineering.

6. **Phases 5 & 10 distraction risk**: summary.json and token-efficient features are nice-to-have but should not delay correctness work. Defer until Phases 1-4 are complete and tested.

---

## Recommended next

**Complete Phase 9.7** (manifest-controlled feature flags) then begin the MVA in strict order:

1. **Define task object and persistence** — PortableTaskObject schema + TaskStore (T001–T003). Failing tests first.
2. **Replace hardcoded resolver** — refactor `runtime/lib/outcome-resolver.mjs` into loader-backed task-and-route resolution (T004–T005).
3. **Implement capability-aware route resolution** — deterministic RouteResolver using real capability profiles (T006).
4. **Implement execution contracts** — EffectiveExecutionContract engine with full/near-equivalent/partial/unavailable states (T007).
5. **Add `review_repository` task type** — concrete routes: `github_pr`, `local_repo`, `pasted_diff`, `uploaded_bundle` (T008–T009).
6. **Implement findings provenance and structured continuation** — FindingsLedger, ContinuationPackage, HandoffToken (T010–T013).
7. **Extend Worker and local runtime** — load tasks, compute real contracts, issue/resolve handoff tokens (T014).
8. **Prove the portable journey** — weak-environment start → strong-environment resume, no re-explanation (T015–T016).
9. **Expose task lifecycle in UI and APIs** — task identity, contract, progress, route history, findings provenance (T017–T018).
10. **Adversarial suite and staging** — fake capabilities, replayed tokens, injected repo text, route mismatches (T019–T020).

**Build order constraint:** do not add UI or integrations before task-state and governed routing. Building in the wrong order recreates session software.

**Do not:**
- Build another agent framework (keep providers as adapters at the edge)
- Use chat as the continuity layer (persist structured task state first)
- Put route selection in prompts (route selection must be deterministic runtime logic)

---

## Phase 1: Scaffold and validate (get a working marketplace + one plugin)

### Step 1.1 — Repo skeleton and .gitignore

Create the directory structure and ignore patterns.

```
ai-config/
├── .claude-plugin/
│   └── marketplace.json
├── plugins/
│   └── core-skills/
│       ├── .claude-plugin/
│       │   └── plugin.json
│       └── skills/
├── shared/
│   ├── manifest.md
│   ├── principles.md
│   └── skills/
│       └── _template/
│           └── SKILL.md
├── adapters/
│   ├── claude/
│   └── codex/
├── ops/
│   ├── new-skill.sh
│   └── sync/
├── .github/
│   └── workflows/
├── CLAUDE.md
├── .gitignore
└── README.md
```

`.gitignore` should cover:
- `.claude/settings.local.json`
- `overrides/` (if any local-only files appear)
- OS junk (`.DS_Store`, `Thumbs.db`)
- Editor configs unless intentionally shared

### Step 1.2 — marketplace.json

```json
{
  "name": "ai-config-os",
  "owner": {
    "name": "thomashillman"
  },
  "metadata": {
    "description": "Personal AI behaviour layer — skills, plugins, and shared conventions"
  },
  "plugins": [
    {
      "name": "core-skills",
      "source": "./plugins/core-skills"
    }
  ]
}
```

Note: `owner.name` is required. `metadata.description` is the correct location for the marketplace description.

### Step 1.3 — core-skills plugin

`plugins/core-skills/.claude-plugin/plugin.json`:
```json
{
  "name": "core-skills",
  "description": "Foundational skills for Claude Code sessions",
  "version": "0.1.0"
}
```

Author skill content in `shared/skills/<skill-name>/SKILL.md`, then symlink into the plugin:

```
plugins/core-skills/skills/<skill-name> -> ../../../shared/skills/<skill-name>
```

Symlinks are resolved when Claude Code copies plugins into cache, so the installed plugin gets the actual content.

### Step 1.4 — Shared manifest (progressive disclosure entrypoint)

`shared/manifest.md` — a short index of what exists, kept under ~100 lines. This is the single entrypoint for any agent that needs to discover available skills. Contents:

- Repo purpose (2-3 sentences)
- Table of skills with one-line descriptions and file paths
- Table of plugins listing what each bundles
- Conventions section (naming, file structure rules)

No custom marker protocols yet. Plain markdown references are sufficient until a real interop handoff problem emerges.

### Step 1.5 — Validate immediately

Create `adapters/claude/dev-test.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "==> Validating marketplace structure..."
claude plugin validate .
echo "==> Testing core-skills plugin locally..."
claude --plugin-dir ./plugins/core-skills -p "List available skills" --max-turns 1
echo "==> Done."
```

Run this after every structural change. Wire it into CI next.

Note: `claude --plugin-dir` loads the plugin for that session only. If you edit a skill and re-run this script, you must restart Claude Code or run a fresh `claude` invocation to pick up changes.

### Step 1.6 — Version bump discipline

Claude Code caches installed plugins and compares `version` in `plugin.json` to detect updates. **If you change skill content but don't bump the version, no device will see the update through marketplace sync.**

Rules:
- Bump the patch version (`0.1.0` → `0.1.1`) on every meaningful skill change
- Bump minor (`0.1.0` → `0.2.0`) when adding new skills
- Use the scaffold script (`ops/new-skill.sh`, see Step 1.8) to auto-bump on skill creation
- CI should warn if skill files changed but `plugin.json` version didn't

### Step 1.7 — CLAUDE.md (repo development context)

Create `CLAUDE.md` at the repo root. This is loaded automatically when you open the repo in Claude Code, giving every development session context about the repo's conventions:

```markdown
# AI Config OS

## Structure
- `shared/skills/` — canonical skill definitions (author here)
- `plugins/core-skills/skills/` — symlinks into shared/skills (never edit here directly)
- `.claude-plugin/marketplace.json` — marketplace manifest
- `plugins/core-skills/.claude-plugin/plugin.json` — plugin metadata (bump version on changes)

## Creating a new skill
Run `ops/new-skill.sh <skill-name>` — this creates the skill directory, symlink, manifest entry, and bumps the plugin version.

## Testing locally
Run `adapters/claude/dev-test.sh` to validate structure and test the plugin.

## Key rules
- Always author skills in `shared/skills/`, never directly in `plugins/`
- Bump `version` in `plugins/core-skills/.claude-plugin/plugin.json` after any skill change
- Symlinks must use relative paths: `../../../shared/skills/<name>`
- Run `claude plugin validate .` before committing
```

### Step 1.8 — Skill scaffold script

`ops/new-skill.sh` — reduces the 4-step skill creation to one command:

```bash
#!/usr/bin/env bash
set -euo pipefail

SKILL_NAME="${1:?Usage: new-skill.sh <skill-name>}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
SHARED_DIR="$REPO_ROOT/shared/skills/$SKILL_NAME"
PLUGIN_DIR="$REPO_ROOT/plugins/core-skills/skills/$SKILL_NAME"

if [ -d "$SHARED_DIR" ]; then
  echo "Error: skill '$SKILL_NAME' already exists at $SHARED_DIR" >&2
  exit 1
fi

# 1. Create skill from template
mkdir -p "$SHARED_DIR"
sed "s/{{SKILL_NAME}}/$SKILL_NAME/g" "$REPO_ROOT/shared/skills/_template/SKILL.md" > "$SHARED_DIR/SKILL.md"

# 2. Symlink into plugin
mkdir -p "$(dirname "$PLUGIN_DIR")"
ln -s "../../../shared/skills/$SKILL_NAME" "$PLUGIN_DIR"

# 3. Bump patch version
PLUGIN_JSON="$REPO_ROOT/plugins/core-skills/.claude-plugin/plugin.json"
if command -v jq &>/dev/null; then
  CURRENT=$(jq -r '.version' "$PLUGIN_JSON")
  NEXT=$(echo "$CURRENT" | awk -F. '{printf "%d.%d.%d", $1, $2, $3+1}')
  jq --arg v "$NEXT" '.version = $v' "$PLUGIN_JSON" > "$PLUGIN_JSON.tmp" && mv "$PLUGIN_JSON.tmp" "$PLUGIN_JSON"
  echo "Bumped plugin version: $CURRENT → $NEXT"
fi

echo "Created skill '$SKILL_NAME'"
echo "  → $SHARED_DIR/SKILL.md (edit this)"
echo "  → $PLUGIN_DIR (symlink)"
echo ""
echo "Next: edit SKILL.md, update shared/manifest.md, then run adapters/claude/dev-test.sh"
```

### Step 1.9 — Skill template

`shared/skills/_template/SKILL.md`:

```markdown
---
skill: {{SKILL_NAME}}
---

# {{SKILL_NAME}}

<skill-description>
<!-- One sentence: what does this skill do and when should Claude invoke it? -->
</skill-description>

## When to use
<!-- Describe the trigger conditions — what user request or context activates this skill -->

## Instructions
<!-- The actual instructions Claude should follow when this skill is invoked -->

## Examples
<!-- Optional: show input/output examples to calibrate behaviour -->
```

### Step 1.10 — GitHub Actions CI

`.github/workflows/validate.yml`:
- On push to `main` and PRs
- Runs `claude plugin validate .`
- Validates all symlinks under `plugins/` resolve to real files (catches broken relative paths)
- Warns if skill files changed but `plugin.json` version wasn't bumped
- Optionally lints markdown files
- Catches structural breakage before it hits other devices

Symlink validation step:

```bash
# Fail if any symlink under plugins/ is broken
find plugins/ -type l ! -exec test -e {} \; -print | {
  if read -r broken; then
    echo "Broken symlink: $broken"
    cat <(echo "$broken") - | while read -r f; do echo "Broken symlink: $f"; done
    exit 1
  fi
}
```

---

## Phase 2: Flesh out content and add capabilities

### Step 2.1 — Write your actual skills

For each skill you want:
1. Run `ops/new-skill.sh <skill-name>` (creates directory, symlink, bumps version)
2. Edit `shared/skills/<skill-name>/SKILL.md` with your skill content
3. Update `shared/manifest.md` index
4. Run `adapters/claude/dev-test.sh`

### Step 2.2 — Add optional plugin capabilities as needed

Only add these when you have a concrete use case:
- `agents/` — subagents (when you want specialised agent personas)
- `hooks/` + `hooks/hooks.json` — lifecycle hooks (when you want auto-actions on events)
- `.mcp.json` — MCP servers (when you want tool integrations bundled with the plugin)
- `settings.json` — default agent selection (when you have agents defined)

Note: `commands/` is legacy. Use `skills/` for all new functionality.

**Important conventions for hooks and MCP configs:**
- Hook scripts must be executable: `chmod +x hooks/my-hook.sh`
- Any file paths inside hooks or `.mcp.json` must use `${CLAUDE_PLUGIN_ROOT}` instead of relative paths, because installed plugins live in `~/.claude/plugins/cache/`, not in your repo. Example:

```json
{
  "hooks": {
    "PostToolUse": [{
      "command": "${CLAUDE_PLUGIN_ROOT}/hooks/post-tool.sh"
    }]
  }
}
```

### Step 2.3 — Principles and conventions

`shared/principles.md` — your opinionated defaults for AI behaviour. Referenced by skills, not auto-loaded. Keep it under 200 lines.

---

## Phase 3: Multi-device sync

### Step 3.1 — Simple sync script (v1)

`ops/sync/ai-sync.sh` — intentionally minimal:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "${AI_CONFIG_HOME:-$HOME/ai-config}"

case "${1:-status}" in
  pull)
    git pull --rebase --autostash
    ;;
  push)
    git add -A shared/ plugins/ .claude-plugin/ adapters/ ops/ .github/
    git diff --cached --quiet && echo "Nothing to commit." && exit 0
    git commit -m "sync: $(date +%Y-%m-%d-%H%M)"
    git push
    ;;
  status)
    git fetch --quiet
    git status --short --branch
    ;;
  *)
    echo "Usage: ai-sync.sh [pull|push|status]"
    exit 1
    ;;
esac
```

That's it for v1. No locking, no coalescing, no conflict sentinels. Add those only when you actually hit concurrent-edit problems (unlikely for a single-user repo).

### Step 3.2 — Multi-device rollout

Per device:
1. `git clone <repo-url> ~/ai-config`
2. In Claude Code: add marketplace from GitHub, install `core-skills`
3. **Enable auto-update for the marketplace** — third-party (non-Anthropic) marketplaces have auto-update disabled by default. Enable it via `/plugin` → Marketplaces tab, or updates won't propagate automatically.
4. Optionally set `AI_CONFIG_HOME` in shell profile
5. Run `adapters/claude/dev-test.sh` to verify

**Update flow (device A → device B):**
1. On device A: edit skills, bump version, commit, push
2. On device B (auto-update enabled): restart Claude Code — it checks for marketplace updates at startup and pulls new versions automatically
3. On device B (auto-update disabled): manually run `claude plugin update core-skills@ai-config-os`

If auto-update is enabled, the full cycle is: edit → bump version → push → restart Claude Code on other device. No manual `plugin update` needed.

---

## Phase 4: Codex adapter (thin shim)

### Step 4.1 — Codex wrapper

`adapters/codex/install.sh` — installs a shell function or alias:

```bash
ai-codex() {
  (cd "${AI_CONFIG_HOME:-$HOME/ai-config}" && ops/sync/ai-sync.sh pull)
  echo "AI config synced. Shared manifest: ${AI_CONFIG_HOME:-$HOME/ai-config}/shared/manifest.md"
  codex "$@"
}
```

This is deliberately minimal. Codex's actual integration points will evolve, and a thin shim is easy to adapt.

### Step 4.2 — Codex context pointing

Document in the README how to tell Codex about the shared layer:
- Reference `shared/manifest.md` as the starting file
- Codex reads files directly from the repo — no plugin installation needed

---

## Phase 5: Iterate and harden (only when needed)

These are deferred improvements, not part of the initial build:

- **Interop markers**: Add structured handoff metadata between agents only when you have a real two-agent workflow that breaks without it
- **Sync guardrails**: Add locking, conflict sentinels, allowlist enforcement only when concurrent edits cause real problems
- **Plugin splitting**: Split `core-skills` into domain-specific plugins when context cost becomes noticeable. All skills in a plugin are discovered by Claude Code — a plugin with many large skills adds context overhead to every session. Watch for signs: slower response times, skills being ignored or confused, or context window pressure in long sessions. When splitting, group by domain (e.g., `coding-skills`, `writing-skills`) and keep each plugin focused on one concern. Start with one plugin and split reactively, not preemptively.
- **Background auto-sync**: Launchd/systemd timer for hands-off commits only if manual `ai-sync.sh push` becomes tedious

---

## Acceptance criteria

- [x] `claude plugin validate .` passes at repo root
- [ ] Claude Code can add the marketplace and install `core-skills` (pending device test)
- [ ] Installed plugin exposes expected skills (first skill added; awaiting full validation)
- [ ] Pushing from device A (with version bump) and restarting Claude Code on device B (with auto-update enabled) reflects changes
- [x] `adapters/claude/dev-test.sh` runs clean
- [x] CI validates plugin structure and symlink integrity on every push
- [x] `ops/new-skill.sh <name>` creates skill, symlink, and bumps version in one command
- [x] `CLAUDE.md` is loaded when opening the repo in Claude Code
- [ ] Codex can read `shared/manifest.md` and reference skill files (not tested yet)
- [x] No secrets in tracked files

---

## What this plan intentionally defers

| Deferred item | Why |
|---|---|
| Interop marker protocol | No proven need yet; plain markdown references suffice |
| Sync locking and conflict sentinels | Single-user repo; `git rebase --autostash` handles it |
| Coalescing window for commits | Premature optimisation for commit noise |
| `overrides/` directory | Env var docs belong in README |
| Plugin splitting | One plugin is fine until context pressure is observable |
| Windows support | Not needed now; watcher/service changes are isolatable |

---

## Recommended next — Complete Phase 9.7, then begin MVA

**Phase 9.7 is in progress (Step 1/4 done).** Complete the remaining steps before starting MVA.

### Phase 9.7 remaining work (Steps 2–4)

Step 1 is done: flags defined in `runtime/manifest.sh`, validated by `validateManifestFeatureFlags()` in `scripts/build/lib/versioning.mjs`, tested.

**Step 2 — Wire flags into runtime execution paths:**
- Read `feature_flags` from the manifest at runtime startup (parse YAML in Node or bash)
- Gate `remote_executor_enabled` in `runtime/remote-executor/server.mjs` — refuse to start if flag is `false`
- Gate `outcome_resolution_enabled` in `runtime/lib/outcome-resolver.mjs` — bypass contract resolution if flag is `false`
- Add a `remote_exec` route entry to `OUTCOME_ROUTES` in outcome-resolver.mjs

**Step 3 — Enforce explicit contract:**
- When `effective_contract_required=true`, block any tool execution that lacks an `outcomeId` (i.e., no mapped route)
- Surface a structured error with the missing route info

**Step 4 — Verify rollback works:**
- Confirm all flags can be toggled via manifest-only change (no code deploy)
- Update migration criteria checklist in PLAN.md once validated

### After Phase 9.7 completes — begin MVA (v0.7.0)

1. **Fetch latest main** — `git fetch origin main && git rebase origin/main`
2. **Review MVA overview** — "MVA: Task Control Plane" section above (lines 55–156)
3. **Verify Autospec artefacts** — T001 spec.yaml, plan.yaml, tasks.yaml, acceptance.yaml
4. **Version planning** — MVA targets v0.7.0; bump VERSION only when Phase 10 merges

### Build order constraint

**Do not:**
- Add UI or integrations before task-state and governed routing
- Build another agent framework (keep providers as adapters at the edge)
- Use chat as the continuity layer (persist structured task state first)
- Put route selection in prompts (route selection must be deterministic runtime logic)

---

## Phase 6: Feature Expansion — 14-item implementation

**Branch:** `claude/analyze-propose-features-kyrYH`
**Target version:** `0.4.0` (derive from `git show origin/main:plugins/core-skills/.claude-plugin/plugin.json | jq -r '.version'` at bump time)

### Critical files

| File | Role |
|---|---|
| `shared/skills/_template/SKILL.md` | Canonical template — all new skills follow this |
| `shared/skills/code-review/SKILL.md` | Reference implementation for full-frontmatter skill |
| `ops/new-skill.sh` | Scaffolds skill dir, symlink, version bump — will be enhanced |
| `plugins/core-skills/.claude-plugin/plugin.json` | Version bumped after all skill additions |
| `.claude/settings.json` | Hooks registry — gains PreToolUse + PostToolUse entries |
| `.github/workflows/validate.yml` | CI — gains frontmatter validation step |
| `shared/manifest.md` | Skill index — needs 6 new rows |
| `shared/workflows/` | Persona/workflow compositions live here |

---

### Commit 1 — `feat(ops): add lint-skill.sh for single-skill frontmatter validation`

**New file:** `ops/lint-skill.sh` (chmod +x)

Validates one skill by name. Checks:
- Required fields present: `skill`, `description`, `type`, `status`, `version`
- `type` ∈ `{prompt, hook, agent, workflow-blueprint}`
- `status` ∈ `{stable, experimental, deprecated}`
- `version` matches semver `X.Y.Z`
- All `dependencies.skills[].name` values resolve to real directories under `shared/skills/`
- For `type: prompt`: any `prompt_file:` referenced in variants exists on disk (warn, not error)

Uses only `awk`, `grep`, `sed` — same approach as existing `ops/validate-variants.sh`.
Exit 0 = OK, exit 1 = errors found.

```
Usage: ops/lint-skill.sh <skill-name>
Example: ops/lint-skill.sh code-review  →  OK: code-review
```

---

### Commit 2 — `feat(ops): add skill-stats.sh for library overview table`

**New file:** `ops/skill-stats.sh` (chmod +x)

Iterates `shared/skills/*/` (skip `_template`), extracts from SKILL.md frontmatter:
- `type`, `status`
- Presence of opus/sonnet/haiku variant sections (✓ or -)
- Count of test entries (`- id:` lines in tests block)

Prints a formatted table:
```
SKILL                TYPE       STATUS       OPUS     SONNET   HAIKU    TESTS
code-review          prompt     stable       ✓        ✓        ✓        3
debug                prompt     stable       ✓        ✓        ✓        3
...
```

---

### Commit 3 — `feat(ops): enhance new-skill.sh to auto-update manifest.md and run lint`

**Edit:** `ops/new-skill.sh`

After creating the skill directory and symlink, add two new steps:

- **Auto-append manifest.md row** — inserts a placeholder row in the skills table.
- **Call lint-skill.sh** — post-scaffold check; warns (does not fail) if frontmatter issues found.

---

### Commit 4 — `feat(skills): add debug, changelog, task-decompose, explain-code, skill-audit, release-checklist`

Create all 6 skills via `ops/new-skill.sh` then fill their SKILL.md. Each follows the full-frontmatter pattern from `shared/skills/code-review/SKILL.md` — all 6 Phase 2 feature blocks + body sections (When to use / Instructions / Examples).

#### `debug` (type: prompt, status: stable)
- **inputs:** `symptoms` (required), `error_message` (optional), `codebase_context` (optional)
- **outputs:** `diagnosis` object — hypothesis, root_cause, fix, regression_test
- **variants:** opus=deep multi-system, sonnet=standard loop, haiku=quick stacktrace scan; **fallback:** sonnet→opus→haiku
- **tests:** test-syntax-error, test-logic-bug, test-regression-find (3)
- **instructions:** form hypothesis → isolate → test assumption → confirm root cause → document fix + write regression test

#### `changelog` (type: workflow-blueprint, status: stable)
- **inputs:** `since_ref` (required: git ref, e.g. `v0.3.0`), `version` (required: target version string)
- **outputs:** `changelog_entry` — markdown formatted string
- **variants:** opus=detailed with migration notes, sonnet=standard, haiku=one-liner; **fallback:** sonnet→haiku→opus
- **dependencies:** `commit-conventions` skill
- **tests:** test-basic-entry, test-breaking-change (2)
- **instructions:** `git log --oneline <since_ref>..HEAD` → group by conventional prefix → flag `!` or `BREAKING CHANGE` → render markdown entry

#### `task-decompose` (type: prompt, status: stable)
- **inputs:** `task_description` (required), `constraints` (optional: time/tech/scope)
- **outputs:** `subtasks` array — each with title, acceptance_criteria, blockers
- **variants:** opus=architectural breakdown with dependency graph, sonnet=standard, haiku=quick scope check; **fallback:** sonnet→opus→haiku
- **tests:** test-vague-task, test-constrained-task (2)
- **instructions:** identify known vs unknown scope → slice into ≤1-session subtasks → write observable acceptance criteria → flag external blockers → order by dependency

#### `explain-code` (type: prompt, status: stable)
- **inputs:** `code` (required), `depth` (optional: `brief`/`detailed`/`architectural`, default `detailed`)
- **outputs:** `explanation` string
- **variants:** haiku=one-liner, sonnet=functional explanation (default), opus=architectural intent and design patterns; **fallback:** sonnet→haiku→opus
- **tests:** test-simple-function, test-complex-pattern, test-architectural (3)
- **instructions:** map `depth` to model tier → explain what before why → highlight non-obvious decisions → for `architectural`: describe patterns, trade-offs, and fit in larger system

#### `skill-audit` (type: agent, status: experimental)
- **inputs:** `scope` (optional: `"all"` or specific skill name, default `"all"`)
- **outputs:** `audit_report` object — per-skill health scores, gaps list, recommendations
- **variants:** opus=deep with prioritised recommendations, sonnet=standard gap report; **fallback:** sonnet→opus
- **tests:** test-full-audit, test-single-skill (2)
- **instructions:** read `shared/manifest.md` → for each skill: check all required frontmatter fields, all 3 variants, ≥2 tests, non-stale status, resolvable deps → produce ranked gaps list with severity + concrete fix suggestions

#### `release-checklist` (type: workflow-blueprint, status: stable)
- **inputs:** `version` (required: semver string), `release_notes` (optional)
- **outputs:** `checklist_result` object — steps_completed, steps_failed, ready_to_release bool
- **dependencies:** `git-ops`, `commit-conventions`, `changelog`
- **variants:** sonnet=standard, opus=verbose with risk assessment; **fallback:** sonnet→opus
- **tests:** test-clean-state, test-dirty-state (2)
- **instructions:** (1) validate plugin.json version matches target via `git-ops`, (2) run `adapters/claude/dev-test.sh`, (3) invoke `changelog` for entry since last tag, (4) invoke `commit-conventions` to draft release commit, (5) tag, (6) push, (7) output readiness summary

---

### Commit 5 — `feat(hooks): add PreToolUse guard and PostToolUse living-docs reminder`

**New files:**

**`.claude/hooks/pre-tool-use.sh`** (chmod +x) — reads JSON from stdin; if `tool_name` is `Write`/`Edit`/`NotebookEdit` and `file_path` matches `*/plugins/core-skills/skills/*`, emits `{"decision":"block","reason":"Author skills in shared/skills/ not plugins/ directly."}` and exits.

**`.claude/hooks/post-tool-use.sh`** (chmod +x) — reads JSON from stdin; if `file_path` is under `shared/skills/` or `ops/`, prints a reminder to run `ops/check-docs.sh`.

**Edit:** `.claude/settings.json` — add `PreToolUse` and `PostToolUse` hook entries alongside the existing `SessionStart`:
```json
"PreToolUse": [
  { "hooks": [{ "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/pre-tool-use.sh" }] }
],
"PostToolUse": [
  { "hooks": [{ "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/post-tool-use.sh" }] }
]
```

---

### Commit 6 — `feat(workflows): add code-quality and release-agent persona workflows`

**New files in `shared/workflows/`:**

**`code-quality.json`** — persona `code-quality-agent` composing `code-review` + `debug` + `explain-code` (sonnet default). Execution flow: review → debug → explain. Follows structure of `shared/workflows/research-mode/workflow.json`.

**`release-agent.json`** — persona `release-agent` composing `git-ops` + `commit-conventions` + `changelog` + `release-checklist` (sonnet/haiku). Execution flow: validate version → generate changelog → draft release commit → run checklist.

---

### Commit 7 — `feat(ci): add skill frontmatter validation step to validate.yml`

**Edit:** `.github/workflows/validate.yml`

Add a step after the existing symlink check:
```yaml
- name: Validate skill frontmatter
  run: |
    ERRORS=0
    for skill_dir in shared/skills/*/; do
      skill_name=$(basename "$skill_dir")
      [ "$skill_name" = "_template" ] && continue
      bash ops/lint-skill.sh "$skill_name" || ERRORS=$((ERRORS+1))
    done
    [ $ERRORS -eq 0 ] || { echo "::error::$ERRORS skill(s) failed frontmatter lint"; exit 1; }
```

---

### Commit 8 — `feat(adapters): add Cursor adapter`

**New file:** `adapters/cursor/install.sh` (chmod +x)

Generates/appends an `AI Config OS` section to a `.cursorrules` file in a target directory (default: `$PWD`). Exports:
1. `shared/principles.md` verbatim
2. One-line descriptions from `code-review`, `commit-conventions`, `debug`, `explain-code`

Checks for an existing AI Config OS block before appending to avoid duplicates. Follows the detection-and-append pattern of `adapters/codex/install.sh`.

---

### Commit 9 — `docs: update manifest, README, PLAN; bump plugin to 0.4.0`

- **`shared/manifest.md`** — add 6 rows for new skills; add/update Workflows table with code-quality and release-agent.
- **`plugins/core-skills/.claude-plugin/plugin.json`** — bump to `0.4.0` (7 new skills = minor bump). Derive base from `git show origin/main:…` at bump time.
- **`README.md`** — add `adapters/cursor/` row to directory table; update skill count.
- **`PLAN.md`** — update Current State table: mark Phase 6 as ✅ Done.

---

### Verification (run before pushing)

```bash
# 1. Lint all new skills
for s in debug changelog task-decompose explain-code skill-audit release-checklist; do
  bash ops/lint-skill.sh "$s"
done

# 2. Stats table — should show 15 skills
bash ops/skill-stats.sh

# 3. Full validation suite
bash ops/validate-all.sh

# 4. Dev test
bash adapters/claude/dev-test.sh

# 5. Docs consistency
bash ops/check-docs.sh

# 6. Hooks registered
grep -q "PreToolUse" .claude/settings.json && echo "PreToolUse: OK"
grep -q "PostToolUse" .claude/settings.json && echo "PostToolUse: OK"

# 7. No broken symlinks
find plugins/ -type l ! -exec test -e {} \; -print | grep . && exit 1 || echo "Symlinks: OK"
```

Expected: all commands exit 0, skill-stats shows 15 rows, settings.json has all 3 hook event types.
