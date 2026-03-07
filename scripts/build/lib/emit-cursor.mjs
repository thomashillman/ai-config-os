/**
 * emit-cursor.mjs
 * Emits Cursor platform artefacts from compatibility-filtered skills.
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
 * @param {string} opts.buildVersion - build version string
 * @param {string} opts.builtAt - ISO timestamp
 * @param {Map<string, Map<string, object>>} opts.compatMatrix - full compatibility matrix
 */
export function emitCursor(skills, { distDir, buildVersion, builtAt, compatMatrix }) {
  mkdirSync(distDir, { recursive: true });

  const sections = [];

  // Header
  sections.push(`# AI Config OS — Cursor Rules`);
  sections.push(`# Generated: ${builtAt}`);
  sections.push(`# Build: ${buildVersion}`);
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

    // Add degradation note if applicable
    if (compat?.mode === 'degraded') {
      sections.push('');
      sections.push(`# ⚠ DEGRADED: ${compat.notes || 'Some capabilities may not be available in Cursor.'}`);
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
