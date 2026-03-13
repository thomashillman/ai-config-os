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
  if (!definitions || typeof definitions !== 'object') {
    throw new Error('Outcome resolver loader returned invalid definitions object');
  }

  return {
    toolOutcomeMap: definitions.toolOutcomeMap ?? {},
    outcomesById: definitions.outcomesById ?? {},
    routesById: definitions.routesById ?? {},
  };
}

export function identifyOutcome(toolName) {
  if (!toolName) return null;
  const { toolOutcomeMap } = loadDefinitions();
  return toolOutcomeMap[toolName] || null;
}

export function loadOutcomeAndRoutes(outcomeId) {
  if (!outcomeId) return { outcomeId: null, routes: [] };

  const { outcomesById, routesById } = loadDefinitions();
  const outcomeDefinition = outcomesById[outcomeId];

  if (!outcomeDefinition) {
    return { outcomeId, routes: [] };
  }

  const routeIds = Array.isArray(outcomeDefinition.routes) ? outcomeDefinition.routes : [];
  const routes = routeIds.map((routeId) => {
    const route = routesById[routeId];
    if (!route) {
      throw new Error(`Unknown route '${routeId}' for outcome '${outcomeId}'`);
    }
    return { ...route };
  });

  return { outcomeId, routes };
}

export function loadCapabilityProfile({ executionChannel = 'mcp' } = {}) {
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
  const capabilityProfile = loadCapabilityProfile({ executionChannel });

  if (readFlags !== undefined && readFlags !== null) {
    const flags = readFlags();
    if (!flags.outcome_resolution_enabled) {
      return {
        toolName,
        outcomeId: null,
        capabilityProfile,
        preferredRoute: null,
        fallbackRoutes: [],
        availableRoutes: [],
        bypassed: true,
      };
    }
  }

  const identifiedOutcome = identifyOutcome(toolName);
  const { outcomeId, routes } = loadOutcomeAndRoutes(identifiedOutcome);
  const scoredRoutes = scoreRoutesByEquivalence(routes, capabilityProfile);

  return {
    toolName,
    outcomeId,
    capabilityProfile,
    preferredRoute: scoredRoutes[0] || null,
    fallbackRoutes: scoredRoutes.slice(1),
    availableRoutes: scoredRoutes,
  };
}
