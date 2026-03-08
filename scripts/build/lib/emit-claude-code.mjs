/**
 * emit-claude-code.mjs
 * Emits claude-code platform artefacts for a set of skills.
 *
 * Portability Contract: Emitted packages are self-sufficient.
 * - All skill files are complete copies (not references) in dist/clients/claude-code/
 * - All paths in plugin.json are relative to package root
 * - No references to shared/skills/ or source tree
 * - Result can be distributed, cached, and used independently
 *
 * Output structure:
 *   dist/clients/claude-code/
 *     .claude-plugin/plugin.json
 *     skills/<skill-name>/SKILL.md
 *     skills/<skill-name>/prompts/   (if present in source)
 */
import { mkdirSync, writeFileSync, cpSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';

/**
 * @param {object[]} skills - Pre-filtered skills for claude-code (from compatibility resolution)
 * @param {object} opts
 * @param {string} opts.distDir - e.g. dist/clients/claude-code
 * @param {string} opts.releaseVersion - release version from VERSION file
 * @param {object|null} [opts.provenance] - optional provenance (release mode only)
 * @param {string} [opts.provenance.builtAt]
 * @param {string} [opts.provenance.buildId]
 * @param {string} [opts.provenance.sourceCommit]
 */
export function emitClaudeCode(skills, { distDir, releaseVersion, provenance }) {
  emitSkills(skills, distDir);

  const pluginJsonPath = join(distDir, '.claude-plugin', 'plugin.json');
  mkdirSync(dirname(pluginJsonPath), { recursive: true });

  const pluginJson = {
    name: 'core-skills',
    version: releaseVersion,
    description: 'Core AI Config OS skills',
    skills: skills.map(s => ({
      name: s.skillName,
      version: s.frontmatter.version || '1.0.0',
      path: `skills/${s.skillName}/SKILL.md`,
    })),
  };

  if (provenance) {
    if (provenance.builtAt) pluginJson.built_at = provenance.builtAt;
    if (provenance.buildId) pluginJson.build_id = provenance.buildId;
    if (provenance.sourceCommit) pluginJson.source_commit = provenance.sourceCommit;
  }

  writeFileSync(pluginJsonPath, JSON.stringify(pluginJson, null, 2) + '\n');
  console.log(`  [claude-code] plugin.json → ${pluginJsonPath}`);
}

function emitSkills(skills, distDir) {
  for (const skill of skills) {
    const skillOutDir = join(distDir, 'skills', skill.skillName);
    mkdirSync(skillOutDir, { recursive: true });

    // Copy SKILL.md
    const destSkillMd = join(skillOutDir, 'SKILL.md');
    writeFileSync(destSkillMd, readSkillMd(skill));

    // Copy prompts/ dir if present
    const promptsSrc = join(skill.skillDir, 'prompts');
    const promptsDest = join(skillOutDir, 'prompts');
    if (existsSync(promptsSrc)) {
      // Ensure parent of destination exists, then copy
      mkdirSync(dirname(promptsDest), { recursive: true });
      cpSync(promptsSrc, promptsDest, { recursive: true });
    }
  }
  console.log(`  [claude-code] emitted ${skills.length} skill(s) to ${distDir}/skills/`);
}

function readSkillMd(skill) {
  return readFileSync(skill.filePath, 'utf8');
}
