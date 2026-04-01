/**
 * validators-cache.mjs — Shared singleton cache for Ajv schema validators.
 *
 * Eliminates redundant Ajv instance creation and schema compilation across
 * compile.mjs, lint/skill.mjs, and test files. Validators are lazy-initialised
 * on first access and reused for the lifetime of the process.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMAS_DIR = resolve(__filename, "..", "..", "..", "..", "schemas");
const RESOURCE_BUDGET_SCHEMA_PATH = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "shared",
  "contracts",
  "schemas",
  "v1",
  "resource-budget.schema.json",
);

let _ajv = null;
const _cache = new Map();

async function getAjv() {
  if (!_ajv) {
    const { default: Ajv } = await import("ajv/dist/2020.js");
    const { default: addFormats } = await import("ajv-formats");
    _ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(_ajv);
  }
  return _ajv;
}

function loadSchema(name) {
  return JSON.parse(
    readFileSync(resolve(SCHEMAS_DIR, `${name}.schema.json`), "utf8"),
  );
}

async function getValidator(name) {
  if (!_cache.has(name)) {
    const ajv = await getAjv();
    const schema = loadSchema(name);
    _cache.set(name, ajv.compile(schema));
  }
  return _cache.get(name);
}

async function getSkillValidatorCompiled() {
  const ajv = await getAjv();
  const resourceBudgetSchema = JSON.parse(
    readFileSync(RESOURCE_BUDGET_SCHEMA_PATH, "utf8"),
  );
  ajv.addSchema(resourceBudgetSchema);
  const skillSchema = loadSchema("skill");
  return ajv.compile(skillSchema);
}

export async function getSkillValidator() {
  if (!_cache.has("skill")) {
    _cache.set("skill", await getSkillValidatorCompiled());
  }
  return _cache.get("skill");
}
export async function getPlatformValidator() {
  return getValidator("platform");
}
export async function getRouteValidator() {
  return getValidator("route");
}
export async function getOutcomeValidator() {
  return getValidator("outcome");
}

/**
 * Returns the raw parsed skill schema (for extracting $defs like capabilityId).
 */
export function getSkillSchema() {
  return loadSchema("skill");
}
