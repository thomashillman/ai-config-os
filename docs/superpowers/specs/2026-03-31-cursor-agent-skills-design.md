# Design: Cursor Agent Skills packaging (ai-config-os)

**Status:** Draft for implementation planning  
**Date:** 2026-03-31  
**Brainstorming:** Decisions locked in parity plan + three approved design sections (artefact layout, install/sync, frontmatter/tests).

## 1. Problem

The compiler’s Cursor client today emits a **single concatenated** `dist/clients/cursor/.cursorrules` ([`scripts/build/lib/emit-cursor.mjs`](../../../scripts/build/lib/emit-cursor.mjs)). Official Cursor documentation describes **Agent Skills** as **per-skill directories** under `.cursor/skills/` or `~/.cursor/skills/`, each with `SKILL.md` and optional `scripts/`, `references/`, `assets/` ([Agent Skills](https://cursor.com/docs/context/skills)). That mismatch limits discoverability, progressive disclosure, and parity with how Claude Code consumes the same source skills.

## 2. Goals

- Emit a **self-contained** `dist/clients/cursor/` tree that matches Cursor’s Agent Skills **folder layout** (`skills/<skillName>/SKILL.md` + optional sibling dirs).
- **Reuse** skill-folder copying logic with the Claude Code emitter where practical (**DRY**), with a **Cursor-specific** transform on `SKILL.md` (frontmatter normalization and Claude-only field handling).
- Define **install semantics**: default target `~/.cursor/skills`; optional project `.cursor/skills`; **replace entire skill directory** on install for a given skill name (versioned bundle wins).
- **Legacy `.cursorrules` (product decision, locked):** Primary output is always the **skills tree**. Monolithic `.cursorrules` is **opt-in only** via compile-time flag or env (e.g. `AI_CONFIG_OS_EMIT_CURSORRULES=1`) so existing README-based workflows can migrate without breaking; default is **do not emit** `.cursorrules`.

## 3. Non-goals (this spec)

- Parity for **Claude Code hooks**, **PreToolUse**, **`context: fork` subagents**, or **Cursor Tab / Cmd+K** (vendor scope is Agent chat; see [Rules FAQ](https://cursor.com/docs/context/rules)).
- **Team Rules** from Cursor’s org dashboard.
- Full **Worker + materialise.sh + MCP dual-write** in the same deliverable as the emitter — those are **follow-on** tracks (this spec defines interfaces so they can consume the same `dist/clients/cursor/skills/` tree).

## 4. Vendor references

| Topic | URL |
| --- | --- |
| Agent Skills (paths, `SKILL.md`, optional dirs) | https://cursor.com/docs/context/skills |
| Project rules (`.cursor/rules`, `.mdc`) | https://cursor.com/docs/context/rules |
| MCP config locations | https://cursor.com/docs/mcp |

## 5. Artefact layout

**Output root:** `dist/clients/cursor/` (unchanged package root).

**Required tree:**

```text
dist/clients/cursor/
  skills/
    <skill-name>/
      SKILL.md
      prompts/          # if present in source (parity with claude-code emitter)
      scripts/          # if present in source
      references/       # if present in source
      assets/           # if present in source
```

**Optional (legacy):** `dist/clients/cursor/.cursorrules` — single concatenated file, generated only when legacy mode is enabled.

**Portability:** No paths pointing into `shared/skills/`; all files are copies, consistent with [`emit-claude-code.mjs`](../../../scripts/build/lib/emit-claude-code.mjs) contract.

**Provenance header:** A small `README.md` or `PACKAGE.txt` at `dist/clients/cursor/` documenting version and install instructions is optional; version is already in compile output elsewhere — **YAGNI** unless docs need it.

## 6. Shared module (approach B)

Introduce a **shared helper** `scripts/build/lib/emit-skill-tree.mjs` (new file) that:

- Accepts a skill record (same shape as compiler uses today), destination directory for **one** skill folder, and a **`transformSkillMd(raw: string, skill): string`** callback.
- Creates `skills/<skillName>/`, writes transformed `SKILL.md`, then **best-effort `cpSync`** for optional dirs: `prompts`, `scripts`, `references`, `assets` from `skill.skillDir` (ignore `ENOENT`).

**Callers:**

- [`emit-claude-code.mjs`](../../../scripts/build/lib/emit-claude-code.mjs) — refactor to use the helper with identity / existing `readSkillMd` behavior for Claude (minimize behavior change).
- [`emit-cursor.mjs`](../../../scripts/build/lib/emit-cursor.mjs) — use helper with **Cursor** `transformSkillMd`.

## 7. Cursor `SKILL.md` transform

**Required normalization (Cursor / open standard):**

- **`name:`** — Must equal the skill directory name (`skill.skillName`). If the source frontmatter already has `name:`, emit it only if it matches; otherwise normalize to the directory name (implementation may warn or fail per existing linter rules).
- **`description:`** — Source skills are already validated by the skill linter to carry a usable description for discovery. **Rule:** If after parsing, `description` is missing or empty, **fail the compile** for the Cursor platform (do not invent text from the body in v1). The implementation plan adds the exact assertion alongside existing compile validation.

**Claude-only / non-portable frontmatter:**

- Maintain a **single authoritative strip list** in code (e.g. `scripts/build/lib/cursor-strip-frontmatter.mjs`) derived from Claude-specific keys documented in [`docs/SKILLS.md`](../../../docs/SKILLS.md) (hooks, `context`, subagent-related keys, etc.). The list is **enumerated in the implementation plan** and covered by a test that fails if a known Claude-only key appears in emitted Cursor frontmatter.
- **Strip** those keys from emitted Cursor YAML; pass through keys that match the open standard plus Cursor-documented optional fields (`license`, `compatibility`, `metadata`, `disable-model-invocation`, **`allowed-tools`** and other open-standard optional fields not on the strip list).
- If stripping removes materially important behavior, prepend a short **markdown NOTE** in the body and/or append **compatibility matrix** strings (existing `emit-cursor` already receives `compatMatrix`). When source has `user-invocable: false` (Claude-only), emit a body NOTE explaining that Cursor has no identical flag and pointing authors to `disable-model-invocation` if they want slash-only invocation — **do not** map `user-invocable: false` to `disable-model-invocation: true` automatically.
- **`prompts/`:** May be emitted beside `SKILL.md` for Claude parity; Cursor’s public skill layout lists `scripts/`, `references/`, `assets/` only — extra directories are acceptable on disk.

**Implementation note:** Use the repo’s existing **`yaml` package** (`package.json`) to parse/update the frontmatter block deterministically (split `---` fences, parse YAML, mutate, stringify).

## 8. Install, sync, and bootstrap (behavioral contract)

| Mechanism | Behavior |
| --- | --- |
| **Default install target** | `~/.cursor/skills` |
| **Optional project target** | `<repo>/.cursor/skills` (env or CLI flag on future `materialise.sh`) |
| **Merge policy** | For each skill folder name, **delete existing target dir** (if any) and **copy** emitted dir wholesale |
| **Cache dir (future)** | `~/.ai-config-os/cache/cursor/` for Worker-fetched packages |
| **Provider context** | [`adapters/bootstrap/provider-context.mjs`](../../../adapters/bootstrap/provider-context.mjs) should eventually expose `target_path` (or parallel field) as global skills dir when Cursor is detected |
| **file-adapter** | [`runtime/adapters/file-adapter.sh`](../../../runtime/adapters/file-adapter.sh) `sync` should copy `dist/clients/cursor/skills/*` to configured path when cursor is in desired state (follow-on task) |

## 9. Testing

- **Emitter contract tests:** After compile, assert for each compatible skill: `dist/clients/cursor/skills/<id>/SKILL.md` exists; frontmatter contains `name` and `description`; stripped keys absent (golden test on one skill with Claude-only keys if available).
- **Regression:** If legacy `.cursorrules` remains optional, assert presence/absence per flag.
- **Manual:** After copying `dist/clients/cursor/skills/*` to `~/.cursor/skills`, confirm skills are listed for Agent (Cursor documents discovery under [Agent Skills](https://cursor.com/docs/context/skills); Settings UI labels such as “Agent Decides” may change between Cursor versions—verify against current product copy).

## 10. Documentation updates (when implemented)

- [`README.md`](../../../README.md) Cursor section — replace “single folder / plugins” wording with **skills tree** + install locations.
- [`docs/SUPPORTED_TODAY.md`](../../../docs/SUPPORTED_TODAY.md) — Cursor emitter / file-adapter row.
- [`shared/targets/platforms/cursor.yaml`](../../../shared/targets/platforms/cursor.yaml) — reconcile `notes` with vendor Agent Skills behavior.
- [`PLAN.md`](../../../PLAN.md) platform maturity table when behaviour ships.

## 11. Risks

- **Cursor product updates** changing discovery paths — keep install paths **configurable** in registry/env.
- **Large skill count** — many folders is still better than one huge rules file for progressive disclosure; vendor recommends keeping individual rules/skills focused ([Rules](https://cursor.com/docs/context/rules)).
- **Frontmatter edge cases** — skills with unusual YAML need contract tests to avoid corrupt emits.

## 12. Relationship to `.claude/skills` compatibility

Cursor also loads `~/.claude/skills` per vendor docs. This spec **does not** rely on that for the **primary** path; optional **documentation** may describe copying `dist/clients/claude-code/skills` as a shortcut for advanced users. Primary deliverable is **`dist/clients/cursor/skills`**.
