# Codebase Analysis (Ongoing)

This document captures an ongoing understanding of the repository, starting from `README.md` and then extending into runtime, MCP server, dashboard, worker, and test architecture.

## 1) What this project is

AI Config OS is a **skill + plugin + runtime configuration platform** for AI agent tools (Claude Code first, with Cursor/Codex compatibility modeling). It centralizes prompts/skills, compiles portable distributions, and provides runtime desired-state sync plus an optional dashboard.

## 2) Core architecture

The repository follows a **source → compile → distribution** model:

- Canonical skill source is maintained under `shared/skills/`.
- A Node-based compiler validates skill metadata and platform compatibility.
- Build output is emitted to `dist/clients/<platform>/` and `dist/registry/index.json`.
- Output is intended to be deterministic and source-independent.

The compiler (`scripts/build/compile.mjs`) enforces strict policies:

- Schema validation for both skills and platforms.
- Policy validation for non-schema constraints.
- Compatibility resolution per skill/platform pair.
- Hard-fail on “zero-emit” non-deprecated skills.

## 3) Major subsystems

### Skill authoring + packaging

- `shared/skills/`: canonical skill definitions.
- `schemas/`: JSON schema validation for skill/platform docs.
- `scripts/build/`: compile, validation, emitters, registry generation, version parity tooling.

### Runtime desired-state layer

- `runtime/config/`: global/machine/project layered config.
- `runtime/adapters/`: tool-specific adapters.
- `runtime/sync.sh`: applies desired config.
- `runtime/watch.sh`: change-driven sync loop.

### MCP server

- `runtime/mcp/start.sh` launches `runtime/mcp/server.js` (installs dependencies if missing).
- Exposes runtime operations to agent tooling.

### Dashboard

- `dashboard/`: React SPA for tools, skills, context cost, config, audit, analytics views.
- Uses MCP/API endpoint from runtime server (documented default: port 4242).

### Distribution API

- `worker/`: Cloudflare Worker for serving compiled bundles/registry.

## 4) Developer workflow

- Validate build and compatibility:
  - `npm run validate` (validate-only compile pass)
- Build artifacts:
  - `npm run build`
- Tests:
  - `npm test` (build test runner)
- Claude plugin checks:
  - `bash adapters/claude/dev-test.sh`

The project expects conventional commits and version discipline around the root `VERSION` file.

## 5) Runtime internals (deeper pass)

### Sync pipeline

`runtime/sync.sh` orchestrates runtime reconciliation in this order:

1. Create an immutable merged config snapshot via `shared/lib/config-merger.sh`.
2. Ensure manifest exists (`runtime/manifest.sh init`).
3. Show desired-vs-installed diff (`runtime/manifest.sh diff`).
4. Apply MCP desired state (`runtime/adapters/mcp-adapter.sh sync`).
5. Check CLI presence (`runtime/adapters/cli-adapter.sh sync`).
6. Update `runtime/manifest.yaml` sync timestamp.

Notable behavior:
- Supports `--dry-run` and `--verbose`.
- Fails fast when config merge or MCP sync fails.
- Uses manifest updates for runtime visibility.

### Manifest state management

`runtime/manifest.sh` provides `init/read/update/diff/status` commands and includes:

- Lock-file based mutual exclusion (`/tmp/ai-config-os-manifest.lock`) to reduce concurrent write races.
- Atomic writes through temp-file + move semantics.
- Per-tool status tracking with timestamps.

### MCP adapter

`runtime/adapters/mcp-adapter.sh` writes desired MCP servers to `~/.claude/mcp.json` (or `CLAUDE_MCP_CONFIG` override):

- Uses jq/yq for deterministic object construction.
- Treats config as desired-state replacement (`.mcpServers = desired`).
- Supports CRUD-like helper commands (`list`, `add`, `remove`) plus sync-oriented guidance for enable/disable.

### CLI adapter

`runtime/adapters/cli-adapter.sh` performs presence checks only (no installs):

- Reads CLI command mappings from `runtime/tool-registry.yaml`.
- Caches command lookups per run in `/tmp` for efficiency.
- Exposes `check/list/sync` commands, where `sync` delegates to list/status reporting.

## 6) MCP server + dashboard API shape

`runtime/mcp/server.js` hosts two interfaces:

1. MCP stdio tools (`sync_tools`, `list_tools`, `get_config`, `skill_stats`, `context_cost`, `validate_all`, `mcp_list`, `mcp_add`, `mcp_remove`).
2. Express API endpoints for dashboard (`/api/manifest`, `/api/skill-stats`, `/api/context-cost`, `/api/config`, `/api/analytics`, `/api/sync`, `/api/validate-all`).

Recent structure indicates intentional extraction for testability and safety:

- `runtime/mcp/handlers.mjs` centralizes tool dispatch with dependency injection.
- `runtime/mcp/validators.mjs` isolates input validation helpers.
- `runtime/mcp/path-utils.mjs` validates script path boundaries before execution.
- `runtime/mcp/tool-response.mjs` standardizes success/error response shaping.

This split improves unit-test coverage while keeping `server.js` primarily as wiring/orchestration.

## 7) Dashboard architecture (frontend)

The dashboard is a lightweight React SPA:

- `App.jsx` manages tab state and sets a fixed API base (`http://localhost:4242/api`).
- Tab components are mostly thin data-fetch + render wrappers.
- `ToolsTab` exposes dry-run and apply sync actions.
- `SkillsTab` parses tabular output from shell script responses.
- `AuditTab` triggers full validation and streams raw output.

Design implication: frontend remains intentionally simple and shell-output driven, with formatting logic in UI components.

## 8) Worker distribution architecture

`worker/src/index.ts` provides authenticated read-only distribution endpoints:

- Bearer-token authentication with primary/next-token rotation support.
- Registry and plugin metadata are imported from built `dist/` artifacts.
- Routes include health, latest manifest, client bundle metadata, and per-skill lookup.
- CORS preflight and JSON helpers are built in.

This matches the portability contract by serving built artifacts rather than source data.

## 9) Test strategy and quality gates

The repository has a contract-heavy test approach (`scripts/build/test/README.md`):

- Contract suites enforce canonical source, delivery, materialization, reproducibility, and security constraints.
- Implementation suites validate compiler, emitters, adapters, schema, and versioning behavior.
- The test runner serializes file-level test execution (`--test-concurrency=1`) to avoid shared `dist/` races.

## 10) Current maturity snapshot

- Claude Code: production-grade emitter + runtime support.
- Cursor: partial emitter support.
- codex / claude-web / claude-ios: compatibility model exists, operational integration limited.

## 11) Immediate orientation recommendations for contributors

1. Start with `README.md`, `CLAUDE.md`, and `PLAN.md` for conventions and roadmap.
2. Read `scripts/build/compile.mjs` and one platform emitter to understand contracts.
3. Read `runtime/sync.sh` + `runtime/manifest.sh` before changing runtime behavior.
4. Run `npm run validate` before and after metadata changes.
5. Run targeted test suites related to changed contract areas.

## 12) Verified in this pass

- Compiler validation pipeline executes successfully in `--validate-only` mode.
- Repository currently reports 22 skills and 5 platform definitions during validation.

## 13) Backlog completion notes (this pass)

### Build library internals (`scripts/build/lib/*`)

Key module responsibilities are now clear and deliberately separated:

- `parse-skill.mjs`: strict SKILL.md frontmatter extraction (`---` blocks), YAML parse, and body extraction.
- `validate-skill-policy.mjs`: non-schema policy checks (legacy capability format ban, platform override validation, hook-platform exclusion requirements).
- `load-platforms.mjs` + `resolve-compatibility.mjs`: load platform capability definitions and compute per-skill compatibility matrix used by emitters and registry.
- `emit-claude-code.mjs`: copies complete skill trees into `dist/clients/claude-code/skills/*` and emits plugin metadata with optional provenance fields.
- `emit-cursor.mjs`: composes a self-contained `.cursorrules` payload, including degraded-mode notes when capabilities do not fully map.
- `emit-registry.mjs`: emits cross-platform registry index (metadata + compatibility map).
- `select-emitted-platforms.mjs`: ensures registry only claims platforms with real emitters.
- `versioning.mjs`: canonical VERSION reading/validation + optional build provenance derivation.
- `materialise-client.mjs`: security-hardened package extraction with path traversal and boundary checks.

Architecture pattern: compiler orchestration in `compile.mjs`, with pure/small helpers in `lib/` supporting both production code and targeted tests.

### Config merger behavior (`shared/lib/config-merger.sh`)

Observed merge semantics:

- Three-tier precedence: `global.yaml` < `machines/<hostname>.yaml` < `project.yaml`.
- Uses yq merge operator for general keys with explicit field-level merge logic for `mcps` maps.
- Hard-fails when `global.yaml` is missing or yq is unavailable.
- Optional `--debug` mode logs merge stages to stderr.

Implication: runtime sync works against a deterministic merged snapshot and avoids in-place source config mutation.

### Runtime prerequisites (`runtime/mcp/runtime-prereqs.mjs`)

- MCP runtime currently requires `bash` on PATH.
- Check logic is dependency-injection-friendly (`assertRuntimePrereqsWith(execFn)`) for unit tests.
- Failure message explicitly distinguishes cross-platform build/test support from Unix-like runtime execution assumptions.

### Adapters (`adapters/*`)

- `adapters/claude/materialise.sh` supports worker fetch/status and local extraction using the Node materialiser CLI, with cache fallback semantics (`~/.ai-config-os/cache/claude-code`).
- `adapters/cursor/install.sh` appends a one-time AI Config OS block to `.cursorrules`, avoiding duplicate inserts.
- `adapters/codex/install.sh` installs a shell wrapper function (`ai-codex`) that syncs config before launching Codex.

These adapters are intentionally lightweight UX wrappers around core runtime/build primitives.

### CI policy mapping (`.github/workflows/*`)

- `build.yml` is the main contract gate: version parity, lint, full tests, validate-only compile, full compile, release/provenance compile (Linux), and dist self-sufficiency checks for cursor/registry/claude-code artifacts across OS matrix.
- `validate.yml` provides structural checks: symlink integrity, per-skill frontmatter lint loop, runtime registry/config validation, and PR warnings for likely doc/version drift.

Together they encode a two-layer policy model: hard build contracts + softer contribution hygiene warnings.

## 14) Backlog completion notes (final pass)

### Lint rules and overlap (`scripts/lint/*`)

- `scripts/lint/skill.mjs` composes three validation layers: YAML/frontmatter parse checks, AJV schema validation (`schemas/skill.schema.json`), and shared custom policy checks via `validateSkillPolicy` from build libs.
- This reuse means compiler and linter share core hard rules, while lint adds advisory warnings (stale platform evidence, fallback notes, mutation-description mismatch) that do not block build unless promoted.
- `scripts/lint/platform.mjs` mirrors the same schema+policy structure for platform YAML and adds warning-level evidence freshness checks.

Conclusion: lint and compiler are intentionally overlapping for correctness, with lint carrying additional human-oriented quality signals.

### Worker deployment assumptions (`worker/wrangler.toml` + package scripts)

- Worker deploy target is pinned in `worker/wrangler.toml` (`name`, `main`, `compatibility_date`) and expects secrets (`AUTH_TOKEN`, optional `AUTH_TOKEN_NEXT`) provisioned through Wrangler.
- Runtime environment marker is injected via `[vars] ENVIRONMENT = "production"`.
- Deployment scripts (`worker/package.json`) are direct wrangler wrappers (`dev`, `deploy`, `deploy:dry`) with no custom release orchestration inside `worker/` itself.
- Inline comments confirm worker bundles `dist/` artefacts at deploy time, so compile/build must run first for correct payload freshness.

### Dashboard tab robustness (`dashboard/src/tabs/*`)

- `ToolsTab`, `SkillsTab`, `AuditTab`, and `AnalyticsTab` include `.catch(...)` fallbacks for failed fetches and expose basic loading states.
- `ContextCostTab` and `ConfigTab` currently do **not** include fetch error handlers; they can remain indefinitely on "Loading..." on network/API failure.
- `SkillsTab` parses fixed-width textual output (`ops/skill-stats.sh` table) rather than structured JSON, creating a tighter coupling to formatting changes.

Conclusion: dashboard is intentionally lightweight but has uneven error UX; two tabs could be hardened without architecture changes.

### Machine config conventions (`runtime/config/machines/*`)

- The directory is present with `.gitkeep`, indicating machine-specific configs are expected to be local and usually uncommitted.
- Effective convention is documented by `shared/lib/config-merger.sh` and config examples: merge key is hostname (`runtime/config/machines/<hostname>.yaml`) between global and project layers.
- `runtime/config/project.yaml.example` clarifies precedence and field-level merge behavior for `mcps` vs last-writer-wins for other top-level sections.

Conclusion: machine onboarding pattern exists implicitly via merge logic and examples, but could be made more explicit in user-facing docs if team usage expands.

## 15) Updated remaining analysis backlog

The originally listed backlog items are now covered. Optional future deep-dives (non-blocking):

- Add a compact architecture diagram in `docs/` tying compile/runtime/worker data flow together.
- Validate dashboard/API contract stability by migrating shell-table responses to JSON for `skill-stats`.
- Document a recommended release runbook combining compile, worker deploy, and token rotation steps.

