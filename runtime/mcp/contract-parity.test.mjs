import test from 'node:test';
import assert from 'node:assert/strict';
import { createCallToolHandler } from './handlers.mjs';
import { createDashboardApi } from './dashboard-api.mjs';

function makeFakeApp() {
  const getRoutes = new Map();
  const postRoutes = new Map();
  return {
    use() {},
    post(path, handler) { postRoutes.set(path, handler); },
    get(path, handler) { getRoutes.set(path, handler); },
    listen() { return { close() {} }; },
    getRoute(path) { return getRoutes.get(path); },
    postRoute(path) { return postRoutes.get(path); },
  };
}

test('MCP and dashboard contract-resolution surfaces agree on route identity', async () => {
  const resolver = ({ toolName, executionChannel }) => ({
    outcomeId: `runtime.${toolName}`,
    selectedChannel: executionChannel,
    preferredRoute: { id: 'runtime/manifest.sh', args: ['status'] },
  });

  const handler = createCallToolHandler({
    runScript: () => ({ success: true, output: '' }),
    validateName: () => {},
    validateNumber: (value, fallback) => value ?? fallback,
    isCommandNameSafe: () => true,
    resolveEffectiveOutcomeContract: resolver,
    toToolResponse: () => ({ content: [{ type: 'text', text: 'ok' }] }),
    toolError: (message) => ({ isError: true, content: [{ type: 'text', text: message }] }),
    taskService: {
      startReviewRepositoryTask: () => ({}),
      resumeReviewRepositoryTask: () => ({}),
      getReadiness: () => ({}),
    },
  });

  const mcpResponse = await handler({ params: { name: 'resolve_outcome_contract', arguments: { tool_name: 'list_tools' } } });
  const mcpContract = JSON.parse(mcpResponse.content[0].text);

  const app = makeFakeApp();
  createDashboardApi({
    app,
    corsMiddleware: () => () => {},
    jsonMiddleware: () => () => {},
    tunnelPolicy: { host: '127.0.0.1', isOriginAllowed: () => true },
    tunnelGuardFactory: () => () => {},
    runScript: () => ({ success: true, output: '' }),
    resolveEffectiveOutcomeContract: resolver,
    validateNumber: (value, fallback) => value ?? fallback,
    capabilityProfileResolver: { getCachedProfile: () => null },
    taskService: null,
    repoRoot: '/repo',
    port: 4242,
  });

  const route = app.getRoute('/api/outcome-contract');
  let jsonPayload = null;
  route({ query: { tool_name: 'list_tools' } }, { json(payload) { jsonPayload = payload; } });

  assert.equal(mcpContract.preferredRoute.id, jsonPayload.effectiveOutcomeContract.preferredRoute.id);
  assert.deepEqual(mcpContract.preferredRoute.args, jsonPayload.effectiveOutcomeContract.preferredRoute.args);
});

test('MCP and dashboard script-wrapper actions resolve to equivalent command mappings', async () => {
  const mcpCalls = [];
  const dashboardCalls = [];
  const resolver = ({ toolName, executionChannel }) => ({
    outcomeId: `runtime.${toolName}`,
    selectedChannel: executionChannel,
    preferredRoute: null,
  });

  const handler = createCallToolHandler({
    runScript: (command, args = []) => {
      mcpCalls.push({ command, args });
      return { success: true, output: '' };
    },
    validateName: () => {},
    validateNumber: (value, fallback) => (value ?? fallback),
    isCommandNameSafe: () => true,
    resolveEffectiveOutcomeContract: resolver,
    toToolResponse: () => ({ content: [{ type: 'text', text: 'ok' }] }),
    toolError: (message) => ({ isError: true, content: [{ type: 'text', text: message }] }),
    taskService: {
      startReviewRepositoryTask: () => ({}),
      resumeReviewRepositoryTask: () => ({}),
      getReadiness: () => ({}),
    },
  });

  const app = makeFakeApp();
  createDashboardApi({
    app,
    corsMiddleware: () => () => {},
    jsonMiddleware: () => () => {},
    tunnelPolicy: { host: '127.0.0.1' },
    tunnelGuardFactory: () => () => {},
    runScript: (command, args = []) => {
      dashboardCalls.push({ command, args });
      return { success: true, output: '' };
    },
    resolveEffectiveOutcomeContract: resolver,
    validateNumber: (value, fallback) => (value ?? fallback),
    capabilityProfileResolver: { getCachedProfile: () => null },
    taskService: null,
    repoRoot: '/repo',
    port: 4242,
  });

  const fixtures = [
    { tool: 'list_tools', route: 'GET', path: '/api/manifest', mcpArgs: {}, req: { query: {} } },
    { tool: 'sync_tools', route: 'POST', path: '/api/sync', mcpArgs: { dry_run: true }, req: { body: { dry_run: true } } },
    { tool: 'get_config', route: 'GET', path: '/api/config', mcpArgs: {}, req: { query: {} } },
    { tool: 'skill_stats', route: 'GET', path: '/api/skill-stats', mcpArgs: {}, req: { query: {} } },
    { tool: 'context_cost', route: 'GET', path: '/api/context-cost', mcpArgs: { threshold: 3000 }, req: { query: { threshold: 3000 } } },
    { tool: 'validate_all', route: 'GET', path: '/api/validate-all', mcpArgs: {}, req: { query: {} } },
  ];

  for (const fixture of fixtures) {
    await handler({ params: { name: fixture.tool, arguments: fixture.mcpArgs } });

    const routeHandler = fixture.route === 'POST'
      ? app.postRoute(fixture.path)
      : app.getRoute(fixture.path);
    routeHandler(fixture.req, { json() {}, status() { return this; } });
  }

  assert.equal(mcpCalls.length, fixtures.length);
  assert.equal(dashboardCalls.length, fixtures.length);
  assert.deepEqual(
    mcpCalls.map((entry) => [entry.command, entry.args]),
    dashboardCalls.map((entry) => [entry.command, entry.args])
  );
});
