/**
 * resolve-compatibility.mjs
 * Computes per-skill, per-platform compatibility from capability contracts
 * and platform capability states.
 *
 * Algorithm:
 * 1. Read the platform capability states
 * 2. Read skill.capabilities.required
 * 3. If any required capability is unsupported → excluded
 * 4. If any required capability is unknown → unverified
 * 5. If all required capabilities are supported → supported
 * 6. Apply skill override from platforms.<id>:
 *    - mode: excluded forces exclusion
 *    - package overrides the platform default
 *    - allow_unverified: true permits emission for unverified surfaces
 *    - mode: degraded is allowed only if fallback_mode != none
 * 7. Optional capabilities never block emission
 * 8. If supported → emit using platform default package unless overridden
 * 9. If unverified → do not emit unless skill override allow_unverified: true
 * 10. If excluded → do not emit
 */

/**
 * @typedef {Object} CompatibilityResult
 * @property {string} status - 'supported' | 'unverified' | 'excluded'
 * @property {string} mode - 'native' | 'transformed' | 'degraded' | 'excluded'
 * @property {string} package - packaging format
 * @property {boolean} emit - whether to emit artefacts
 * @property {string} [notes] - human explanation
 * @property {string[]} [unsupported] - capabilities that caused exclusion
 * @property {string[]} [unknown] - capabilities with unknown state
 */

/**
 * Resolve compatibility for one skill against one platform.
 *
 * @param {object} skillFrontmatter - The skill's parsed frontmatter
 * @param {object} platform - The platform definition
 * @returns {CompatibilityResult}
 */
export function resolveSkillPlatform(skillFrontmatter, platform) {
  const caps = skillFrontmatter.capabilities || {};
  const required = Array.isArray(caps.required) ? caps.required : [];
  const fallbackMode = caps.fallback_mode || 'none';
  const override = (skillFrontmatter.platforms || {})[platform.id] || {};

  // Check if skill explicitly excludes this platform
  if (override.mode === 'excluded') {
    return {
      status: 'excluded',
      mode: 'excluded',
      package: override.package || platform.default_package,
      emit: false,
      notes: override.notes || 'Explicitly excluded by skill override.',
    };
  }

  // Evaluate required capabilities
  const unsupported = [];
  const unknown = [];

  for (const cap of required) {
    const state = platform.capabilities?.[cap];
    const status = state?.status || 'unknown';

    if (status === 'unsupported') {
      unsupported.push(cap);
    } else if (status === 'unknown') {
      unknown.push(cap);
    }
  }

  // Determine base status
  let status;
  if (unsupported.length > 0) {
    status = 'excluded';
  } else if (unknown.length > 0) {
    status = 'unverified';
  } else {
    status = 'supported';
  }

  // Determine mode
  let mode;
  if (status === 'excluded') {
    mode = 'excluded';
  } else if (override.mode) {
    mode = override.mode;
  } else if (status === 'unverified') {
    // Default to degraded for unverified if skill can degrade
    mode = fallbackMode !== 'none' ? 'degraded' : 'native';
  } else {
    mode = 'native';
  }

  // Validate degraded mode
  if (mode === 'degraded' && fallbackMode === 'none') {
    mode = 'native'; // Can't degrade if no fallback
  }

  // Determine emission
  let emit;
  if (status === 'excluded') {
    emit = false;
  } else if (status === 'unverified') {
    emit = override.allow_unverified === true;
  } else {
    emit = true;
  }

  // Determine package
  const pkg = override.package || platform.default_package;

  // Build notes
  let notes = override.notes || '';
  if (unsupported.length > 0) {
    notes = `Excluded: unsupported capabilities [${unsupported.join(', ')}]. ${notes}`.trim();
  }
  if (unknown.length > 0 && !notes) {
    notes = `Unverified: unknown capabilities [${unknown.join(', ')}].`;
  }

  return {
    status,
    mode,
    package: pkg,
    emit,
    ...(notes ? { notes } : {}),
    ...(unsupported.length > 0 ? { unsupported } : {}),
    ...(unknown.length > 0 ? { unknown } : {}),
  };
}

/**
 * Build a cache key from the parts of skillFrontmatter that affect resolution
 * for a specific platform. Skills sharing identical capability declarations and
 * platform overrides will map to the same key and reuse a cached result.
 *
 * @param {object} frontmatter
 * @param {string} platformId
 * @returns {string}
 */
function buildCacheKey(frontmatter, platformId) {
  const caps = frontmatter.capabilities || {};
  const required = Array.isArray(caps.required)
    ? [...caps.required].sort().join(',')
    : '';
  const fallbackMode = caps.fallback_mode || 'none';
  const override = (frontmatter.platforms || {})[platformId];
  const overrideStr = override ? JSON.stringify(override) : '';
  return `${required}|${fallbackMode}|${platformId}|${overrideStr}`;
}

/**
 * Resolve compatibility for all skills against all platforms.
 *
 * @param {object[]} skills - Parsed skills with frontmatter
 * @param {Map<string, object>} platforms - Platform definitions
 * @returns {Map<string, Map<string, CompatibilityResult>>} skillId → platformId → result
 */
export function resolveAll(skills, platforms) {
  const matrix = new Map();
  const cache = new Map();

  for (const skill of skills) {
    const skillId = skill.skillName || skill.frontmatter?.skill;
    const skillResults = new Map();

    for (const [platformId, platform] of platforms) {
      const key = buildCacheKey(skill.frontmatter, platformId);
      let result = cache.get(key);
      if (!result) {
        result = resolveSkillPlatform(skill.frontmatter, platform);
        cache.set(key, result);
      }
      skillResults.set(platformId, result);
    }

    matrix.set(skillId, skillResults);
  }

  return matrix;
}

/**
 * Validate outcomes against route definitions and known capability IDs.
 *
 * @param {Map<string, object>} outcomes - Outcome definitions keyed by id
 * @param {Map<string, object>} routes - Route definitions keyed by id
 * @param {Set<string>} knownCapabilityIds - Known capability IDs from schema
 * @returns {{errors: string[]}}
 */
export function validateOutcomeCompatibility(outcomes, routes, knownCapabilityIds) {
  const errors = [];
  const invalidRoutes = new Set();

  const getStringArray = (value, fieldLabel) => {
    if (value == null) return [];
    if (!Array.isArray(value)) {
      errors.push(`${fieldLabel} must be an array`);
      return [];
    }
    return value.filter(item => typeof item === 'string');
  };

  for (const [routeId, route] of routes) {
    const routeCapabilities = getStringArray(route.capabilities, `route '${routeId}'.capabilities`);
    const unknownRouteCapabilities = routeCapabilities.filter(
      capabilityId => !knownCapabilityIds.has(capabilityId)
    );

    if (unknownRouteCapabilities.length > 0) {
      invalidRoutes.add(routeId);
      errors.push(`route '${routeId}' references unknown capabilities: ${unknownRouteCapabilities.join(', ')}`);
    }
  }

  for (const [outcomeId, outcome] of outcomes) {
    const outcomeCapabilities = getStringArray(outcome.capabilities, `outcome '${outcomeId}'.capabilities`);
    const unknownOutcomeCapabilities = outcomeCapabilities.filter(
      capabilityId => !knownCapabilityIds.has(capabilityId)
    );

    if (unknownOutcomeCapabilities.length > 0) {
      errors.push(
        `outcome '${outcomeId}' references unknown capabilities: ${unknownOutcomeCapabilities.join(', ')}`
      );
    }

    const unknownRoutes = [];
    let resolvableRouteCount = 0;

    const outcomeRoutes = getStringArray(outcome.routes, `outcome '${outcomeId}'.routes`);

    for (const routeId of outcomeRoutes) {
      const route = routes.get(routeId);
      if (!route) {
        unknownRoutes.push(routeId);
        continue;
      }

      if (invalidRoutes.has(routeId)) {
        continue;
      }

      resolvableRouteCount += 1;
    }

    if (unknownRoutes.length > 0) {
      errors.push(`outcome '${outcomeId}' references unknown routes: ${unknownRoutes.join(', ')}`);
    }

    if (resolvableRouteCount === 0) {
      errors.push(
        `outcome '${outcomeId}' has no resolvable route set (all routes are unknown or invalid)`
      );
    }
  }

  return { errors };
}
