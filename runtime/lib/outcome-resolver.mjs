/**
 * outcome-resolver.mjs
 *
 * Pure resolver that computes an EffectiveOutcomeContract before runtime execution.
 */

const TOOL_OUTCOME_MAP = {
  sync_tools: 'runtime.sync-tools',
  list_tools: 'runtime.list-tools',
  get_config: 'runtime.get-config',
  skill_stats: 'runtime.skill-stats',
  context_cost: 'runtime.context-cost',
  validate_all: 'runtime.validate-all',
  mcp_list: 'runtime.mcp-list',
  mcp_add: 'runtime.mcp-add',
  mcp_remove: 'runtime.mcp-remove',
};

const OUTCOME_ROUTES = {
  'runtime.sync-tools': [
    { id: 'runtime.sync.sh', channel: 'script', equivalence: 'exact', requiredCapabilities: ['shell.exec'] },
    { id: 'runtime.manifest.sh', channel: 'script', equivalence: 'partial', requiredCapabilities: ['shell.exec'] },
  ],
  'runtime.list-tools': [
    { id: 'runtime.manifest.sh', channel: 'script', equivalence: 'exact', requiredCapabilities: ['shell.exec'] },
    { id: 'runtime.sync.sh --dry-run', channel: 'script', equivalence: 'partial', requiredCapabilities: ['shell.exec'] },
  ],
  'runtime.get-config': [
    { id: 'shared/lib/config-merger.sh', channel: 'script', equivalence: 'exact', requiredCapabilities: ['shell.exec'] },
  ],
  'runtime.skill-stats': [
    { id: 'ops/skill-stats.sh', channel: 'script', equivalence: 'exact', requiredCapabilities: ['shell.exec'] },
  ],
  'runtime.context-cost': [
    { id: 'ops/context-cost.sh', channel: 'script', equivalence: 'exact', requiredCapabilities: ['shell.exec'] },
  ],
  'runtime.validate-all': [
    { id: 'ops/validate-all.sh', channel: 'script', equivalence: 'exact', requiredCapabilities: ['shell.exec'] },
  ],
  'runtime.mcp-list': [
    { id: 'runtime/adapters/mcp-adapter.sh list', channel: 'script', equivalence: 'exact', requiredCapabilities: ['shell.exec'] },
  ],
  'runtime.mcp-add': [
    { id: 'runtime/adapters/mcp-adapter.sh add', channel: 'script', equivalence: 'exact', requiredCapabilities: ['shell.exec'] },
  ],
  'runtime.mcp-remove': [
    { id: 'runtime/adapters/mcp-adapter.sh remove', channel: 'script', equivalence: 'exact', requiredCapabilities: ['shell.exec'] },
  ],
};

const EQUIVALENCE_SCORE = {
  exact: 1,
  high: 0.85,
  partial: 0.6,
  low: 0.35,
};

export function identifyOutcome(toolName) {
  return TOOL_OUTCOME_MAP[toolName] || null;
}

export function loadOutcomeAndRoutes(outcomeId) {
  if (!outcomeId) return { outcomeId: null, routes: [] };
  return {
    outcomeId,
    routes: OUTCOME_ROUTES[outcomeId] ? [...OUTCOME_ROUTES[outcomeId]] : [],
  };
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

export function resolveEffectiveOutcomeContract({ toolName, executionChannel = 'mcp' }) {
  const identifiedOutcome = identifyOutcome(toolName);
  const { outcomeId, routes } = loadOutcomeAndRoutes(identifiedOutcome);
  const capabilityProfile = loadCapabilityProfile({ executionChannel });
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
