import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

const DEFAULT_DEFINITIONS_PATH = path.resolve(process.cwd(), 'runtime/task-route-definitions.yaml');

function asPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  return value;
}

export function loadTaskRouteDefinitions(filePath = DEFAULT_DEFINITIONS_PATH) {
  const raw = readFileSync(filePath, 'utf8');
  const parsed = parseYaml(raw);
  const root = asPlainObject(parsed);
  if (!root) {
    throw new Error('Task route definitions must be a plain object');
  }

  const taskTypes = asPlainObject(root.task_types);
  if (!taskTypes) {
    throw new Error('Task route definitions missing task_types object');
  }

  return { taskTypes };
}

export function createCachedTaskRouteDefinitionsLoader(filePath) {
  let cache = null;
  return () => {
    if (!cache) {
      cache = loadTaskRouteDefinitions(filePath);
    }
    return cache;
  };
}
