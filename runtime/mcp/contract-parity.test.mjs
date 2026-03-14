import test from 'node:test';
import assert from 'node:assert/strict';
import { createCallToolHandler } from './handlers.mjs';
import { createDashboardApi } from './dashboard-api.mjs';

function makeFakeApp() {
  const getRoutes = new Map();
  return {
    use() {},
    post() {},
    get(path, handler) { getRoutes.set(path, handler); },
    listen() { return { close() {} }; },
    getRoute(path) { return getRoutes.get(path); },
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
    tunnelPolicy: { host: '127.0.0.1' },
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
