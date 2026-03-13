import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEffectiveExecutionContract,
  buildEffectiveExecutionContractFromRuntime,
} from '../../../runtime/lib/effective-execution-contract.mjs';
import { loadTaskRouteInputDefinitions } from '../../../runtime/lib/task-route-input-loader.mjs';

function profileFromCaps(caps) {
  return { capabilities: caps };
}

test('task route input definitions load and validate canonical runtime file', () => {
  const definitions = loadTaskRouteInputDefinitions();
  assert.ok(definitions.taskTypes.review_repository.routes.local_repo.required_inputs.includes('repository_path'));
});

test('buildEffectiveExecutionContract returns equal local_repo contract for strong profile', () => {
  const contract = buildEffectiveExecutionContract({
    taskId: 'task_review_repository_001',
    taskType: 'review_repository',
    capabilityProfile: profileFromCaps({
      local_fs: true,
      local_shell: true,
      local_repo: true,
      network_http: true,
    }),
    computedAt: '2026-03-13T00:00:00.000Z',
  });

  assert.equal(contract.selected_route.route_id, 'local_repo');
  assert.equal(contract.equivalence_level, 'equal');
  assert.deepEqual(contract.required_inputs, ['repository_path']);
  assert.equal(contract.stronger_host_guidance, undefined);
});

test('buildEffectiveExecutionContract includes stronger host guidance for weak profile', () => {
  const contract = buildEffectiveExecutionContract({
    taskId: 'task_review_repository_002',
    taskType: 'review_repository',
    capabilityProfile: profileFromCaps({
      local_fs: false,
      local_shell: false,
      local_repo: false,
      network_http: true,
    }),
    computedAt: '2026-03-13T00:00:00.000Z',
  });

  assert.equal(contract.selected_route.route_id, 'github_pr');
  assert.equal(contract.equivalence_level, 'degraded');
  assert.deepEqual(contract.missing_capabilities, []);
  assert.deepEqual(contract.required_inputs, ['repository_slug', 'pull_request_number']);
  assert.match(contract.stronger_host_guidance || '', /local_repo/);
  assert.match(contract.stronger_host_guidance || '', /local_fs/);
});

test('buildEffectiveExecutionContract throws when required inputs are missing for selected route', () => {
  assert.throws(() => buildEffectiveExecutionContract({
    taskId: 'task_review_repository_003',
    taskType: 'review_repository',
    capabilityProfile: profileFromCaps({
      local_fs: false,
      local_shell: false,
      local_repo: false,
      network_http: false,
    }),
    computedAt: '2026-03-13T00:00:00.000Z',
    routeInputDefinitionsLoader: () => ({
      taskTypes: {
        review_repository: {
          routes: {
            github_pr: { required_inputs: ['repository_slug', 'pull_request_number'] },
          },
        },
      },
    }),
  }), /No required input definition/);
});

test('buildEffectiveExecutionContractFromRuntime uses runtime capability resolver path', async () => {
  const contract = await buildEffectiveExecutionContractFromRuntime({
    taskId: 'task_review_repository_004',
    taskType: 'review_repository',
    computedAt: '2026-03-13T00:00:00.000Z',
    resolveTaskRouteFromRuntime: async () => ({
      selected_route: {
        schema_version: '1.0.0',
        route_id: 'uploaded_bundle',
        equivalence_level: 'degraded',
        required_capabilities: ['local_fs'],
        missing_capabilities: ['local_fs'],
      },
      candidates: [],
    }),
  });

  assert.equal(contract.selected_route.route_id, 'uploaded_bundle');
  assert.deepEqual(contract.required_inputs, ['bundle_path']);
  assert.deepEqual(contract.missing_capabilities, ['local_fs']);
});

test('buildEffectiveExecutionContractFromRuntime fails fast on malformed runtime resolution', async () => {
  await assert.rejects(() => buildEffectiveExecutionContractFromRuntime({
    taskId: 'task_review_repository_005',
    taskType: 'review_repository',
    computedAt: '2026-03-13T00:00:00.000Z',
    resolveTaskRouteFromRuntime: async () => ({ candidates: [] }),
  }), /resolution without selected_route/);
});
