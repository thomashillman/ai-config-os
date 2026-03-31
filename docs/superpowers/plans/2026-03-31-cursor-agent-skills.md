# Cursor Agent Skills packaging — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit `dist/clients/cursor/skills/<name>/SKILL.md` (plus optional `prompts/`, `scripts/`, `references/`, `assets/`) with Cursor-safe frontmatter, refactor Claude Code emission to share one tree copier, and keep monolithic `.cursorrules` **opt-in** via `AI_CONFIG_OS_EMIT_CURSORRULES=1`.

**Architecture:** Add `scripts/build/lib/emit-skill-tree.mjs` to own “write one skill folder to dist” (transformed `SKILL.md` + best-effort recursive copy of optional dirs). Add `scripts/build/lib/cursor-skill-md.mjs` (or split strip + transform) that uses the `yaml` package to parse frontmatter, strip Claude/repo-only keys via a single exported list, enforce `name`/`description`, and re-serialize. Refactor `emit-claude-code.mjs` to call the tree helper with the existing `readSkillMd` behavior. Refactor `emit-cursor.mjs` to call the tree helper plus Cursor transform; call legacy concatenation only when env is set.

**Tech Stack:** Node.js (ESM), `yaml` (already in `package.json`), existing compiler pipeline in `scripts/build/compile.mjs`, tests in `scripts/build/test/*.test.mjs` via `npm test`.

**Spec:** [docs/superpowers/specs/2026-03-31-cursor-agent-skills-design.md](../specs/2026-03-31-cursor-agent-skills-design.md)

---

## File map

| File | Role |
| --- | --- |
| `scripts/build/lib/emit-skill-tree.mjs` | **Create** — copy one skill’s optional dirs + write transformed `SKILL.md` |
| `scripts/build/lib/cursor-frontmatter.mjs` | **Create** — strip list, `transformSkillMdForCursor(raw, { skill, compat })` |
| `scripts/build/lib/emit-claude-code.mjs` | **Modify** — delegate folder emission to `emit-skill-tree` |
| `scripts/build/lib/emit-cursor.mjs` | **Modify** — primary: skill tree; optional legacy `.cursorrules` |
| `scripts/build/compile.mjs` | **Modify** — pass `emitLegacyCursorrules` boolean from env into `emitCursor` |
| `scripts/build/test/emit-skill-tree.test.mjs` | **Create** — temp dir fixtures |
| `scripts/build/test/cursor-frontmatter.test.mjs` | **Create** — golden strip + name/description |
| `scripts/build/test/emitter-contract.test.mjs` | **Modify** — assert `dist/clients/cursor/skills/*/SKILL.md` |
| `scripts/build/test/scaffold-and-provenance.test.mjs` | **Modify** — cursor paths if they assert only `.cursorrules` |
| `README.md` | **Modify** — Cursor section: install `skills/` into `~/.cursor/skills` |
| `docs/SUPPORTED_TODAY.md` | **Modify** — Cursor emitter row |
| `shared/targets/platforms/cursor.yaml` | **Modify** — `notes` aligned with Agent Skills |
| `PLAN.md` | **Modify** — platform maturity row when shipped |

---

### Task 1: Enumerate Claude/repo-only frontmatter keys

**Files:**
- Create: `scripts/build/lib/cursor-frontmatter.mjs` (stub exports strip list + allowed list; code is source of truth)

- [ ] **Step 1:** Define a **frozen list** of top-level YAML keys to remove for Cursor emit, derived from [`docs/SKILLS.md`](../../../docs/SKILLS.md): at minimum `hooks`, `context`, `agent`, `user-invocable`, `argument-hint`, `model`, and repo-extended keys `skill` (superseded by emitted `name`), `type`, `status`, `capabilities`, `platforms`, `variants`, `inputs`, `outputs`, `dependencies`, `tests`, `monitoring`, `version`. (Strip `version` from Cursor emit per lean frontmatter; use `metadata` in source if a version hint must survive—rare.)

- [ ] **Step 2:** Export `ALLOWED_CURSOR_TOP_KEYS` as the complement: `name`, `description`, `license`, `compatibility`, `metadata`, `disable-model-invocation`, `allowed-tools` (optional standard).

- [ ] **Step 3:** Commit `feat(build): add cursor frontmatter key lists`

---

### Task 2: Implement `transformSkillMdForCursor`

**Files:**
- Modify: `scripts/build/lib/cursor-frontmatter.mjs`

- [ ] **Step 1:** Parse `SKILL.md` by splitting first `---\n` … `\n---\n` frontmatter; use `YAML.parse` / `YAML.stringify` from `yaml` package.

- [ ] **Step 2:** Remove keys in strip list; set `name` to `skill.skillName`; assert `description` is non-empty string — if not, **throw** with clear error (compile fails).

- [ ] **Step 3:** If `compat` for skill indicates limitation (reuse existing `emit-cursor` logic), prepend a short `> **Note (Cursor):** …` block to the markdown body after frontmatter.

- [ ] **Step 4:** Normalize line endings to `\n` for deterministic output.

- [ ] **Step 5:** Add `scripts/build/test/cursor-frontmatter.test.mjs` — fixture skill with `hooks:` + `context: fork` must not appear in output YAML; `name` and `description` present.

- [ ] **Step 6:** Run `npm test -- scripts/build/test/cursor-frontmatter.test.mjs`

- [ ] **Step 7:** Commit `feat(build): transform SKILL.md for Cursor emitter`

---

### Task 3: Implement `emit-skill-tree.mjs`

**Files:**
- Create: `scripts/build/lib/emit-skill-tree.mjs`

- [ ] **Step 1:** Export `emitSkillFolder({ skill, distSkillsDir, transformSkillMd })` where `skill` has `skillName`, `skillDir`, `filePath` (or `skillMdPath`), `frontmatter` as today.

- [ ] **Step 2:** `mkdirSync(join(distSkillsDir, skill.skillName), { recursive: true })`.

- [ ] **Step 3:** Read raw `SKILL.md` from source path; `writeFileSync(dest, transformSkillMd(raw))`.

- [ ] **Step 4:** For each optional subdir in `['prompts', 'scripts', 'references', 'assets']`, `cpSync` if exists; catch `ENOENT` only.

- [ ] **Step 5:** Add unit test with temporary skill dir under `scripts/build/test/fixtures/` or `os.tmpdir()`.

- [ ] **Step 6:** Run targeted tests; commit `feat(build): add emit-skill-tree helper`

---

### Task 4: Refactor `emit-claude-code.mjs` to use helper

**Files:**
- Modify: `scripts/build/lib/emit-claude-code.mjs`

- [ ] **Step 1:** Move `readSkillMd` logic into a callback passed to `emitSkillFolder` (keep byte-for-byte behavior: inject `name:` after `---` when missing).

- [ ] **Step 2:** Replace inner loop of `emitSkills` with calls to `emitSkillFolder`.

- [ ] **Step 3:** Run `npm test -- scripts/build/test/emitter-contract.test.mjs` and full `npm test` if feasible.

- [ ] **Step 4:** Commit `refactor(build): claude-code emitter uses emit-skill-tree`

---

### Task 5: Refactor `emit-cursor.mjs`

**Files:**
- Modify: `scripts/build/lib/emit-cursor.mjs`
- Modify: `scripts/build/compile.mjs`

- [ ] **Step 1:** Add function parameter or options to `emitCursor(skills, { ..., emitLegacyCursorrules: boolean })`.

- [ ] **Step 2:** Always emit `skills/` via `emitSkillFolder` + `transformSkillMdForCursor` (pass `compatMatrix` per skill).

- [ ] **Step 3:** If `emitLegacyCursorrules`, run existing concatenation logic writing `dist/clients/cursor/.cursorrules`; else remove that file if present (or leave stale — **prefer** deleting `dist/clients/cursor/.cursorrules` when flag false so CI does not see ghost file; `compile.mjs` may already `rmSync` dist — verify).

- [ ] **Step 4:** In `compile.mjs`, set `emitLegacyCursorrules = process.env.AI_CONFIG_OS_EMIT_CURSORRULES === '1'`.

- [ ] **Step 5:** Update contract tests to expect `skills/` layout; gate legacy tests on env.

- [ ] **Step 6:** Run `node scripts/build/compile.mjs` and `npm test`.

- [ ] **Step 7:** Commit `feat(build): cursor client emits Agent Skills tree`

---

### Task 6: Documentation and platform YAML

**Files:**
- Modify: `README.md`, `docs/SUPPORTED_TODAY.md`, `shared/targets/platforms/cursor.yaml`, optionally `PLAN.md`

- [ ] **Step 1:** README Cursor section: build → copy `dist/clients/cursor/skills/*` → `~/.cursor/skills/`; mention opt-in legacy env.

- [ ] **Step 2:** `SUPPORTED_TODAY.md` — Cursor compiler emits skills tree.

- [ ] **Step 3:** `cursor.yaml` notes — reference Agent Skills discovery, not “only .cursorrules”.

- [ ] **Step 4:** Commit `docs: align Cursor docs with Agent Skills emitter`

---

### Task 7: Manual verification (release gate)

- [ ] Copy emitted skills to `~/.cursor/skills` on a machine with Cursor desktop; confirm listed for Agent per [Cursor Agent Skills](https://cursor.com/docs/context/skills).

- [ ] Record result in commit message or `docs/superpowers/specs/` addendum if needed.

---

## Follow-on (separate plans, not this PR)

- `adapters/cursor/materialise.sh` + Worker `cursor` package endpoints
- `runtime/adapters/file-adapter.sh` sync + `tool-registry.yaml` paths
- `adapters/bootstrap/provider-context.mjs` capability flags for Cursor
- Dual MCP write to `~/.cursor/mcp.json`

---

## Spec review status

Design spec updated after review: [docs/superpowers/specs/2026-03-31-cursor-agent-skills-design.md](../specs/2026-03-31-cursor-agent-skills-design.md) (commits `5998dcc`, `3f92e7f` and any fixups on `main`).
