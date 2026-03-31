/**
 * emit-skill-tree.mjs
 * Copy one skill folder to dist: transformed SKILL.md + optional subdirs.
 */
import { mkdirSync, writeFileSync, readFileSync, cpSync } from "fs";
import { join } from "path";

const OPTIONAL_DIRS = ["prompts", "scripts", "references", "assets"];

/**
 * @param {object} opts
 * @param {object} opts.skill - { skillName, skillDir, filePath, frontmatter?, body? }
 * @param {string} opts.distSkillsDir - e.g. dist/clients/cursor/skills
 * @param {(raw: string, skill: object) => string} opts.transformSkillMd
 */
export function emitSkillFolder({ skill, distSkillsDir, transformSkillMd }) {
  const skillOutDir = join(distSkillsDir, skill.skillName);
  mkdirSync(skillOutDir, { recursive: true });

  const raw = readFileSync(skill.filePath, "utf8");
  writeFileSync(join(skillOutDir, "SKILL.md"), transformSkillMd(raw, skill));

  for (const dir of OPTIONAL_DIRS) {
    const src = join(skill.skillDir, dir);
    const dest = join(skillOutDir, dir);
    try {
      cpSync(src, dest, { recursive: true });
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
}

/**
 * @param {object[]} skills
 * @param {string} distSkillsDir
 * @param {(raw: string, skill: object) => string} transformSkillMd
 */
export function emitSkillTree(skills, distSkillsDir, transformSkillMd) {
  for (const skill of skills) {
    emitSkillFolder({ skill, distSkillsDir, transformSkillMd });
  }
}
