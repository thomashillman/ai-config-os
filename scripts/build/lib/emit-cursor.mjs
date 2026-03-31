/**
 * emit-cursor.mjs
 * Emits Cursor platform artefacts from compatibility-filtered skills.
 *
 * Portability Contract: emitted package is self-sufficient.
 * Primary: Agent Skills tree — dist/clients/cursor/skills/<name>/SKILL.md (+ optional dirs).
 * Optional: monolithic .cursorrules when AI_CONFIG_OS_EMIT_CURSORRULES=1 (legacy).
 *
 * Also writes .emit-meta.json (version, skill count, optional provenance) for tooling/tests.
 */
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { emitSkillTree } from './emit-skill-tree.mjs';
import { transformSkillMdForCursor } from './cursor-frontmatter.mjs';

/**
 * @param {object[]} skills - Pre-filtered skills for cursor (from compatibility resolution)
 * @param {object} opts
 * @param {string} opts.distDir - e.g. dist/clients/cursor
 * @param {string} opts.releaseVersion - release version from VERSION file
 * @param {object|null} [opts.provenance] - optional provenance (release mode only)
 * @param {Map<string, Map<string, object>>} opts.compatMatrix - full compatibility matrix
 * @param {boolean} [opts.emitLegacyCursorrules=false] - emit concatenated .cursorrules
 */
export function emitCursor(
  skills,
  { distDir, releaseVersion, provenance, compatMatrix, emitLegacyCursorrules = false }
) {
  mkdirSync(distDir, { recursive: true });

  const distSkillsDir = join(distDir, 'skills');
  emitSkillTree(skills, distSkillsDir, (raw, skill) => {
    const compat = compatMatrix?.get(skill.skillName)?.get('cursor');
    return transformSkillMdForCursor(raw, skill, compat);
  });
  console.log(`  [cursor] skills/ → ${distSkillsDir} (${skills.length} skill(s))`);

  const meta = {
    version: releaseVersion,
    skills_count: skills.length,
    emit_kind: 'cursor-agent-skills',
  };
  if (provenance?.builtAt) meta.built_at = provenance.builtAt;
  if (provenance?.buildId) meta.build_id = provenance.buildId;
  if (provenance?.sourceCommit) meta.source_commit = provenance.sourceCommit;
  writeFileSync(join(distDir, '.emit-meta.json'), JSON.stringify(meta, null, 2) + '\n');
  console.log(`  [cursor] .emit-meta.json → ${join(distDir, '.emit-meta.json')}`);

  const legacyPath = join(distDir, '.cursorrules');
  if (emitLegacyCursorrules) {
    const rulesContent = buildLegacyCursorrulesContent(skills, {
      releaseVersion,
      provenance,
      compatMatrix,
    });
    writeFileSync(legacyPath, rulesContent);
    console.log(`  [cursor] .cursorrules → ${legacyPath} (legacy, ${skills.length} skill(s))`);
  } else if (existsSync(legacyPath)) {
    unlinkSync(legacyPath);
  }
}

/**
 * @param {object[]} skills
 * @param {{ releaseVersion: string, provenance: object|null, compatMatrix: Map }} opts
 */
function buildLegacyCursorrulesContent(skills, { releaseVersion, provenance, compatMatrix }) {
  const sections = [];

  sections.push(`# AI Config OS — Cursor Rules`);
  sections.push(`# Version: ${releaseVersion}`);
  if (provenance?.builtAt) sections.push(`# Built: ${provenance.builtAt}`);
  if (provenance?.buildId) sections.push(`# Build ID: ${provenance.buildId}`);
  if (provenance?.sourceCommit) sections.push(`# Source Commit: ${provenance.sourceCommit}`);
  sections.push(`# Skills: ${skills.length}`);
  sections.push('');

  for (const skill of skills) {
    const fm = skill.frontmatter;
    const skillId = skill.skillName;
    const compat = compatMatrix?.get(skillId)?.get('cursor');

    sections.push(`# ─── ${fm.skill || skillId} ───`);

    if (fm.description) {
      sections.push(`# ${fm.description.trim().split('\n')[0]}`);
    }

    const hasLimitation = compat && (compat.mode !== 'native' || compat.status !== 'supported');
    if (hasLimitation) {
      const limitationReason =
        compat.notes ||
        (compat.status === 'unverified'
          ? 'Capability support is unverified for Cursor.'
          : compat.status === 'excluded'
            ? 'This skill is excluded for Cursor due to unsupported capability requirements.'
            : 'Some capabilities may not be available in Cursor.');

      sections.push('');
      sections.push(`# ⚠ LIMITATION (${compat.status}/${compat.mode}): ${limitationReason}`);
      if (fm.capabilities?.fallback_notes) {
        sections.push(`# Fallback: ${fm.capabilities.fallback_notes}`);
      }
    }

    sections.push('');

    const body = skill.body?.trim();
    if (body) {
      sections.push(body);
    } else {
      sections.push(`# (skill body not available)`);
    }

    sections.push('');
    sections.push('');
  }

  return sections.join('\n').trim() + '\n';
}
