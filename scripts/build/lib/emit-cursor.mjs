/**
 * emit-cursor.mjs
 * Emits Cursor platform artefacts from compatibility-filtered skills.
 *
 * Portability Contract: Cursor .cursorrules are self-contained documents.
 * - All skill content is concatenated into a single file (no external references)
 * - No file paths pointing to shared/skills/ or source tree
 * - Degradation notes explain capability limitations inline
 *
 * Output: dist/clients/cursor/.cursorrules
 *
 * Format: concatenated skill prompts with section headers.
 * Degraded skills get a note explaining the limitation.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';

/**
 * @param {object[]} skills - Pre-filtered skills for cursor (from compatibility resolution)
 * @param {object} opts
 * @param {string} opts.distDir - e.g. dist/clients/cursor
 * @param {string} opts.releaseVersion - release version from VERSION file
 * @param {object|null} [opts.provenance] - optional provenance (release mode only)
 * @param {Map<string, Map<string, object>>} opts.compatMatrix - full compatibility matrix
 */
export function emitCursor(skills, { distDir, releaseVersion, provenance, compatMatrix }) {
  mkdirSync(distDir, { recursive: true });

  const sections = [];

  // Header
  sections.push(`# AI Config OS — Cursor Rules`);
  sections.push(`# Version: ${releaseVersion}`);
  // Provenance: consistent with emit-claude-code.mjs — all three fields in release mode
  if (provenance?.builtAt) sections.push(`# Built: ${provenance.builtAt}`);
  if (provenance?.buildId) sections.push(`# Build ID: ${provenance.buildId}`);
  if (provenance?.sourceCommit) sections.push(`# Source Commit: ${provenance.sourceCommit}`);
  sections.push(`# Skills: ${skills.length}`);
  sections.push('');

  for (const skill of skills) {
    const fm = skill.frontmatter;
    const skillId = skill.skillName;

    // Get compatibility info for degradation notes
    const compat = compatMatrix?.get(skillId)?.get('cursor');

    sections.push(`# ─── ${fm.skill || skillId} ───`);

    if (fm.description) {
      sections.push(`# ${fm.description.trim().split('\n')[0]}`);
    }

    // Add limitation note for any non-native/non-supported compatibility result
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

    // Emit skill body (the prompt content after frontmatter)
    const body = skill.body?.trim();
    if (body) {
      sections.push(body);
    } else {
      // Read from file if body not in parsed object
      try {
        const raw = readFileSync(skill.filePath, 'utf8');
        const fmEnd = raw.indexOf('---', raw.indexOf('---') + 3);
        if (fmEnd !== -1) {
          const content = raw.slice(fmEnd + 3).trim();
          if (content) {
            sections.push(content);
          }
        }
      } catch {
        sections.push(`# (skill body not available)`);
      }
    }

    sections.push('');
    sections.push('');
  }

  const rulesContent = sections.join('\n').trim() + '\n';
  const rulesPath = join(distDir, '.cursorrules');
  writeFileSync(rulesPath, rulesContent);
  console.log(`  [cursor] .cursorrules → ${rulesPath} (${skills.length} skill(s))`);
}
