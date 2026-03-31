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
- Optionally retain **legacy** monolithic `.cursorrules` generation behind an **explicit compiler flag or env** (default off or on for one release — implementation plan decides) for backward compatibility.

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

Introduce a **shared helper** under `scripts/build/lib/` (name TBD, e.g. `emit-skill-tree.mjs`) that:

- Accepts a skill record (same shape as compiler uses today), destination directory for **one** skill folder, and a **`transformSkillMd(raw: string, skill): string`** callback.
- Creates `skills/<skillName>/`, writes transformed `SKILL.md`, then **best-effort `cpSync`** for optional dirs: `prompts`, `scripts`, `references`, `assets` from `skill.skillDir` (ignore `ENOENT`).

**Callers:**

- [`emit-claude-code.mjs`](../../../scripts/build/lib/emit-claude-code.mjs) — refactor to use the helper with identity / existing `readSkillMd` behavior for Claude (minimize behavior change).
- [`emit-cursor.mjs`](../../../scripts/build/lib/emit-cursor.mjs) — use helper with **Cursor** `transformSkillMd`.

## 7. Cursor `SKILL.md` transform

**Required normalization (Cursor / open standard):**

- Ensure YAML frontmatter includes **`name:`** matching the directory name (reuse logic analogous to [`readSkillMd`](../../../scripts/build/lib/emit-claude-code.mjs) in claude emitter: inject after `---` if missing; if `name:` already present, keep).
- Ensure **`description:`** exists and is non-empty for Cursor discovery; if only a `skill:` line exists, map description from existing `description:` or fail validation at compile time (compiler should already validate skills — align with existing skill linter).

**Claude-only / non-portable frontmatter** (examples: `hooks`, `context: fork`-related keys, Claude Code–specific keys documented in [`docs/SKILLS.md`](../../../docs/SKILLS.md)):

- **Strip** from emitted Cursor frontmatter so Cursor does not see invalid or misleading YAML.
- If stripping removes materially important behavior, prepend a short **markdown NOTE** block at the top of the body (after frontmatter) summarizing the limitation, and/or reuse **compatibility matrix** strings already passed into `emit-cursor` today.

**Implementation note:** Prefer a **small, tested** frontmatter parser (or reuse an existing dependency in `scripts/build` if present) rather than fragile regex for multi-line YAML.

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
- **Manual:** Skills appear under **Cursor Settings → Rules** (Agent Decides), per [Cursor docs](https://cursor.com/docs/context/skills).

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
