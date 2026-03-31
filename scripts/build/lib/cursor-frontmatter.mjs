/**
 * cursor-frontmatter.mjs
 * Strip Claude / repo-only YAML keys and normalize SKILL.md for Cursor Agent Skills.
 */
import YAML from 'yaml';

/** @type {ReadonlySet<string>} */
export const CURSOR_STRIP_FRONTMATTER_KEYS = new Set([
  'hooks',
  'context',
  'agent',
  'user-invocable',
  'argument-hint',
  'model',
  'skill',
  'type',
  'status',
  'capabilities',
  'platforms',
  'variants',
  'inputs',
  'outputs',
  'dependencies',
  'tests',
  'monitoring',
  'version',
]);

/**
 * @param {string} raw
 * @param {object} skill - compiler skill record (skillName, frontmatter, …)
 * @param {object|undefined} compat - cursor entry from compat matrix
 * @returns {string}
 */
export function transformSkillMdForCursor(raw, skill, compat) {
  const nl = raw.replace(/\r\n/g, '\n');
  const m = nl.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) {
    throw new Error(`Cursor emit: ${skill.skillName}: SKILL.md must start with YAML frontmatter (---)`);
  }

  const doc = YAML.parse(m[1]);
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error(`Cursor emit: ${skill.skillName}: invalid YAML frontmatter`);
  }

  for (const k of CURSOR_STRIP_FRONTMATTER_KEYS) {
    delete doc[k];
  }

  doc.name = skill.skillName;

  const desc = doc.description;
  if (typeof desc !== 'string' || desc.trim() === '') {
    throw new Error(`Cursor emit: ${skill.skillName}: description required in frontmatter`);
  }

  let body = m[2];
  const hasLimitation =
    compat && (compat.mode !== 'native' || compat.status !== 'supported');

  if (hasLimitation) {
    const fm = skill.frontmatter || {};
    const limitationReason =
      compat.notes ||
      (compat.status === 'unverified'
        ? 'Capability support is unverified for Cursor.'
        : compat.status === 'excluded'
          ? 'This skill is excluded for Cursor due to unsupported capability requirements.'
          : 'Some capabilities may not be available in Cursor.');

    let prefix = `> **Note (Cursor):** LIMITATION (${compat.status}/${compat.mode}): ${limitationReason}\n`;
    if (fm.capabilities?.fallback_notes) {
      prefix += `> **Fallback:** ${fm.capabilities.fallback_notes}\n`;
    }
    prefix += '\n';
    body = prefix + body;
  }

  const fmOut = YAML.stringify(doc, {
    sortMapEntries: true,
    lineWidth: 0,
  }).trimEnd();

  const out = `---\n${fmOut}\n---\n${body}`;
  return out.endsWith('\n') ? out : `${out}\n`;
}
