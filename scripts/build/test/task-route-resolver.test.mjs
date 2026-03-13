import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTaskRoute,
  resolveTaskRouteFromRuntime,
  setTaskRouteCapabilityProfileResolver,
  resetTaskRouteCapabilityProfileResolver,
} from '../../../runtime/lib/task-route-resolver.mjs';

function profileFromCaps(caps) {
  return {
    capabilities: caps,
  };
}

test('resolveTaskRoute selects local_repo when strong capabilities are present', () => {
  const resolved = resolveTaskRoute({
    taskType: 'review_repository',
    capabilityProfile: profileFromCaps({
      local_fs: true,
      local_shell: true,
      local_repo: true,
      network_http: true,
    }),
  });

  assert.equal(resolved.selected_route.route_id, 'local_repo');
  assert.equal(resolved.selected_route.equivalence_level, 'equal');
  assert.deepEqual(resolved.selected_route.missing_capabilities, []);
});

test('resolveTaskRoute supports status-object capability profile format', () => {
  const resolved = resolveTaskRoute({
    taskType: 'review_repository',
    capabilityProfile: profileFromCaps({
      local_fs: { status: 'supported' },
      local_shell: { status: 'supported' },
      local_repo: { status: 'unsupported' },
      network_http: { status: 'supported' },
    }),
  });

  assert.equal(resolved.selected_route.route_id, 'github_pr');
  assert.deepEqual(resolved.selected_route.missing_capabilities, []);

  const localRepoCandidate = resolved.candidates.find((candidate) => candidate.route_id === 'local_repo');
  assert.ok(localRepoCandidate);
  assert.deepEqual(localRepoCandidate.missing_capabilities, ['local_repo']);
});

test('resolveTaskRoute selects github_pr for weak network-capable profile', () => {
  const resolved = resolveTaskRoute({
    taskType: 'review_repository',
    capabilityProfile: profileFromCaps({
      local_fs: false,
      local_shell: false,
      local_repo: false,
      network_http: true,
    }),
  });

  assert.equal(resolved.selected_route.route_id, 'github_pr');
  assert.equal(resolved.selected_route.equivalence_level, 'degraded');
});

test('resolveTaskRoute falls back deterministically when no capabilities are supported', () => {
  const resolved = resolveTaskRoute({
    taskType: 'review_repository',
    capabilityProfile: profileFromCaps({
      local_fs: false,
      local_shell: false,
      local_repo: false,
      network_http: false,
    }),
  });

  assert.equal(resolved.selected_route.route_id, 'pasted_diff');
  assert.equal(resolved.candidates[0].route_id, 'pasted_diff');
});

test('resolveTaskRouteFromRuntime uses capability profile resolver integration', async () => {
  setTaskRouteCapabilityProfileResolver({
    async getProfile() {
      return profileFromCaps({
        local_fs: false,
        local_shell: false,
        local_repo: false,
        network_http: true,
      });
    },
  });

  try {
    const resolved = await resolveTaskRouteFromRuntime({ taskType: 'review_repository' });
    assert.equal(resolved.selected_route.route_id, 'github_pr');
  } finally {
    resetTaskRouteCapabilityProfileResolver();
  }
});

test('resolveTaskRoute throws for unknown task type', () => {
  assert.throws(() => resolveTaskRoute({
    taskType: 'unknown_task',
    capabilityProfile: profileFromCaps({ network_http: true }),
  }), /Unknown task type/);
});
