# Build Pipeline Research

## Scope

- Primary entry point: `scripts/build/compile.mjs`
- Supporting modules:
  - `scripts/build/lib/parse-skill.mjs`
  - `scripts/build/lib/load-platforms.mjs`
  - `scripts/build/lib/load-definitions.mjs`
  - `scripts/build/lib/resolve-compatibility.mjs`
  - `scripts/build/lib/emit-claude-code.mjs`
  - `scripts/build/lib/emit-cursor.mjs`
  - `scripts/build/lib/emit-registry.mjs`
  - `scripts/build/lib/emit-runtime.mjs`
  - `scripts/build/lib/select-emitted-platforms.mjs`
  - `scripts/build/lib/versioning.mjs`

## Executive Summary

The build pipeline is a deterministic compiler, not a loose collection of packaging scripts. Its job is to turn canonical source definitions into self-sufficient emitted packages and machine-readable manifests.

At a high level:

1. Read canonical inputs from `shared/`, `schemas/`, `runtime/`, and `VERSION`.
2. Validate platforms, routes, outcomes, and skills.
3. Resolve per-skill compatibility against per-platform capabilities.
4. Fail hard if non-deprecated skills emit nowhere.
5. Emit only for platforms with implemented emitters.
6. Write distribution artifacts to `dist/`.
7. Write registry and runtime metadata for downstream consumers.

## Canonical Inputs

### Skills

Source of truth:

- `shared/skills/*/SKILL.md`

Read by:

- `parse-skill.mjs`

Important behavior:

- YAML frontmatter is mandatory
- body is preserved for platform emitters
- skill directories are sorted for reproducibility
- directories prefixed with `_` are skipped

### Platform definitions

Source of truth:

- `shared/targets/platforms/*.yaml`

Read by:

- `load-platforms.mjs`

Important behavior:

- file list is sorted
- `id` must match filename
- missing platform directory is fatal

### Route and outcome definitions

Source of truth:

- `shared/routes/*.yaml`
- `shared/outcomes/*.yaml`

Read by:

- `load-definitions.mjs`

Important behavior:

- IDs must match filenames
- YAML parse failures are collected as explicit errors

### Schemas and policy sources

Validation inputs:

- `schemas/skill.schema.json`
- `schemas/platform.schema.json`
- `schemas/route.schema.json`
- `schemas/outcome.schema.json`
- registered tool IDs from `runtime/tool-definitions.mjs`

### Release and provenance inputs

Version source:

- `VERSION`

Optional provenance:

- git SHA
- CI build ID
- build timestamp

Handled by:

- `versioning.mjs`

## Compiler Flow

### Phase 1: bootstrap and validator loading

`compile.mjs`:

- resolves repo paths
- reads and validates release version
- loads AJV validators for skill, platform, route, and outcome schemas

### Phase 2: scan canonical skills

`scanSkills()`:

- enumerates `shared/skills/`
- requires `SKILL.md`
- sorts by skill name

Output:

- deterministic ordered list of skill sources

### Phase 3: load and validate platforms

The compiler:

- loads all platform YAML files
- validates each against the platform schema
- validates additional platform policy constraints

If any platform fails:

- build stops immediately

### Phase 4: load and validate routes and outcomes

The compiler:

- loads all route definitions
- loads all outcome definitions
- validates both against JSON Schema
- validates cross-reference integrity via `validateOutcomeCompatibility(...)`

This catches:

- unknown capabilities
- unknown referenced routes
- outcomes whose route sets are entirely invalid

### Phase 5: parse and validate skills

For each skill:

- parse YAML frontmatter and markdown body
- validate against the skill schema
- validate policy against:
  - known platforms
  - known registered tools

Only validated skills enter the parsed set.

### Phase 6: compatibility resolution

`resolve-compatibility.mjs` computes a matrix:

- skill ID -> platform ID -> result

Compatibility result includes:

- `status`: `supported | unverified | excluded`
- `mode`: `native | transformed | degraded | excluded`
- `package`
- `emit`
- optional notes and unsupported/unknown capability lists

Rules:

- unsupported required capability -> excluded
- unknown required capability -> unverified
- supported required capabilities -> supported
- skill platform overrides can force exclusion or allow unverified emission

### Phase 7: zero-emit guardrail

The compiler explicitly fails if any non-deprecated skill resolves to zero emitted platforms.

This is a strong contract:

- every active skill must be shippable somewhere

### Phase 8: emission planning

The compiler groups emitted skills by platform.

Then `select-emitted-platforms.mjs` filters that set to only platforms with real emitters.

Current implemented emitters:

- `claude-code`
- `cursor`

Compatible but unimplemented platforms do not appear in the emitted-platform list.

### Phase 9: clean and emit

Before emission:

- `dist/` is deleted recursively

Purpose:

- remove stale artifacts from removed or renamed skills

Then per-platform emitters run.

## Output Artifacts

### `dist/clients/claude-code/`

Emitter:

- `emit-claude-code.mjs`

Output:

- `.claude-plugin/plugin.json`
- copied `skills/<skill>/SKILL.md`
- copied `prompts/` directories where present

Key contract:

- output is self-sufficient
- no source-tree references remain

### `dist/clients/cursor/.cursorrules`

Emitter:

- `emit-cursor.mjs`

Output:

- one concatenated rules file containing all emitted skills

Behavior:

- embeds skill bodies directly
- injects compatibility limitation notes for non-native or non-supported results

### `dist/registry/index.json`

Emitter:

- `emit-registry.mjs`

Purpose:

- canonical machine-readable manifest of emitted skills and platforms

Includes:

- version and optional provenance
- platform list
- skill metadata
- dependencies
- optional compatibility matrix summary

### `dist/runtime/*.json`

Emitter:

- `emit-runtime.mjs`

Outputs:

- `runtime/manifest.json`
- `runtime/outcomes.json`
- `runtime/routes.json`
- `runtime/tool-registry.json`

Purpose:

- provide runtime-consumable metadata independent of source files

Important detail:

- artifact hashes are computed and embedded
- manifest self-hash is computed with the manifest hash field redacted

This is a deliberate integrity feature, not an afterthought.

## Determinism Features

The pipeline has multiple explicit anti-drift mechanisms:

- sorted skill discovery
- sorted platform discovery
- sorted route and outcome loading
- deterministic output ordering in registry and runtime manifests
- full `dist/` cleanup before emission
- contract-style tests around emitted artifacts

The build is optimized for reproducibility and portability, not just convenience.

## Verification Layer

The broader verification story is split:

- `compile.mjs` owns build-time validation and emission
- `verify.mjs` orchestrates:
  - version parity
  - skill linting
  - platform linting
  - full test suite

This means `npm run verify` is the repository-level pre-push gate, while `compile.mjs` is the core compiler.

## End-To-End Source To Dist Map

1. `shared/skills/*/SKILL.md` -> parsed skill objects
2. `shared/targets/platforms/*.yaml` -> platform capability graph
3. `shared/routes/*.yaml` and `shared/outcomes/*.yaml` -> route/outcome model
4. schemas + policy validators -> admissible source set
5. compatibility resolution -> emitted skill sets per platform
6. platform emitters -> `dist/clients/*`
7. registry emitter -> `dist/registry/index.json`
8. runtime emitter -> `dist/runtime/*.json`

## Risks And Tensions

### Partial emitter coverage

The repo can define more platforms than it can emit. The `selectEmittedPlatforms(...)` helper prevents lying in the registry, but it also means platform compatibility work can outpace actual package availability.

### High coupling to schema evolution

Because the compiler validates skills, platforms, routes, and outcomes together, schema changes can force synchronized updates across many directories.

### Source and runtime overlap

The build uses both `shared/` source definitions and some `runtime/` tool definitions. That is reasonable, but it means the compiler depends on runtime-layer shape, not only source-authoring shape.

## Best Next Code Reads

- `scripts/build/test/compile.integration.test.mjs`
- `scripts/build/test/materialisation-contract.test.mjs`
- `scripts/build/test/portability.test.mjs`
- `scripts/build/test/delivery-contract.test.mjs`
