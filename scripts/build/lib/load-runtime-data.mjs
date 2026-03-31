// Build-local loaders for runtime YAML data files.
// Decouples the build compiler from runtime module imports:
// the compiler reads YAML files directly instead of importing runtime modules.
//
// Each function accepts the file path as an explicit argument so the caller
// (compile.mjs) controls path resolution — no hidden default paths.

import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

function asPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  return value;
}

/**
 * Load registered tool IDs from tool-registry.yaml.
 * @param {string} yamlPath  Absolute path to tool-registry.yaml
 * @returns {Set<string>}
 */
export function loadToolIds(yamlPath) {
  const raw = readFileSync(yamlPath, "utf8");
  const parsed = parseYaml(raw, { strict: false }) || {};
  const tools = Array.isArray(parsed.tools) ? parsed.tools : [];
  return new Set(tools.map((t) => t.id));
}

/**
 * Load task route definitions from task-route-definitions.yaml.
 * @param {string} yamlPath  Absolute path to task-route-definitions.yaml
 * @returns {{ taskTypes: object }}
 */
export function loadRouteDefinitions(yamlPath) {
  const raw = readFileSync(yamlPath, "utf8");
  const parsed = parseYaml(raw);
  const root = asPlainObject(parsed);
  if (!root) throw new Error("Task route definitions must be a plain object");
  const taskTypes = asPlainObject(root.task_types);
  if (!taskTypes)
    throw new Error("Task route definitions missing task_types object");
  return { taskTypes };
}

/**
 * Load task route input definitions from task-route-input-definitions.yaml.
 * @param {string} yamlPath  Absolute path to task-route-input-definitions.yaml
 * @returns {{ taskTypes: object }}
 */
export function loadRouteInputDefinitions(yamlPath) {
  const raw = readFileSync(yamlPath, "utf8");
  const parsed = parseYaml(raw);
  const root = asPlainObject(parsed);
  if (!root)
    throw new Error("Task route input definitions must be a plain object");
  const taskTypes = asPlainObject(root.task_types);
  if (!taskTypes)
    throw new Error("Task route input definitions missing task_types object");
  return { taskTypes };
}
