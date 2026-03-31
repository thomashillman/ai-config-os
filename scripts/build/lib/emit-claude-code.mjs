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
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { emitSkillTree } from "./emit-skill-tree.mjs";

/**
 * Normalize SKILL.md for Claude Code: inject `name:` from `skill:` when missing.
 *
 * @param {string} raw
 * @param {object} skill
 * @returns {string}
 */
export function transformSkillMdForClaude(raw, skill) {
  const normalized = raw.replace(/\r\n/g, "\n");
  const skillName = skill.frontmatter?.skill || skill.skillName;

  if (skill.frontmatter?.name) {
    return normalized;
  }

  return normalized.replace(/^---\n/, `---\nname: ${skillName}\n`);
}

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
export function emitClaudeCode(
  skills,
  { distDir, releaseVersion, provenance },
) {
  const distSkillsDir = join(distDir, "skills");
  emitSkillTree(skills, distSkillsDir, transformSkillMdForClaude);
  console.log(
    `  [claude-code] emitted ${skills.length} skill(s) to ${distDir}/skills/`,
  );

  const pluginJsonPath = join(distDir, ".claude-plugin", "plugin.json");
  mkdirSync(dirname(pluginJsonPath), { recursive: true });

  const pluginJson = {
    name: "core-skills",
    version: releaseVersion,
    description: "Core AI Config OS skills",
    skills: skills.map((s) => ({
      name: s.skillName,
      version: s.frontmatter.version || "1.0.0",
      path: `skills/${s.skillName}/SKILL.md`,
    })),
  };

  if (provenance) {
    if (provenance.builtAt) pluginJson.built_at = provenance.builtAt;
    if (provenance.buildId) pluginJson.build_id = provenance.buildId;
    if (provenance.sourceCommit)
      pluginJson.source_commit = provenance.sourceCommit;
  }

  writeFileSync(pluginJsonPath, JSON.stringify(pluginJson, null, 2) + "\n");
  console.log(`  [claude-code] plugin.json → ${pluginJsonPath}`);
}
