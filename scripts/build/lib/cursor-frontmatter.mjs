/**
 * cursor-frontmatter.mjs
 * Strip Claude / repo-only YAML keys and normalize SKILL.md for Cursor Agent Skills.
 */
import YAML from "yaml";

/** Cursor / Agent Skills: lowercase letters, digits, hyphens; 1-64 chars; must match folder name. */
export const CURSOR_SKILL_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

export const CURSOR_SKILL_NAME_MAX_LENGTH = 64;

/** Agent Skills open standard; kept in sync with `schemas/skill.schema.json` `description.maxLength`. */
export const CURSOR_DESCRIPTION_MAX_LENGTH = 1024;

/** @type {ReadonlySet<string>} */
export const CURSOR_STRIP_FRONTMATTER_KEYS = new Set([
  "hooks",
  "context",
  "agent",
  "user-invocable",
  "argument-hint",
  "model",
  "skill",
  "type",
  "status",
  "capabilities",
  "platforms",
  "variants",
  "inputs",
  "outputs",
  "dependencies",
  "tests",
  "monitoring",
  "version",
]);

/**
 * @param {string} raw
 * @param {object} skill - compiler skill record (skillName, frontmatter, …)
 * @param {object|undefined} compat - cursor entry from compat matrix
 * @returns {string}
 * @throws {Error} Invalid frontmatter, missing description, name/description limits, or name pattern.
 */
export function transformSkillMdForCursor(raw, skill, compat) {
  if (skill?.skillName == null || skill.skillName === "") {
    throw new Error("Cursor emit: skill.skillName is required");
  }
  if (skill.skillName.length > CURSOR_SKILL_NAME_MAX_LENGTH) {
    throw new Error(
      `Cursor emit: ${skill.skillName}: skill id exceeds ${CURSOR_SKILL_NAME_MAX_LENGTH} chars (Agent Skills / Cursor limit)`,
    );
  }
  if (!CURSOR_SKILL_NAME_PATTERN.test(skill.skillName)) {
    throw new Error(
      `Cursor emit: ${skill.skillName}: skill id must match Cursor/Agent Skills pattern (^[a-z][a-z0-9-]*$)`,
    );
  }

  const nl = raw.replace(/\r\n/g, "\n");
  const m = nl.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) {
    throw new Error(
      `Cursor emit: ${skill.skillName}: SKILL.md must start with YAML frontmatter (---)`,
    );
  }

  const doc = YAML.parse(m[1]);
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error(
      `Cursor emit: ${skill.skillName}: invalid YAML frontmatter`,
    );
  }

  const userInvocable = doc["user-invocable"];

  for (const k of CURSOR_STRIP_FRONTMATTER_KEYS) {
    delete doc[k];
  }

  doc.name = skill.skillName;

  const desc = doc.description;
  if (typeof desc !== "string" || desc.trim() === "") {
    throw new Error(
      `Cursor emit: ${skill.skillName}: description required in frontmatter`,
    );
  }
  if (desc.length > CURSOR_DESCRIPTION_MAX_LENGTH) {
    throw new Error(
      `Cursor emit: ${skill.skillName}: description exceeds ${CURSOR_DESCRIPTION_MAX_LENGTH} chars (Agent Skills / Cursor limit)`,
    );
  }

  let body = m[2];
  const blocks = [];

  // YAML boolean false only (not the string "false").
  if (userInvocable === false) {
    blocks.push(
      "> **Note (Cursor):** This skill uses `user-invocable: false` in AI Config OS (Claude Code: only the agent may invoke it, not the user via `/`). Cursor has no identical flag; the agent may still auto-select this skill. To require explicit `/` invocation in Cursor, set `disable-model-invocation: true` on the source skill.",
    );
  }

  const hasLimitation =
    compat && (compat.mode !== "native" || compat.status !== "supported");

  if (hasLimitation) {
    const fm = skill.frontmatter || {};
    const limitationReason =
      compat.notes ||
      (compat.status === "unverified"
        ? "Capability support is unverified for Cursor."
        : compat.status === "excluded"
          ? "This skill is excluded for Cursor due to unsupported capability requirements."
          : "Some capabilities may not be available in Cursor.");

    let lim = `> **Note (Cursor):** LIMITATION (${compat.status}/${compat.mode}): ${limitationReason}`;
    if (fm.capabilities?.fallback_notes) {
      lim += `\n> **Fallback:** ${fm.capabilities.fallback_notes}`;
    }
    blocks.push(lim);
  }

  if (blocks.length > 0) {
    body = `${blocks.join("\n\n")}\n\n${body}`;
  }

  const fmOut = YAML.stringify(doc, {
    sortMapEntries: true,
    lineWidth: 0,
  }).trimEnd();

  const out = `---\n${fmOut}\n---\n${body}`;
  return out.endsWith("\n") ? out : `${out}\n`;
}
