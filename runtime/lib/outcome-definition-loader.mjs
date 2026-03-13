import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DEFINITIONS_PATH = join(__dirname, '..', 'outcome-definitions.yaml');

export function loadOutcomeDefinitions(definitionsPath = DEFAULT_DEFINITIONS_PATH) {
  const raw = readFileSync(definitionsPath, 'utf8');
  const parsed = parseYaml(raw) || {};

  const toolOutcomeMap = parsed.toolOutcomes ?? {};
  const outcomesById = parsed.outcomes ?? {};
  const routesById = parsed.routes ?? {};

  return { toolOutcomeMap, outcomesById, routesById };
}

export function createCachedOutcomeDefinitionsLoader(definitionsPath = DEFAULT_DEFINITIONS_PATH) {
  let cached = null;
  return function loadCachedOutcomeDefinitions() {
    if (cached === null) {
      cached = loadOutcomeDefinitions(definitionsPath);
    }
    return cached;
  };
}
