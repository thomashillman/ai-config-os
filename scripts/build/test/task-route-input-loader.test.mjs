import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadTaskRouteDefinitions } from '../../../runtime/lib/task-route-definition-loader.mjs';
import { loadTaskRouteInputDefinitions } from '../../../runtime/lib/task-route-input-loader.mjs';

function writeTempYaml(content) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ai-config-os-route-inputs-'));
  const file = path.join(dir, 'route-inputs.yaml');
  writeFileSync(file, content);
  return file;
}

test('route input definitions cover all declared runtime routes with no extras', () => {
  const routes = loadTaskRouteDefinitions();
  const inputs = loadTaskRouteInputDefinitions();

  for (const [taskType, taskDefinition] of Object.entries(routes.taskTypes)) {
    const definedRoutes = new Set((taskDefinition.routes || []).map((route) => route.route_id));
    const inputRoutes = new Set(Object.keys(inputs.taskTypes?.[taskType]?.routes || {}));

    assert.deepEqual(
      [...inputRoutes].sort(),
      [...definedRoutes].sort(),
      `Route input definitions mismatch for task type '${taskType}'`
    );
  }
});

test('loadTaskRouteInputDefinitions rejects duplicate required inputs for a route', () => {
  const filePath = writeTempYaml(`
version: 1
task_types:
  review_repository:
    routes:
      github_pr:
        required_inputs:
          - repository_slug
          - repository_slug
`);

  assert.throws(() => loadTaskRouteInputDefinitions(filePath), /duplicate required input/);
});

test('loadTaskRouteInputDefinitions rejects non-plain route definition objects', () => {
  const filePath = writeTempYaml(`
version: 1
task_types:
  review_repository:
    routes:
      github_pr: []
`);

  assert.throws(() => loadTaskRouteInputDefinitions(filePath), /must be a plain object/);
});
