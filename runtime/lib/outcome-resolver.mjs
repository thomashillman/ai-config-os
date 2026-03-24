/**
 * outcome-resolver.mjs
 *
 * Pure resolver that computes an EffectiveOutcomeContract before runtime execution.
 */

import { createCachedOutcomeDefinitionsLoader } from './outcome-definition-loader.mjs';

const EQUIVALENCE_SCORE = {
  exact: 1,
  high: 0.85,
  partial: 0.6,
  low: 0.35,
};

const defaultLoader = createCachedOutcomeDefinitionsLoader();
let outcomeDefinitionsLoader = defaultLoader;


function isDictionaryObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}


export function setOutcomeResolverLoader(loader) {
  if (typeof loader !== 'function') {
    throw new TypeError('setOutcomeResolverLoader requires a function loader');
  }
  outcomeDefinitionsLoader = loader;
}

export function resetOutcomeResolverLoader() {
  outcomeDefinitionsLoader = defaultLoader;
}

function loadDefinitions() {
  const definitions = outcomeDefinitionsLoader();
  if (!isDictionaryObject(definitions)) {
    throw new Error('Outcome resolver loader returned invalid definitions object');
  }

  const toolOutcomeMap = definitions.toolOutcomeMap ?? {};
  const outcomesById = definitions.outcomesById ?? {};
  const routesById = definitions.routesById ?? {};

  if (!isDictionaryObject(toolOutcomeMap)) {
    throw new Error('Outcome resolver definitions invalid: toolOutcomeMap must be an object');
  }
  if (!isDictionaryObject(outcomesById)) {
    throw new Error('Outcome resolver definitions invalid: outcomesById must be an object');
  }
  if (!isDictionaryObject(routesById)) {
    throw new Error('Outcome resolver definitions invalid: routesById must be an object');
  }

  return { toolOutcomeMap, outcomesById, routesById };
}

export function identifyOutcome(toolName, definitions = loadDefinitions()) {
  if (!toolName) return null;
  const { toolOutcomeMap } = definitions;
  return toolOutcomeMap[toolName] || null;
}

export function loadOutcomeAndRoutes(outcomeId, definitions = loadDefinitions()) {
  if (!outcomeId) return { outcomeId: null, routes: [] };

  const { outcomesById, routesById } = definitions;
  const outcomeDefinition = outcomesById[outcomeId];

  if (!outcomeDefinition) {
    return { outcomeId, routes: [] };
  }

  if (!Array.isArray(outcomeDefinition.routes)) {
    throw new Error(`Outcome '${outcomeId}' must define routes as an array`);
  }

  const routeIds = outcomeDefinition.routes;
  const routes = routeIds.map((routeId) => {
    const route = routesById[routeId];
    if (!route) {
      throw new Error(`Unknown route '${routeId}' for outcome '${outcomeId}'`);
    }
    return { ...route };
  });

  return { outcomeId, routes };
}

/**
 * Builds a static profile used only for route scoring heuristics.
 * This is intentionally synthetic and is not runtime-probed capability truth.
 */
export function buildStaticRouteScoringProfile({ executionChannel = 'mcp' } = {}) {
  // Synthetic-by-design defaults for deterministic scoring in pre-execution resolution.
  return {
    executionChannel,
    capabilities: {
      'shell.exec': 'supported',
      'json.output': 'supported',
    },
  };
}

function capabilityCoverage(route, capabilityProfile) {
  const required = Array.isArray(route.requiredCapabilities) ? route.requiredCapabilities : [];
  if (required.length === 0) return 1;

  let supported = 0;
  for (const capability of required) {
    const status = capabilityProfile.capabilities?.[capability] || 'unknown';
    if (status === 'supported') supported += 1;
  }

  return supported / required.length;
}

export function scoreRoutesByEquivalence(routes, capabilityProfile) {
  return [...routes]
    .map((route, index) => {
      const equivalence = EQUIVALENCE_SCORE[route.equivalence] ?? 0;
      const coverage = capabilityCoverage(route, capabilityProfile);
      const score = Number((equivalence * 0.7 + coverage * 0.3).toFixed(4));
      return {
        ...route,
        score,
        rank: index,
      };
    })
    .sort((a, b) => b.score - a.score || a.rank - b.rank)
    .map(({ rank, ...route }) => route);
}

export function resolveEffectiveOutcomeContract({ toolName, executionChannel = 'mcp', readFlags } = {}) {
  const routeScoringProfileSynthetic = buildStaticRouteScoringProfile({ executionChannel });
  const routeScoringProfileSource = 'synthetic-static';

  if (readFlags !== undefined && readFlags !== null) {
    const flags = readFlags();
    if (!flags.outcome_resolution_enabled) {
      return {
        toolName,
        outcomeId: null,
        capabilityProfile: routeScoringProfileSynthetic,
        routeScoringProfileSynthetic,
        routeScoringProfileSource,
        preferredRoute: null,
        fallbackRoutes: [],
        availableRoutes: [],
        bypassed: true,
      };
    }
  }

  const definitions = loadDefinitions();
  const identifiedOutcome = identifyOutcome(toolName, definitions);
  const { outcomeId, routes } = loadOutcomeAndRoutes(identifiedOutcome, definitions);
  const scoredRoutes = scoreRoutesByEquivalence(routes, routeScoringProfileSynthetic);

  return {
    toolName,
    outcomeId,
    capabilityProfile: routeScoringProfileSynthetic,
    routeScoringProfileSynthetic,
    routeScoringProfileSource,
    preferredRoute: scoredRoutes[0] || null,
    fallbackRoutes: scoredRoutes.slice(1),
    availableRoutes: scoredRoutes,
  };
}
