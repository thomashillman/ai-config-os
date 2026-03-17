/**
 * emit-codex.mjs
 * Emits Codex platform artefacts from compatibility-filtered skills.
 *
 * Portability Contract: Codex instructions file is self-contained.
 * - All skill content is concatenated into a single AGENTS.md file
 * - No file paths pointing to shared/skills/ or source tree
 * - Compatible with Codex agent skills standard (same SKILL.md format)
 * - Degradation notes explain capability limitations inline
 *
 * Output: dist/clients/codex/AGENTS.md
 *
 * Format: Markdown document with skill sections — loaded as Codex system instructions.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * @param {object[]} skills - Pre-filtered skills for codex (from compatibility resolution)
 * @param {object} opts
 * @param {string} opts.distDir - e.g. dist/clients/codex
 * @param {string} opts.releaseVersion - release version from VERSION file
 * @param {object|null} [opts.provenance] - optional provenance (release mode only)
 * @param {Map<string, Map<string, object>>} opts.compatMatrix - full compatibility matrix
 */
export function emitCodex(skills, { distDir, releaseVersion, provenance, compatMatrix }) {
  mkdirSync(distDir, { recursive: true });

  const sections = [];

  // Header
  sections.push(`# AI Config OS — Codex Agent Instructions`);
  sections.push(`# Version: ${releaseVersion}`);
  if (provenance?.builtAt) sections.push(`# Built: ${provenance.builtAt}`);
  if (provenance?.buildId) sections.push(`# Build ID: ${provenance.buildId}`);
  if (provenance?.sourceCommit) sections.push(`# Source Commit: ${provenance.sourceCommit}`);
  sections.push(`# Skills: ${skills.length}`);
  sections.push('');
  sections.push('These instructions define skills for AI coding assistant agents.');
  sections.push('Each skill section describes a behaviour, capability, or protocol to follow.');
  sections.push('');

  for (const skill of skills) {
    const fm = skill.frontmatter;
    const skillId = skill.skillName;

    // Get compatibility info for degradation notes
    const compat = compatMatrix?.get(skillId)?.get('codex');

    sections.push(`## ${fm.skill || skillId}`);

    if (fm.description) {
      sections.push('');
      sections.push(`> ${fm.description.trim().split('\n')[0]}`);
    }

    // Add limitation note for degraded/excluded compatibility
    const hasLimitation = compat && (compat.mode !== 'native' || compat.status !== 'supported');
    if (hasLimitation) {
      const limitationReason =
        compat.notes ||
        (compat.status === 'unverified'
          ? 'Capability support is unverified for Codex.'
          : compat.status === 'excluded'
            ? 'This skill is excluded for Codex due to unsupported capability requirements.'
            : 'Some capabilities may not be available in Codex.');

      sections.push('');
      sections.push(`> ⚠ **Limitation (${compat.status}/${compat.mode}):** ${limitationReason}`);
      if (fm.capabilities?.fallback_notes) {
        sections.push(`> Fallback: ${fm.capabilities.fallback_notes}`);
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
        sections.push(`_(skill body not available)_`);
      }
    }

    sections.push('');
    sections.push('---');
    sections.push('');
  }

  const agentsContent = sections.join('\n').trim() + '\n';
  const agentsPath = join(distDir, 'AGENTS.md');
  writeFileSync(agentsPath, agentsContent);
  console.log(`  [codex] AGENTS.md → ${agentsPath} (${skills.length} skill(s))`);
}
