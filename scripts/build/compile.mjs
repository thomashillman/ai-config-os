// compile.mjs - ai-config-os build compiler
//
// 1. Scans all shared/skills/*/SKILL.md
// 2. Validates each against schemas/skill.schema.json (hard-fails on schema errors)
// 3. Loads platform definitions and resolves compatibility
// 4. Emits dist/clients/<platform>/ artefacts (filtered by compatibility)
// 5. Emits dist/registry/index.json with compatibility matrix
//
// Usage:
//   node scripts/build/compile.mjs
//   node scripts/build/compile.mjs --validate-only

import { readdirSync, existsSync, readFileSync, mkdirSync, rmSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { parseSkill } from './lib/parse-skill.mjs';
import { emitClaudeCode } from './lib/emit-claude-code.mjs';
import { emitCursor } from './lib/emit-cursor.mjs';
import { emitRegistry } from './lib/emit-registry.mjs';
import { loadPlatforms } from './lib/load-platforms.mjs';
import { resolveAll, validateOutcomeCompatibility } from './lib/resolve-compatibility.mjs';
import { selectEmittedPlatforms } from './lib/select-emitted-platforms.mjs';
import { validateSkillPolicy, validatePlatformPolicy } from './lib/validate-skill-policy.mjs';
import { readReleaseVersion, validateReleaseVersion, getBuildProvenance } from './lib/versioning.mjs';
import { loadRoutes, loadOutcomes } from './lib/load-definitions.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

// ─── Portability Contract: Canonical Source ───
// The compiler reads ONLY from shared/skills/, never from plugins/core-skills/skills/.
// This ensures emitted packages are self-sufficient and portable.
// Symlinks in plugins/ are optional Unix authoring convenience, not part of the build contract.
const SKILLS_DIR = join(ROOT, 'shared', 'skills');

const SCHEMA_PATH = join(ROOT, 'schemas', 'skill.schema.json');
const DIST_DIR = join(ROOT, 'dist');

const VALIDATE_ONLY = process.argv.includes('--validate-only');
const PLATFORM_SCHEMA_PATH = join(ROOT, 'schemas', 'platform.schema.json');

const OUTCOME_SCHEMA_PATH = join(ROOT, 'schemas', 'outcome.schema.json');
const ROUTE_SCHEMA_PATH = join(ROOT, 'schemas', 'route.schema.json');


// Release version from VERSION file; provenance only in release mode
const releaseVersion = validateReleaseVersion(readReleaseVersion(ROOT));
const releaseMode = process.argv.includes('--release') || process.env.AI_CONFIG_RELEASE === '1';
// Note: provenance is calculated in main() to ensure current env is used

async function loadValidators() {
  const { default: Ajv } = await import('ajv/dist/2020.js');
  const { default: addFormats } = await import('ajv-formats');
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  const skillSchema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
  const skillValidator = ajv.compile(skillSchema);

  const platformSchema = JSON.parse(readFileSync(PLATFORM_SCHEMA_PATH, 'utf8'));
  const platformValidator = ajv.compile(platformSchema);

  const routeSchema = JSON.parse(readFileSync(ROUTE_SCHEMA_PATH, 'utf8'));
  const routeValidator = ajv.compile(routeSchema);

  const outcomeSchema = JSON.parse(readFileSync(OUTCOME_SCHEMA_PATH, 'utf8'));
  const outcomeValidator = ajv.compile(outcomeSchema);

  return { skillValidator, platformValidator, routeValidator, outcomeValidator, skillSchema };
}

function scanSkills() {
  // Portability Contract: Deterministic Ordering
  // scanSkills sorts directory entries to ensure reproducible builds.
  // This guarantees that source changes produce identical emitted packages.
  const entries = readdirSync(SKILLS_DIR, { withFileTypes: true });
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('_')) continue;
    const skillDir = join(SKILLS_DIR, entry.name);
    const skillMdPath = join(skillDir, 'SKILL.md');
    if (!existsSync(skillMdPath)) {
      console.warn(`  [warn] ${entry.name}: no SKILL.md, skipping`);
      continue;
    }
    skills.push({ skillName: entry.name, skillDir, skillMdPath });
  }
  // Sort by skill name for deterministic output (reproducible builds)
  skills.sort((a, b) => a.skillName.localeCompare(b.skillName));
  return skills;
}

async function main() {
  // Calculate provenance at runtime so tests can override env variables
  const provenance = getBuildProvenance({ releaseMode, cwd: ROOT });

  console.log('\nai-config-os compiler');
  console.log(`  version: ${releaseVersion}${releaseMode ? ' (release)' : ''}`);
  console.log(`  mode:    ${VALIDATE_ONLY ? 'validate-only' : 'full build'}\n`);

  const { skillValidator, platformValidator, routeValidator, outcomeValidator, skillSchema } = await loadValidators();

  const skillEntries = scanSkills();
  console.log(`Found ${skillEntries.length} skill(s)\n`);

  const parsed = [];
  let fatalErrors = 0;

  // Load platforms first for policy validation
  const { platforms, errors: loadErrors } = loadPlatforms(ROOT);
  const knownPlatforms = new Set(platforms.keys());

  // Validate all platform definitions
  console.log('[platforms]');

  // Hard-fail on load/parse errors
  if (loadErrors.length > 0) {
    for (const err of loadErrors) {
      console.error(`  [error] ${err}`);
    }
    fatalErrors += loadErrors.length;
  }

  for (const [platformId, platformDef] of platforms) {
    const valid = platformValidator(platformDef);
    if (!valid) {
      console.error(`  [error] ${platformId}: schema validation failed:`);
      for (const e of platformValidator.errors || []) {
        console.error(`          ${e.instancePath || '(root)'}: ${e.message}`);
      }
      fatalErrors++;
      continue;
    }

    const { errors: policyErrors } = validatePlatformPolicy(platformDef, platformId);
    if (policyErrors.length > 0) {
      for (const err of policyErrors) {
        console.error(`  [error] ${platformId}: ${err}`);
      }
      fatalErrors++;
      continue;
    }

    console.log(`  [ok]   ${platformId}`);
  }

  if (fatalErrors > 0) {
    console.error(`\nBuild failed: fix platform validation errors above.`);
    process.exit(1);
  }

  const knownCapabilityIds = new Set(skillSchema.$defs?.capabilityId?.enum || []);

  // Validate route and outcome definitions
  console.log('\n[routes/outcomes]');
  const { records: routes, errors: routeLoadErrors } = loadRoutes(ROOT);
  const { records: outcomes, errors: outcomeLoadErrors } = loadOutcomes(ROOT);

  for (const err of [...routeLoadErrors, ...outcomeLoadErrors]) {
    console.error(`  [error] ${err}`);
    fatalErrors++;
  }

  for (const [routeId, routeDef] of routes) {
    const valid = routeValidator(routeDef);
    if (!valid) {
      console.error(`  [error] route ${routeId}: schema validation failed:`);
      for (const e of routeValidator.errors || []) {
        console.error(`          ${e.instancePath || '(root)'}: ${e.message}`);
      }
      fatalErrors++;
      continue;
    }
    console.log(`  [ok]   route ${routeId}`);
  }

  for (const [outcomeId, outcomeDef] of outcomes) {
    const valid = outcomeValidator(outcomeDef);
    if (!valid) {
      console.error(`  [error] outcome ${outcomeId}: schema validation failed:`);
      for (const e of outcomeValidator.errors || []) {
        console.error(`          ${e.instancePath || '(root)'}: ${e.message}`);
      }
      fatalErrors++;
      continue;
    }
    console.log(`  [ok]   outcome ${outcomeId}`);
  }

  if (fatalErrors > 0) {
    console.error('\nBuild failed: fix routes/outcomes validation errors above.');
    process.exit(1);
  }

  const { errors: outcomeCompatibilityErrors } = validateOutcomeCompatibility(
    outcomes,
    routes,
    knownCapabilityIds
  );
  for (const err of outcomeCompatibilityErrors) {
    console.error(`  [error] ${err}`);
    fatalErrors++;
  }

  if (fatalErrors > 0) {
    console.error('\nBuild failed: fix routes/outcomes validation errors above.');
    process.exit(1);
  }

  // Validate all skills
  console.log('\n[skills]');
  for (const { skillName, skillDir, skillMdPath } of skillEntries) {
    let skill;
    try {
      skill = parseSkill(skillMdPath);
      skill.skillName = skillName;
      skill.skillDir = skillDir;
    } catch (err) {
      console.error(`  [error] ${skillName}: parse failed - ${err.message}`);
      fatalErrors++;
      continue;
    }

    const valid = skillValidator(skill.frontmatter);
    if (!valid) {
      console.error(`  [error] ${skillName}: schema validation failed:`);
      for (const e of skillValidator.errors || []) {
        console.error(`          ${e.instancePath || '(root)'}: ${e.message}`);
      }
      fatalErrors++;
      continue;
    }

    const { errors: policyErrors } = validateSkillPolicy(
      skill.frontmatter,
      skillName,
      knownPlatforms
    );
    if (policyErrors.length > 0) {
      for (const err of policyErrors) {
        console.error(`  [error] ${skillName}: ${err}`);
      }
      fatalErrors++;
      continue;
    }

    console.log(`  [ok]   ${skillName} v${skill.frontmatter.version || '?'}`);
    parsed.push(skill);
  }

  console.log(`\nValidated: ${parsed.length} skill(s), ${fatalErrors} error(s)`);

  if (fatalErrors > 0) {
    console.error('\nBuild failed: fix validation errors above.');
    process.exit(1);
  }

  // Platforms already loaded and validated above
  console.log(`\nLoaded ${platforms.size} platform(s): ${[...platforms.keys()].join(', ')}`);

  // Build skill map once (avoid O(n²) lookup in compatibility and zero-emit checks)
  const skillById = new Map(parsed.map(s => [s.skillName, s]));

  // Resolve compatibility matrix
  const compatMatrix = resolveAll(parsed, platforms);

  // Log compatibility summary and check for zero-emit skills
  console.log('\n[compatibility]');
  let zeroEmitSkills = [];
  for (const [skillId, platResults] of compatMatrix) {
    const statuses = [];
    let hasEmit = false;
    for (const [pid, result] of platResults) {
      statuses.push(`${pid}:${result.status}`);
      if (result.emit) hasEmit = true;
    }

    // Check for zero-emit (skip if deprecated)
    const skill = skillById.get(skillId);
    if (skill && !hasEmit && skill.frontmatter.status !== 'deprecated') {
      zeroEmitSkills.push(skillId);
    }

    console.log(`  ${skillId}: ${statuses.join(', ')}`);
  }

  // Hard-fail on zero-emit skills
  if (zeroEmitSkills.length > 0) {
    console.error(`\n[error] The following skills have zero compatible platforms (excluding deprecated):`);
    for (const skillId of zeroEmitSkills) {
      console.error(`  - ${skillId}: check capabilities.required vs all platform definitions`);
    }
    console.error(
      '\nBuild failed: all non-deprecated skills must resolve to at least one platform.'
    );
    process.exit(1);
  }

  // Group skills by platform based on compatibility (emit=true)
  const platformSkills = {};
  for (const [skillId, platResults] of compatMatrix) {
    for (const [pid, result] of platResults) {
      if (result.emit) {
        if (!platformSkills[pid]) platformSkills[pid] = [];
        const skill = skillById.get(skillId);
        if (skill) platformSkills[pid].push(skill);
      }
    }
  }

  if (VALIDATE_ONLY) {
    console.log('\nValidate-only mode — full validation passed, no artefacts written.');
    return;
  }

  const compatiblePlatforms = Object.keys(platformSkills);
  console.log(`\nEmitting for platforms: ${compatiblePlatforms.join(', ') || '(none)'}`);

  // Clean dist/ before emitting to guarantee no stale artefacts from removed or renamed skills.
  rmSync(DIST_DIR, { recursive: true, force: true });
  mkdirSync(DIST_DIR, { recursive: true });

  // Use pure helper to select platforms that have real emitters.
  // The registry must only claim platforms with distributable artefacts.
  const emitterRegistry = {
    'claude-code': true,
    'cursor': true,
  };
  const actuallyEmittedPlatforms = selectEmittedPlatforms(platformSkills, emitterRegistry);

  for (const [platformId, skills] of Object.entries(platformSkills)) {
    const platformDist = join(DIST_DIR, 'clients', platformId);
    console.log(`\n[platform: ${platformId}]`);

    if (platformId === 'claude-code') {
      emitClaudeCode(skills, { distDir: platformDist, releaseVersion, provenance });
    } else if (platformId === 'cursor') {
      emitCursor(skills, { distDir: platformDist, releaseVersion, provenance, compatMatrix });
    } else {
      console.log(`  [${platformId}] emitter not yet implemented — skipping (${skills.length} skill(s))`);
    }
  }

  console.log('\n[registry]');
  emitRegistry(parsed, actuallyEmittedPlatforms, { distDir: DIST_DIR, releaseVersion, provenance, compatMatrix });

  console.log('\nBuild complete.\n');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
