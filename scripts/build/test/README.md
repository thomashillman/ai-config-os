# Test Suite Documentation

This directory contains 24 automated test suites that protect the AI Config OS architecture and guarantee portability, deliverability, and reproducibility.

## Contract-Level Tests (Guardrails)

These suites protect specific architectural contracts:

### 1. Canonical Source Contract (2 tests)
**File:** `canonical-source-contract.test.mjs`
**Purpose:** Verify that the compiler reads *only* from `shared/skills/`, never from plugins or other sources.
**Guarantees:**
- Compiler enumeration uses only canonical source directory
- No fallback to plugin symlinks or alternate paths
- Structure is deterministic and auditable

---

### 2. Self-Sufficiency Contract (5 tests)
**Files:** `materialisation-contract.test.mjs`, `emitter-contract.test.mjs`
**Purpose:** Verify that emitted packages (`dist/`) are complete and work standalone without source access.
**Guarantees:**
- All referenced resources (prompts/, etc.) are copied to dist/
- All required frontmatter fields are present in distributed SKILL.md
- Paths in plugin.json are relative (no source-tree references)
- Package metadata is valid and consistent

---

### 3. Materialisation Contract (19 tests)
**File:** `materialiser-core.test.mjs`
**Purpose:** Verify that emitted packages can be extracted on any system without source-tree access, with security validation.
**Guarantees:**
- Package metadata validation (required fields, structure)
- Path traversal prevention (reject `../`, absolute paths, null bytes)
- Security boundary checks (resolved paths stay within package root)
- File existence and type validation
- Extraction creates valid directory structure

---

### 4. Source-to-Output Flow Contract (3 tests)
**File:** `source-change-flow.test.mjs`
**Purpose:** Verify that source changes produce predictable, deterministic changes in emitted packages.
**Guarantees:**
- Skills in source have representation in dist/
- Skill ordering is alphabetical (deterministic)
- Content hashes are consistent (same source → same output)
- No timestamps or build metadata in SKILL.md
- Referenced files are materialized

---

### 5. Delivery Contract (28 tests)
**File:** `delivery-contract.test.mjs`
**Purpose:** Verify that all distributed artifacts are complete, consistent, and valid.
**Guarantees:**
- All emitted files exist and are non-empty
- SKILL.md files have required frontmatter (skill, description, type, status, version)
- Plugin.json files are valid JSON with correct structure
- Registry index.json is complete with all metadata
- All referenced file paths exist on disk
- Versions are consistent across all platforms
- Cross-file references are valid (no dangling links)

---

## Implementation Tests (Correctness)

These suites verify specific implementation components work correctly:

### 6. Compiler Validation
**Files:** `compile.integration.test.mjs`, `compiler-fixtures.test.mjs`, `schema-contract.test.mjs`
**Purpose:** Verify compiler pipeline, schema validation, and error handling.

### 7. Emitter Implementation
**File:** `emitter-contract.test.mjs`
**Purpose:** Verify each platform emitter (claude-code, cursor) produces correct output.

### 8. Scaffold & Manifest
**File:** `scaffold-and-provenance.test.mjs`, `manifest-update.test.mjs`
**Purpose:** Verify new-skill.mjs creates valid skills and updates manifest correctly.

### 9. Reproducibility & Determinism
**File:** `reproducibility.test.mjs`
**Purpose:** Verify that builds are deterministic and produce byte-identical output.

### 10. Compatibility Resolution
**File:** `compatibility-fixtures.test.mjs`
**Purpose:** Verify platform-skill compatibility matrix is correctly computed.

### 11. Schema Validation
**File:** `schema-contract.test.mjs`
**Purpose:** Verify skill YAML matches JSON Schema and platform definitions are valid.

---

## Security & Safety Tests

### 12. MCP Security
**File:** `mcp-security.test.mjs`
**Purpose:** Verify MCP server doesn't expose sensitive paths or allow injection.

### 13. Shell Safety
**File:** `shell-safety.test.mjs`
**Purpose:** Verify shell scripts don't have injection vulnerabilities (for bash/sh adapters).

### 14. Portability (Cross-Platform)
**File:** `portability.test.mjs`
**Purpose:** Verify code works on Windows, macOS, and Linux (path separators, file APIs, etc.).

---

## Policy & Convention Tests

### 15. Policy Enforcement
**File:** `policy.test.mjs`
**Purpose:** Verify rules are enforced (e.g., skills in shared/ not in plugins/).

### 16. Version & Provenance
**File:** `version.test.mjs`
**Purpose:** Verify release versioning is consistent and provenance is correct.

### 17. Adapter Contracts
**Files:** `adapter-contract.test.mjs`, `adapter-real.test.mjs`
**Purpose:** Verify platform adapters (materialise.sh, etc.) work correctly.

### 18. Resolver Selection Contract
**File:** `resolver-selection-contract.test.mjs`
**Purpose:** Verify emitter selection is deterministic and only includes compatible platforms that have concrete emitters.
**Guarantees:**
- Platform emission selection excludes non-emittable platforms
- Resolver output remains deterministic (stable ordering)

### 19. Sync Loop Version/ETag Contract
**File:** `sync-loop-etag-version-contract.test.mjs`
**Purpose:** Verify sync/fetch loop keeps using the canonical `latest` endpoint and persists version-bearing metadata into local cache.
**Guarantees:**
- Fetch path uses `/v1/client/claude-code/latest`
- Sync cache persists worker payload in `latest.json`
- Version reads are sourced from cached payload metadata

### 20. Worker Version Pointer Consistency Contract
**File:** `worker-version-pointer-consistency-contract.test.mjs`
**Purpose:** Verify worker responses consistently point to `dist/registry/index.json` version values (single source of truth).
**Guarantees:**
- `/v1/health` exposes registry-derived version
- Worker payload version fields are not hardcoded and remain registry-backed

---


### 18. Worker Executor Proxy Integration
**File:** `worker-executor-integration.test.mjs`
**Purpose:** End-to-end coverage for worker proxy behavior against a lightweight executor double.
**Guarantees:**
- Signed requests are verified before proxying
- Tool allowlist checks are enforced
- Tool argument schema checks reject invalid payloads
- Proxy timeout handling returns a deterministic contract error
- Large executor output is truncated consistently

---

## Running Tests

### Run all tests
```bash
npm test
```

### Run a specific test suite
```bash
npm test -- scripts/build/test/materialisation-contract.test.mjs
```

### Run with verbose output
```bash
npm test -- --verbose
```

### Run only contract tests (gates)
```bash
npm test -- scripts/build/test/{canonical-source,materialisation,source-change-flow,delivery}-contract.test.mjs
```

---

## Test Organization

Tests are organized by contract:

```
scripts/build/test/
├── *-contract.test.mjs         # Architectural contract tests (gates)
├── *-fixtures.test.mjs          # Implementation test fixtures
├── *-real.test.mjs              # Real-world integration tests
├── *.integration.test.mjs        # End-to-end integration tests
└── *.test.mjs                   # Single-purpose tests
```

**Contract tests** are the guardrails. **Implementation tests** verify specific components. **Security tests** ensure no vulnerabilities exist.

---

## CI Integration

All tests run on every push to main and every PR:
- **Platform:** Ubuntu, macOS, Windows
- **Node version:** 20+
- **Coverage:** 325 tests, 24 suites, cross-platform

Tests must pass before merging to main. Broken tests block CI/CD.

---

## Maintenance

When adding a new test:
1. Decide which contract it protects (or create a new contract test file)
2. Add to the appropriate test file
3. Update this README with test count and purpose
4. Ensure test passes on all platforms (CI will verify)
5. Add code comment explaining what invariant is being verified

When modifying tests:
- Don't remove tests without discussing architectural impact
- Don't weaken assertions without document approval (contracts are guardrails)
- Keep assertions specific and actionable (error messages help developers fix issues)
