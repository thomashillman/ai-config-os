/**
 * build-platform-skills.mjs — Single-pass compatibility matrix processing.
 *
 * Combines zero-emit detection and platform-skill grouping into one loop
 * over the compatibility matrix (previously two separate loops in compile.mjs).
 */

/**
 * @param {Map<string, Map<string, {status: string, emit: boolean}>>} compatMatrix
 * @param {Map<string, {frontmatter: {status: string}}>} skillById
 * @returns {{ platformSkills: Object<string, Array>, zeroEmitSkills: string[], logLines: string[] }}
 */
export function buildPlatformSkillsAndCheckZeroEmit(compatMatrix, skillById) {
  const platformSkills = {};
  const zeroEmitSkills = [];
  const logLines = [];

  for (const [skillId, platResults] of compatMatrix) {
    const statuses = [];
    let hasEmit = false;

    for (const [pid, result] of platResults) {
      statuses.push(`${pid}:${result.status}`);
      if (result.emit) {
        hasEmit = true;
        if (!platformSkills[pid]) platformSkills[pid] = [];
        const skill = skillById.get(skillId);
        if (skill) platformSkills[pid].push(skill);
      }
    }

    const skill = skillById.get(skillId);
    if (skill && !hasEmit && skill.frontmatter.status !== "deprecated") {
      zeroEmitSkills.push(skillId);
    }

    logLines.push(`  ${skillId}: ${statuses.join(", ")}`);
  }

  return { platformSkills, zeroEmitSkills, logLines };
}
