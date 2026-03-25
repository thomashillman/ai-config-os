# Support Status (Canonical)

Last verified: 2026-03-24

This file is the primary documentation reference for **what is supported today**. If another doc disagrees, confirm against implementation and automated checks (tests/scripts) before treating either claim as authoritative.

## 1) Supported platforms today

### Runtime-managed surfaces (actively managed by runtime sync/status)

| Surface | Status today | Evidence |
|---|---|---|
| `claude-code` | Supported | `runtime/tool-registry.yaml` includes `claude-code` in runtime tool inventory. (`runtime/sync.sh` consumes this registry through adapters.) | `runtime/tool-registry.yaml`, `runtime/sync.sh`, `runtime/adapters/cli-adapter.sh` |
| `cursor` | Supported | `runtime/tool-registry.yaml` includes `cursor`; registry path points to `.cursorrules` for local status checks. | `runtime/tool-registry.yaml`, `runtime/adapters/file-adapter.sh` |
| `codex` | Supported | `runtime/tool-registry.yaml` includes `codex`; runtime checks presence only (no installer in sync path). | `runtime/tool-registry.yaml`, `runtime/adapters/cli-adapter.sh` |

### Compile-known surfaces (compatibility modeled in compiler)

| Surface class | Status today | Evidence |
|---|---|---|
| Surfaces in `shared/targets/platforms/*.yaml` | Supported for compatibility resolution | Compiler loads platform definitions from this folder and resolves compatibility against them. | `scripts/build/lib/load-platforms.mjs`, `shared/targets/platforms/claude-code.yaml` |
| Artifact-emitting surfaces (`claude-code`, `cursor`, `codex`) | Supported for distributable build outputs | Compiler emitter registry only marks these 3 as emitting artifacts. | `scripts/build/compile.mjs`, `scripts/build/lib/select-emitted-platforms.mjs` |
| Non-emitting modeled surfaces (for example `claude-web`, `claude-ios`, `claude-ssh`, CI targets) | Compile-only modeling; no emitted client package | Compile logs these as "emitter not yet implemented — skipping" when compatibility exists but no emitter exists. | `scripts/build/compile.mjs`, `shared/targets/platforms/claude-web.yaml` |

## 2) Runtime-managed vs compile-only surfaces

| Category | What is true today | Evidence |
|---|---|---|
| Runtime-managed | Runtime sync/status operates on the tool registry (`claude-code`, `cursor`, `codex`) and adapter flows. | `runtime/tool-registry.yaml`, `runtime/sync.sh`, `runtime/adapters/mcp-adapter.sh` |
| Compile-only | Compiler models a larger platform matrix than runtime manages; only emitting platforms produce `dist/clients/*` artifacts. | `scripts/build/lib/load-platforms.mjs`, `scripts/build/compile.mjs` |

## 3) Marketplace/install reality

| Claim | Status today | Evidence |
|---|---|---|
| Claude marketplace entry exists for this repo | Supported | Root marketplace declares one plugin source (`core-skills`). | `.claude-plugin/marketplace.json` |
| Installable plugin metadata for `core-skills` exists | Supported | Plugin name/version live in plugin metadata. | `plugins/core-skills/.claude-plugin/plugin.json` |
| Cursor installer exists | Supported | Installer script is present. | `adapters/cursor/install.sh` |
| Codex installer exists | Supported | Installer script is present. | `adapters/codex/install.sh` |
| Runtime sync performs tool installation | Not supported today | Sync flow validates and syncs config/state; `cli-adapter` explicitly says no installation performed; file adapter sync is currently a no-op. | `runtime/sync.sh`, `runtime/adapters/cli-adapter.sh`, `runtime/adapters/file-adapter.sh` |

## 4) Sync reality

| Sync area | Status today | Evidence |
|---|---|---|
| Config merge + manifest updates | Supported | `runtime/sync.sh` merges config, runs subsystem, updates manifest statuses and last sync timestamp. | `runtime/sync.sh`, `runtime/manifest.sh` |
| MCP server config sync (`~/.claude/mcp.json`) | Supported | MCP adapter rewrites `mcpServers` from merged config. | `runtime/adapters/mcp-adapter.sh` |
| CLI tool presence verification | Supported | CLI adapter checks command availability and reports status. | `runtime/adapters/cli-adapter.sh` |
| File-based tool sync automation | Limited / mostly no-op | File adapter `sync` currently reports no file-based tools requiring sync. | `runtime/adapters/file-adapter.sh` |

## 5) Dashboard/runtime feature support

| Feature surface | Status today | Evidence |
|---|---|---|
| Dashboard tabs: Tasks, Tools, Skills, Context Cost, Config, Audit, Analytics, Bootstrap Runs | Supported | Tab registry and routing are defined in App UI. | `dashboard/src/App.jsx` |
| Dashboard API endpoints (manifest, skill stats, context cost, config, analytics, skill analytics, autoresearch runs, tools install/sync/status) | Supported | Endpoints are wired in dashboard API server and contract-tested. | `runtime/mcp/dashboard-api.mjs`, `runtime/mcp/dashboard-api.test.mjs` |
| Runtime MCP server with dashboard wiring and security guardrails | Supported | MCP server composes runtime prereqs, tunnel policy, and dashboard API. | `runtime/mcp/server.js`, `runtime/mcp/runtime-prereqs.mjs`, `runtime/mcp/tunnel-security.mjs` |
| Worker task-control-plane endpoints for portable tasks | Supported | Worker router and tests cover task operations (`/v1/tasks` etc.). | `worker/src/router.ts`, `scripts/build/test/worker-contract.test.mjs` |

---

## Doc policy

- `README.md` and `PLAN.md` should link to this file for current support truth.
- Roadmap ambition stays in `PLAN.md`; present-tense support claims belong here with evidence.

- Deterministic wording policy and enforcement roadmap are tracked in `docs/agent-doctrine-enforcement.md`.
