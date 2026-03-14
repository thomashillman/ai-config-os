import test from 'node:test';
import assert from 'node:assert/strict';
import { createCallToolHandler } from './handlers.mjs';

function makeDeps({ outcomeId = null, readFlags = null } = {}) {
  return {
    runScript: () => ({ stdout: 'ok', stderr: '', exitCode: 0 }),
    validateName: () => {},
    validateNumber: (v, def) => (v !== undefined ? v : def),
    isCommandNameSafe: () => true,
    resolveEffectiveOutcomeContract: () => ({
      toolName: 'sync_tools',
      outcomeId,
      capabilityProfile: { executionChannel: 'mcp', capabilities: {} },
      preferredRoute: outcomeId ? { id: 'runtime/sync.sh', channel: 'script' } : null,
      fallbackRoutes: [],
      availableRoutes: [],
    }),
    toToolResponse: (_result, _contract, _profile) => ({
      content: [{ type: 'text', text: 'success' }],
    }),
    toolError: (msg, _profile) => ({
      content: [{ type: 'text', text: `ERROR: ${msg}` }],
      isError: true,
    }),
    getCapabilityProfile: null,
    readFlags,
    taskService: {
      startReviewRepositoryTask: () => ({ task: { task_id: 'task_1' }, upgraded: false }),
      resumeReviewRepositoryTask: () => ({ task: { task_id: 'task_1' }, upgraded: true }),
      getReadiness: () => ({ task_id: 'task_1', readiness: { is_ready: true } }),
    },
  };
}

test('blocks execution when effective_contract_required=true and outcomeId is null', async () => {
  const handler = createCallToolHandler(makeDeps({
    outcomeId: null,
    readFlags: () => ({
      effective_contract_required: true,
      outcome_resolution_enabled: false,
      remote_executor_enabled: false,
    }),
  }));
  const result = await handler({ params: { name: 'sync_tools', arguments: {} } });
  assert.ok(result.isError, 'should be an error response');
  const text = result.content[0].text;
  assert.ok(text.includes('sync_tools'), 'error should mention the tool name');
});

test('allows execution when effective_contract_required=false and outcomeId is null', async () => {
  const handler = createCallToolHandler(makeDeps({
    outcomeId: null,
    readFlags: () => ({
      effective_contract_required: false,
      outcome_resolution_enabled: false,
      remote_executor_enabled: false,
    }),
  }));
  const result = await handler({ params: { name: 'sync_tools', arguments: {} } });
  assert.ok(!result.isError, 'should not be an error when contract not required');
});

test('allows execution when effective_contract_required=true and outcomeId is non-null', async () => {
  const handler = createCallToolHandler(makeDeps({
    outcomeId: 'runtime.sync-tools',
    readFlags: () => ({
      effective_contract_required: true,
      outcome_resolution_enabled: true,
      remote_executor_enabled: false,
    }),
  }));
  const result = await handler({ params: { name: 'sync_tools', arguments: {} } });
  assert.ok(!result.isError, 'should not be an error when outcomeId is present');
});

test('behaves normally when readFlags is not provided', async () => {
  const handler = createCallToolHandler(makeDeps({ outcomeId: null, readFlags: null }));
  const result = await handler({ params: { name: 'sync_tools', arguments: {} } });
  assert.ok(!result.isError, 'should not be an error without readFlags');
});


test('supports task tools through shared task service', async () => {
  const handler = createCallToolHandler(makeDeps());

  const started = await handler({
    params: {
      name: 'task_start_review_repository',
      arguments: {
        task_id: 'task_1',
        goal: 'Review repo',
        route_inputs: { diff_text: 'diff --git a b' },
      },
    },
  });
  assert.equal(started.isError, undefined);

  const resumed = await handler({ params: { name: 'task_resume_review_repository', arguments: { task_id: 'task_1' } } });
  assert.equal(resumed.isError, undefined);

  const readiness = await handler({ params: { name: 'task_get_readiness', arguments: { task_id: 'task_1' } } });
  assert.equal(readiness.isError, undefined);
});

test('task tools return structured error when task service is not configured', async () => {
  const deps = makeDeps();
  deps.taskService = null;
  const handler = createCallToolHandler(deps);

  const result = await handler({
    params: { name: 'task_get_readiness', arguments: { task_id: 'task_1' } },
  });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Task service is not configured/);
});
