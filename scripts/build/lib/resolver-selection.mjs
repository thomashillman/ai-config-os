/**
 * resolver-selection.mjs
 *
 * Pure helpers for selecting a single route from a set of candidates.
 *
 * Contract:
 * 1) Highest score wins.
 * 2) Equal scores use deterministic tie-breaks.
 * 3) Equivalent routes collapse to the same selected outcome.
 */

/**
 * @param {object} route
 * @returns {number}
 */
export function scoreRoute(route) {
  const score = route?.score;
  return Number.isFinite(score) ? score : 0;
}

/**
 * Returns a deterministic key used to compare equal-score candidates.
 *
 * @param {object} route
 * @returns {string}
 */
export function routeTieBreakKey(route) {
  return String(
    route?.tieBreakKey ??
    route?.equivalenceKey ??
    route?.id ??
    route?.route ??
    route?.path ??
    ''
  );
}

/**
 * Select the best route from candidate routes.
 *
 * @param {object[]} routes
 * @returns {object|null}
 */
export function selectBestRoute(routes) {
  if (!Array.isArray(routes) || routes.length === 0) {
    return null;
  }

  let best = routes[0];

  for (const route of routes.slice(1)) {
    const bestScore = scoreRoute(best);
    const candidateScore = scoreRoute(route);

    if (candidateScore > bestScore) {
      best = route;
      continue;
    }

    if (candidateScore < bestScore) {
      continue;
    }

    const bestKey = routeTieBreakKey(best);
    const candidateKey = routeTieBreakKey(route);

    if (candidateKey < bestKey) {
      best = route;
    }
  }

  return best;
}

/**
 * Select a canonical outcome key for a request's candidate routes.
 * Equivalent routes should map to the same outcome key.
 *
 * @param {object[]} routes
 * @returns {string|null}
 */
export function selectRouteOutcome(routes) {
  const selected = selectBestRoute(routes);
  if (!selected) return null;
  return String(selected.equivalenceKey ?? selected.id ?? selected.route ?? selected.path ?? '');
}
