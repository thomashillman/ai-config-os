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
import { readFile } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { parseSkill } from './lib/parse-skill.mjs';
import { emitClaudeCode } from './lib/emit-claude-code.mjs';
import { emitCursor } from './lib/emit-cursor.mjs';
import { emitCodex } from './lib/emit-codex.mjs';
import { emitRegistry, emitSummary } from './lib/emit-registry.mjs';
import { emitRuntime } from './lib/emit-runtime.mjs';
import { loadPlatforms } from './lib/load-platforms.mjs';
import { loadRoutes, loadOutcomes } from './lib/load-definitions.mjs';
import { resolveAll, validateOutcomeCompatibility } from './lib/resolve-compatibility.mjs';
import { selectEmittedPlatforms } from './lib/select-emitted-platforms.mjs';
import { buildPlatformSkillsAndCheckZeroEmit } from './lib/build-platform-skills.mjs';
import { validateSkillPolicy, validatePlatformPolicy } from './lib/validate-skill-policy.mjs';
import { readReleaseVersion, validateReleaseVersion, getBuildProvenance } from './lib/versioning.mjs';
import { getSkillValidator, getPlatformValidator, getRouteValidator, getOutcomeValidator, getSkillSchema } from './lib/validators-cache.mjs';
import { loadToolIds, loadRouteDefinitions, loadRouteInputDefinitions } from './lib/load-runtime-data.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

// ─── Portability Contract: Canonical Source ───
// The compiler reads ONLY from shared/skills/, never from plugins/core-skills/skills/.
// This ensures emitted packages are self-sufficient and portable.
// Symlinks in plugins/ are optional Unix authoring convenience, not part of the build contract.
const SKILLS_DIR = join(ROOT, 'shared', 'skills');

const DIST_DIR = join(ROOT, 'dist');

const VALIDATE_ONLY = process.argv.includes('--validate-only');
const TASK_ROUTE_DEFINITIONS_PATH = join(ROOT, 'runtime', 'task-route-definitions.yaml');
const TASK_ROUTE_INPUT_DEFINITIONS_PATH = join(ROOT, 'runtime', 'task-route-input-definitions.yaml');
const TOOL_REGISTRY_PATH = join(ROOT, 'runtime', 'tool-registry.yaml');


// Release version from VERSION file; provenance only in release mode
const releaseVersion = validateReleaseVersion(readReleaseVersion(ROOT));
const releaseMode = process.argv.includes('--release') || process.env.AI_CONFIG_RELEASE === '1';
const emitLegacyCursorrules = process.env.AI_CONFIG_OS_EMIT_CURSORRULES === '1';
// Note: provenance is calculated in main() to ensure current env is used

async function loadValidators() {
  const [skillValidator, platformValidator, routeValidator, outcomeValidator] = await Promise.all([
    getSkillValidator(),
    getPlatformValidator(),
    getRouteValidator(),
    getOutcomeValidator(),
  ]);
  const skillSchema = getSkillSchema();
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

  // Load all independent data sources concurrently
  const [
    { platforms, errors: loadErrors },
    { records: routes, errors: routeLoadErrors },
    { records: outcomes, errors: outcomeLoadErrors },
  ] = await Promise.all([
    loadPlatforms(ROOT),
    loadRoutes(ROOT),
    loadOutcomes(ROOT),
  ]);
  const knownPlatforms = new Set(platforms.keys());
  const knownTools = loadToolIds(TOOL_REGISTRY_PATH);

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

  // Pre-read all skill files in parallel to minimise sequential I/O
  const skillContents = await Promise.all(
    skillEntries.map(({ skillMdPath }) =>
      readFile(skillMdPath, 'utf8').catch(() => null)
    )
  );
  const skillContentMap = new Map(
    skillEntries.map(({ skillMdPath }, i) => [skillMdPath, skillContents[i]])
  );

  // Validate all skills
  console.log('\n[skills]');
  for (const { skillName, skillDir, skillMdPath } of skillEntries) {
    let skill;
    try {
      skill = parseSkill(skillMdPath, skillContentMap.get(skillMdPath));
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
      knownPlatforms,
      knownTools
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

  // Single-pass: log compatibility, check zero-emit, and group by platform
  console.log('\n[compatibility]');
  const { platformSkills, zeroEmitSkills, logLines } =
    buildPlatformSkillsAndCheckZeroEmit(compatMatrix, skillById);
  for (const line of logLines) console.log(line);

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
    'codex': true,
  };
  const actuallyEmittedPlatforms = selectEmittedPlatforms(platformSkills, emitterRegistry);

  for (const [platformId, skills] of Object.entries(platformSkills)) {
    const platformDist = join(DIST_DIR, 'clients', platformId);
    console.log(`\n[platform: ${platformId}]`);

    if (platformId === 'claude-code') {
      emitClaudeCode(skills, { distDir: platformDist, releaseVersion, provenance });
    } else if (platformId === 'cursor') {
      emitCursor(skills, {
        distDir: platformDist,
        releaseVersion,
        provenance,
        compatMatrix,
        emitLegacyCursorrules,
      });
    } else if (platformId === 'codex') {
      emitCodex(skills, { distDir: platformDist, releaseVersion, provenance, compatMatrix });
    } else {
      console.log(`  [${platformId}] emitter not yet implemented — skipping (${skills.length} skill(s))`);
    }
  }

  console.log('\n[registry]');
  emitRegistry(parsed, actuallyEmittedPlatforms, { distDir: DIST_DIR, releaseVersion, provenance, compatMatrix, platformDefs: platforms });
  emitSummary(parsed, actuallyEmittedPlatforms, { distDir: DIST_DIR, releaseVersion });

  console.log('\n[runtime]');
  const { taskTypes: taskRouteDefinitions } = loadRouteDefinitions(TASK_ROUTE_DEFINITIONS_PATH);
  const { taskTypes: taskRouteInputDefinitions } = loadRouteInputDefinitions(TASK_ROUTE_INPUT_DEFINITIONS_PATH);
  emitRuntime(parsed, actuallyEmittedPlatforms, {
    distDir: DIST_DIR,
    releaseVersion,
    provenance,
    taskRouteDefinitions,
    taskRouteInputDefinitions,
  });

  console.log('\nBuild complete.\n');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
