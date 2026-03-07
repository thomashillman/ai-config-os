#!/usr/bin/env node
/**
 * platform.mjs — Node-based platform file linter
 * Validates platform YAML files against schemas/platform.schema.json.
 *
 * Usage: node scripts/lint/platform.mjs [platform.yaml paths...]
 *        node scripts/lint/platform.mjs shared/targets/platforms/*.yaml
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

// Load schema
const platformSchema = JSON.parse(readFileSync(resolve(REPO_ROOT, 'schemas/platform.schema.json'), 'utf8'));

// Set up AJV (2020-12 draft)
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(platformSchema);

function lintPlatform(filePath) {
  const errors = [];
  const warnings = [];
  const platformId = basename(filePath, '.yaml');

  let data;
  try {
    const raw = readFileSync(filePath, 'utf8');
    data = parseYaml(raw);
  } catch (e) {
    return { errors: [`Failed to parse YAML: ${e.message}`], warnings: [], platformId };
  }

  // Schema validation
  const valid = validate(data);
  if (!valid) {
    for (const err of validate.errors) {
      errors.push(`Schema: ${err.instancePath || '/'} ${err.message}`);
    }
  }

  // Filename must match id
  if (data.id && data.id !== platformId) {
    errors.push(`Platform id '${data.id}' does not match filename '${platformId}.yaml'.`);
  }

  // Check for stale evidence (>90 days)
  if (data.capabilities) {
    const now = new Date();
    for (const [cap, state] of Object.entries(data.capabilities)) {
      if (state?.verified_at) {
        const verified = new Date(state.verified_at);
        const daysSince = (now - verified) / (1000 * 60 * 60 * 24);
        if (daysSince > 90) {
          warnings.push(`Capability '${cap}' evidence is ${Math.floor(daysSince)} days old.`);
        }
      } else if (state?.status !== 'unknown') {
        warnings.push(`Capability '${cap}' is '${state?.status}' but has no verified_at date.`);
      }
    }
  }

  return { errors, warnings, platformId };
}

// Main
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/lint/platform.mjs [platform.yaml paths...]');
  process.exit(1);
}

let totalErrors = 0;
let totalWarnings = 0;

for (const filePath of args) {
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    console.error(`ERROR: ${filePath} not found`);
    totalErrors++;
    continue;
  }

  const { errors, warnings, platformId } = lintPlatform(absPath);
  totalErrors += errors.length;
  totalWarnings += warnings.length;

  for (const e of errors) console.error(`  ERROR [${platformId}]: ${e}`);
  for (const w of warnings) console.warn(`  WARN  [${platformId}]: ${w}`);

  if (errors.length === 0 && warnings.length === 0) {
    console.log(`  OK: ${platformId}`);
  } else if (errors.length === 0) {
    console.log(`  OK: ${platformId} (${warnings.length} warning(s))`);
  } else {
    console.log(`  FAIL: ${platformId} — ${errors.length} error(s), ${warnings.length} warning(s)`);
  }
}

console.log(`\nTotal: ${args.length} platform(s), ${totalErrors} error(s), ${totalWarnings} warning(s)`);
process.exit(totalErrors > 0 ? 1 : 0);
