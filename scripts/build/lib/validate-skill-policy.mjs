/**
 * validate-skill-policy.mjs
 * Hard policy rules for skills (beyond schema).
 * Callable from both compiler and linter.
 */

/**
 * Validate skill policy rules.
 * @param {object} frontmatter - Parsed skill frontmatter
 * @param {string} skillName - Skill name (for error messages)
 * @param {Set<string>} [knownPlatforms] - Known platform IDs (optional)
 * @returns {object} { errors: string[], warnings: string[] }
 */
export function validateSkillPolicy(frontmatter, skillName, knownPlatforms = new Set()) {
  const errors = [];
  const warnings = [];

  // 1. No legacy flat capabilities array
  if (frontmatter.capabilities !== undefined && Array.isArray(frontmatter.capabilities)) {
    errors.push('Legacy flat capabilities array is forbidden. Use { required, optional, fallback_mode }.');
  }

  // 2. Overlapping required and optional capabilities
  if (
    frontmatter.capabilities &&
    typeof frontmatter.capabilities === 'object' &&
    !Array.isArray(frontmatter.capabilities)
  ) {
    const required = frontmatter.capabilities.required || [];
    const optional = frontmatter.capabilities.optional || [];
    const overlap = required.filter(c => optional.includes(c));
    if (overlap.length > 0) {
      errors.push(`Capability appears in both required and optional: ${overlap.join(', ')}`);
    }
  }

  // 3. Platform validation: unknown platforms and mode=excluded + allow_unverified
  if (frontmatter.platforms && typeof frontmatter.platforms === 'object') {
    for (const [pid, pOverride] of Object.entries(frontmatter.platforms)) {
      if (knownPlatforms.size > 0 && !knownPlatforms.has(pid)) {
        errors.push(`Unknown platform '${pid}'. Known: ${[...knownPlatforms].join(', ')}`);
      }

      if (pOverride && typeof pOverride === 'object') {
        // mode=excluded cannot have allow_unverified=true
        if (pOverride.mode === 'excluded' && pOverride.allow_unverified === true) {
          errors.push(`Platform '${pid}': mode=excluded cannot have allow_unverified=true.`);
        }
      }
    }
  }

  // 4. Hook skills must exclude platforms that can't package hooks
  if (frontmatter.type === 'hook' && frontmatter.platforms) {
    const nonHookPlatforms = ['claude-web', 'claude-ios', 'cursor', 'codex'];
    for (const pid of nonHookPlatforms) {
      if (frontmatter.platforms[pid] && frontmatter.platforms[pid].mode !== 'excluded') {
        errors.push(`Hook skill should exclude platform '${pid}' (no hook surface).`);
      }
    }
  }

  return { errors, warnings };
}

/**
 * Validate platform policy rules.
 * @param {object} platformDef - Parsed platform definition
 * @param {string} platformId - Platform ID (should match filename)
 * @returns {object} { errors: string[], warnings: string[] }
 */
export function validatePlatformPolicy(platformDef, platformId) {
  const errors = [];
  const warnings = [];

  // 1. Platform ID must match expected ID
  if (platformDef.id && platformDef.id !== platformId) {
    errors.push(
      `Platform id '${platformDef.id}' does not match filename '${platformId}.yaml'.`
    );
  }

  return { errors, warnings };
}
