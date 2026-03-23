// Tests for scripts/build/lib/load-runtime-data.mjs
// Verifies build-local loaders produce parity output with runtime loaders.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

const { loadToolIds, loadRouteDefinitions, loadRouteInputDefinitions } =
  await import(new URL('../lib/load-runtime-data.mjs', import.meta.url).href);

const TOOL_REGISTRY_PATH = join(repoRoot, 'runtime', 'tool-registry.yaml');
const TASK_ROUTE_DEFINITIONS_PATH = join(repoRoot, 'runtime', 'task-route-definitions.yaml');
const TASK_ROUTE_INPUT_DEFINITIONS_PATH = join(repoRoot, 'runtime', 'task-route-input-definitions.yaml');

test('loadToolIds returns a Set', () => {
  const ids = loadToolIds(TOOL_REGISTRY_PATH);
  assert.ok(ids instanceof Set, 'result should be a Set');
  assert.ok(ids.size > 0, 'should have at least one tool');
});

test('loadToolIds Set contains string IDs', () => {
  const ids = loadToolIds(TOOL_REGISTRY_PATH);
  for (const id of ids) {
    assert.equal(typeof id, 'string');
    assert.ok(id.length > 0);
  }
});

test('loadRouteDefinitions returns object with taskTypes', () => {
  const result = loadRouteDefinitions(TASK_ROUTE_DEFINITIONS_PATH);
  assert.ok(result, 'should return a result');
  assert.ok('taskTypes' in result, 'should have taskTypes');
  assert.ok(typeof result.taskTypes === 'object', 'taskTypes should be an object');
  assert.ok(result.taskTypes !== null, 'taskTypes should not be null');
});

test('loadRouteInputDefinitions returns object with taskTypes', () => {
  const result = loadRouteInputDefinitions(TASK_ROUTE_INPUT_DEFINITIONS_PATH);
  assert.ok(result, 'should return a result');
  assert.ok('taskTypes' in result, 'should have taskTypes');
  assert.ok(typeof result.taskTypes === 'object', 'taskTypes should be an object');
});

test('loadToolIds parity: matches runtime registeredToolIds', async () => {
  const { registeredToolIds } = await import(
    new URL('../../../runtime/tool-definitions.mjs', import.meta.url).href
  );
  const runtimeIds = registeredToolIds(TOOL_REGISTRY_PATH);
  const buildIds = loadToolIds(TOOL_REGISTRY_PATH);

  assert.equal(buildIds.size, runtimeIds.size, 'should have same number of IDs');
  for (const id of runtimeIds) {
    assert.ok(buildIds.has(id), `build loader missing ID: ${id}`);
  }
});

test('loadRouteDefinitions parity: matches runtime loadTaskRouteDefinitions', async () => {
  const { loadTaskRouteDefinitions } = await import(
    new URL('../../../runtime/lib/task-route-definition-loader.mjs', import.meta.url).href
  );
  const runtimeResult = loadTaskRouteDefinitions(TASK_ROUTE_DEFINITIONS_PATH);
  const buildResult = loadRouteDefinitions(TASK_ROUTE_DEFINITIONS_PATH);

  assert.deepEqual(buildResult.taskTypes, runtimeResult.taskTypes);
});

test('loadRouteInputDefinitions parity: matches runtime loadTaskRouteInputDefinitions', async () => {
  const { loadTaskRouteInputDefinitions } = await import(
    new URL('../../../runtime/lib/task-route-input-loader.mjs', import.meta.url).href
  );
  const runtimeResult = loadTaskRouteInputDefinitions(TASK_ROUTE_INPUT_DEFINITIONS_PATH);
  const buildResult = loadRouteInputDefinitions(TASK_ROUTE_INPUT_DEFINITIONS_PATH);

  assert.deepEqual(buildResult.taskTypes, runtimeResult.taskTypes);
});
