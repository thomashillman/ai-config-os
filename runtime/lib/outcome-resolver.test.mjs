import test from 'node:test';
import assert from 'node:assert/strict';
import {
  identifyOutcome,
  loadOutcomeAndRoutes,
  scoreRoutesByEquivalence,
  resolveEffectiveOutcomeContract,
  setOutcomeResolverLoader,
  resetOutcomeResolverLoader,
} from './outcome-resolver.mjs';

const FLAGS_RESOLUTION_OFF = () => ({
  outcome_resolution_enabled: false,
  effective_contract_required: false,
  remote_executor_enabled: false,
});

const FLAGS_RESOLUTION_ON = () => ({
  outcome_resolution_enabled: true,
  effective_contract_required: false,
  remote_executor_enabled: false,
});

test.afterEach(() => {
  resetOutcomeResolverLoader();
});

// --- Atom 3: Flag gate ---

test('resolveEffectiveOutcomeContract returns bypassed contract when outcome_resolution_enabled=false', () => {
  const contract = resolveEffectiveOutcomeContract({
    toolName: 'sync_tools',
    executionChannel: 'mcp',
    readFlags: FLAGS_RESOLUTION_OFF,
  });
  assert.equal(contract.outcomeId, null);
  assert.equal(contract.preferredRoute, null);
  assert.deepEqual(contract.fallbackRoutes, []);
  assert.equal(contract.bypassed, true);
  assert.equal(contract.toolName, 'sync_tools');
});

test('resolveEffectiveOutcomeContract resolves normally when outcome_resolution_enabled=true', () => {
  const contract = resolveEffectiveOutcomeContract({
    toolName: 'sync_tools',
    executionChannel: 'mcp',
    readFlags: FLAGS_RESOLUTION_ON,
  });
  assert.equal(contract.outcomeId, 'runtime.sync-tools');
  assert.ok(contract.preferredRoute !== null, 'should have a preferred route');
  assert.equal(contract.bypassed, undefined, 'bypassed should not be set in normal mode');
});

test('resolveEffectiveOutcomeContract behaves normally when readFlags is not provided (backward compat)', () => {
  const contract = resolveEffectiveOutcomeContract({
    toolName: 'sync_tools',
    executionChannel: 'mcp',
  });
  assert.equal(contract.outcomeId, 'runtime.sync-tools');
  assert.ok(contract.preferredRoute !== null);
});

test('loadOutcomeAndRoutes includes remote_exec route for runtime.sync-tools', () => {
  const { routes } = loadOutcomeAndRoutes('runtime.sync-tools');
  const remoteExecRoute = routes.find(r => r.channel === 'remote_exec');
  assert.ok(remoteExecRoute, 'runtime.sync-tools should have a remote_exec route');
  assert.equal(remoteExecRoute.id, 'remote-executor/execute');
  assert.equal(remoteExecRoute.equivalence, 'high');
});

test('loadOutcomeAndRoutes includes remote_exec route for runtime.list-tools', () => {
  const { routes } = loadOutcomeAndRoutes('runtime.list-tools');
  const remoteExecRoute = routes.find(r => r.channel === 'remote_exec');
  assert.ok(remoteExecRoute, 'runtime.list-tools should have a remote_exec route');
});

test('loadOutcomeAndRoutes includes remote_exec route for runtime.validate-all', () => {
  const { routes } = loadOutcomeAndRoutes('runtime.validate-all');
  const remoteExecRoute = routes.find(r => r.channel === 'remote_exec');
  assert.ok(remoteExecRoute, 'runtime.validate-all should have a remote_exec route');
});

// --- Loader-backed resolution tests ---

test('identifyOutcome resolves from injected loader definitions', () => {
  setOutcomeResolverLoader(() => ({
    toolOutcomeMap: { custom_tool: 'custom.outcome' },
    outcomesById: {},
    routesById: {},
  }));

  assert.equal(identifyOutcome('custom_tool'), 'custom.outcome');
  assert.equal(identifyOutcome('sync_tools'), null);
});

test('loadOutcomeAndRoutes throws descriptive error when outcome references unknown route', () => {
  setOutcomeResolverLoader(() => ({
    toolOutcomeMap: {},
    outcomesById: {
      'custom.outcome': { routes: ['missing.route'] },
    },
    routesById: {},
  }));

  assert.throws(
    () => loadOutcomeAndRoutes('custom.outcome'),
    /Unknown route 'missing.route' for outcome 'custom.outcome'/
  );
});

// --- Existing API surface tests ---

test('identifyOutcome returns correct outcomeId for known tools', () => {
  assert.equal(identifyOutcome('sync_tools'), 'runtime.sync-tools');
  assert.equal(identifyOutcome('list_tools'), 'runtime.list-tools');
  assert.equal(identifyOutcome('validate_all'), 'runtime.validate-all');
});

test('identifyOutcome returns null for unknown tool', () => {
  assert.equal(identifyOutcome('not_a_real_tool'), null);
  assert.equal(identifyOutcome(''), null);
});

test('scoreRoutesByEquivalence places exact above high above partial', () => {
  const routes = [
    { id: 'partial-route', channel: 'script', equivalence: 'partial', requiredCapabilities: ['shell.exec'] },
    { id: 'exact-route', channel: 'script', equivalence: 'exact', requiredCapabilities: ['shell.exec'] },
    { id: 'high-route', channel: 'remote_exec', equivalence: 'high', requiredCapabilities: ['remote.exec'] },
  ];
  const capabilityProfile = {
    executionChannel: 'mcp',
    capabilities: { 'shell.exec': 'supported', 'remote.exec': 'supported' },
  };
  const scored = scoreRoutesByEquivalence(routes, capabilityProfile);
  assert.equal(scored[0].id, 'exact-route', 'exact should rank first');
  assert.equal(scored[1].id, 'high-route', 'high should rank second');
  assert.equal(scored[2].id, 'partial-route', 'partial should rank third');
});
