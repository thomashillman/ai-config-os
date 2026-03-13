import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

const DEFAULT_INPUT_DEFINITIONS_PATH = path.resolve(process.cwd(), 'runtime/task-route-input-definitions.yaml');

function asPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  return value;
}

function validateRequiredInputs(taskType, routeId, requiredInputs) {
  if (!Array.isArray(requiredInputs) || requiredInputs.length === 0) {
    throw new Error(`Task route input definitions for '${taskType}.${routeId}' require non-empty required_inputs array`);
  }

  const seen = new Set();
  for (const input of requiredInputs) {
    if (typeof input !== 'string' || input.trim().length === 0) {
      throw new Error(`Task route input definitions for '${taskType}.${routeId}' contain an invalid required input`);
    }
    if (seen.has(input)) {
      throw new Error(`Task route input definitions for '${taskType}.${routeId}' contain duplicate required input '${input}'`);
    }
    seen.add(input);
  }
}

export function loadTaskRouteInputDefinitions(filePath = DEFAULT_INPUT_DEFINITIONS_PATH) {
  const raw = readFileSync(filePath, 'utf8');
  const parsed = parseYaml(raw);
  const root = asPlainObject(parsed);
  if (!root) {
    throw new Error('Task route input definitions must be a plain object');
  }

  const taskTypes = asPlainObject(root.task_types);
  if (!taskTypes) {
    throw new Error('Task route input definitions missing task_types object');
  }

  for (const [taskType, taskDefinition] of Object.entries(taskTypes)) {
    const taskDefinitionObject = asPlainObject(taskDefinition);
    if (!taskDefinitionObject) {
      throw new Error(`Task route input definitions for '${taskType}' must be a plain object`);
    }

    const routes = asPlainObject(taskDefinitionObject.routes);
    if (!routes) {
      throw new Error(`Task route input definitions for '${taskType}' missing routes object`);
    }

    for (const [routeId, routeDefinition] of Object.entries(routes)) {
      const routeDefinitionObject = asPlainObject(routeDefinition);
      if (!routeDefinitionObject) {
        throw new Error(`Task route input definitions for '${taskType}.${routeId}' must be a plain object`);
      }
      validateRequiredInputs(taskType, routeId, routeDefinitionObject.required_inputs);
    }
  }

  return { taskTypes };
}

export function createCachedTaskRouteInputDefinitionsLoader(filePath) {
  let cache = null;
  return () => {
    if (!cache) {
      cache = loadTaskRouteInputDefinitions(filePath);
    }
    return cache;
  };
}
