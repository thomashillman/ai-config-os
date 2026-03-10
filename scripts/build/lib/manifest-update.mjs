/**
 * Manifest Update Utility
 *
 * Centralizes logic for updating shared/manifest.md with new skills.
 * Ensures correct insertion into the Skills table and auto-populates description.
 */

import { readFileSync, writeFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';

/**
 * Extract description from skill frontmatter
 * @param {string} skillContent - Full SKILL.md file content
 * @returns {string} Description line (first line of description field)
 */
export function extractDescription(skillContent) {
  const frontmatterMatch = skillContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch) {
    return 'TODO: add description from SKILL.md frontmatter';
  }

  try {
    const frontmatter = parseYaml(frontmatterMatch[1], { strict: false });
    if (typeof frontmatter?.description === 'string') {
      const firstLine = frontmatter.description
        .split(/\r?\n/)
        .map(line => line.trim())
        .find(Boolean);
      if (firstLine) {
        return firstLine;
      }
    }
  } catch {
    // Fall through to placeholder to keep scaffolding resilient.
  }

  return 'TODO: add description from SKILL.md frontmatter';
}

/**
 * Update manifest.md with new skill entry
 * @param {string} manifestPath - Path to shared/manifest.md
 * @param {string} skillName - Kebab-case skill name
 * @param {string} description - Skill description
 * @throws {Error} If manifest structure is invalid
 */
export function updateManifestWithSkill(manifestPath, skillName, description) {
  const manifest = readFileSync(manifestPath, 'utf8');

  // Find the Skills section
  const skillsHeadingIdx = manifest.indexOf('## Skills');
  if (skillsHeadingIdx === -1) {
    throw new Error('## Skills heading not found in manifest');
  }

  // Find the table header (the line with |---|---|---|)
  const tableHeaderRegex = /\n\|---\|---\|---\|\n/;
  const headerMatch = manifest.slice(skillsHeadingIdx).match(tableHeaderRegex);
  if (!headerMatch) {
    throw new Error('Skill table header not found in manifest');
  }

  // Find where to insert: before the first blank line or section heading after Skills table
  const startOfTable = skillsHeadingIdx + headerMatch[0].length;

  // Find the next section heading (## Workflows, ## Plugins, etc.)
  const nextSectionMatch = manifest.slice(startOfTable).match(/\n\n## /);
  if (!nextSectionMatch) {
    throw new Error('No section boundary found after Skills table');
  }

  const insertIdx = startOfTable + nextSectionMatch.index;

  // Create the new row
  const row = `| \`${skillName}\` | ${description} | \`shared/skills/${skillName}/SKILL.md\` |`;

  // Insert the row with a newline
  const updated = manifest.slice(0, insertIdx) + '\n' + row + manifest.slice(insertIdx);

  writeFileSync(manifestPath, updated);
}
