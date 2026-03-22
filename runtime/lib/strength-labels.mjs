/**
 * strength-labels.mjs
 *
 * Pure lookup table: route ID → user-facing strength descriptor.
 * No I/O, no side effects.
 */

const STRENGTH_MAP = {
  pasted_diff: {
    level: 'limited',
    label: 'Diff-only review',
    description: 'Can inspect changed lines only',
  },
  uploaded_bundle: {
    level: 'partial',
    label: 'Bundle review',
    description: 'Can inspect included files',
  },
  github_pr: {
    level: 'guided',
    label: 'GitHub-level inspection',
    description: 'Can inspect PR metadata, changed files, and related context',
  },
  local_repo: {
    level: 'full',
    label: 'Full repository analysis',
    description: 'Can inspect all files, dependencies, tests, and history',
  },
};

/**
 * Ordinal ordering of strength levels (weakest → strongest).
 */
export const STRENGTH_ORDER = ['limited', 'partial', 'guided', 'full'];

/**
 * Returns the strength descriptor for a route ID.
 * @param {string} routeId
 * @returns {{ level: string, label: string, description: string }}
 * @throws {Error} if routeId is unknown
 */
export function getStrengthLabel(routeId) {
  const entry = STRENGTH_MAP[routeId];
  if (!entry) {
    throw new Error(`Unknown route ID: "${routeId}". Expected one of: ${Object.keys(STRENGTH_MAP).join(', ')}`);
  }
  return { ...entry };
}

/**
 * Compares two strength levels by ordinal position.
 * @param {string} a - level string (e.g. "limited")
 * @param {string} b - level string
 * @returns {-1|0|1}  -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareStrength(a, b) {
  const ai = STRENGTH_ORDER.indexOf(a);
  const bi = STRENGTH_ORDER.indexOf(b);
  if (ai === -1) throw new Error(`Unknown strength level: "${a}"`);
  if (bi === -1) throw new Error(`Unknown strength level: "${b}"`);
  if (ai < bi) return -1;
  if (ai > bi) return 1;
  return 0;
}
