/**
 * upgrade-explanations.mjs
 *
 * Static lookup data: route-pair → structured upgrade explanation.
 * No I/O, no side effects.
 */

const UPGRADE_TEMPLATES = Object.freeze({
  'pasted_diff:uploaded_bundle': {
    before: 'Using pasted diff, only changed lines can be inspected',
    now: 'Diff analysis is available',
    unlocks: 'File bundle context enables cross-file impact analysis',
  },
  'pasted_diff:github_pr': {
    before: 'Using pasted diff, only changed lines can be inspected',
    now: 'Diff analysis is available',
    unlocks: 'GitHub PR context enables branch history and related code inspection',
  },
  'pasted_diff:local_repo': {
    before: 'Using pasted diff, only changed lines can be inspected',
    now: 'Diff analysis is available',
    unlocks: 'Full repository access enables call site verification, dependency impact analysis, and related test inspection',
  },
  'uploaded_bundle:github_pr': {
    before: 'Bundle files are analysed in isolation',
    now: 'File bundle context is available',
    unlocks: 'GitHub context enables branch history and PR metadata inspection',
  },
  'uploaded_bundle:local_repo': {
    before: 'Bundle files are analysed in isolation',
    now: 'File bundle context is available',
    unlocks: 'Full repository access enables call site verification and dependency impact',
  },
  'github_pr:local_repo': {
    before: 'PR context is available from GitHub',
    now: 'PR metadata and changed files are inspected',
    unlocks: 'Full repository access enables complete call site verification and test inspection',
  },
});

/**
 * Returns structured upgrade explanation for a route transition.
 * @param {string} fromRouteId - current (weaker) route
 * @param {string} toRouteId - target (stronger) route
 * @returns {{ before: string, now: string, unlocks: string } | null}
 */
export function getUpgradeExplanation(fromRouteId, toRouteId) {
  if (!fromRouteId || !toRouteId) return null;
  const key = `${fromRouteId}:${toRouteId}`;
  const template = UPGRADE_TEMPLATES[key];
  return template ? { ...template } : null;
}
