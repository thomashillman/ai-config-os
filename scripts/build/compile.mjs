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

import { readdirSync, existsSync, readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { parseSkill } from './lib/parse-skill.mjs';
import { emitClaudeCode } from './lib/emit-claude-code.mjs';
import { emitCursor } from './lib/emit-cursor.mjs';
import { emitRegistry } from './lib/emit-registry.mjs';
import { loadPlatforms } from './lib/load-platforms.mjs';
import { resolveAll } from './lib/resolve-compatibility.mjs';
import { validateSkillPolicy, validatePlatformPolicy } from './lib/validate-skill-policy.mjs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const SKILLS_DIR = join(ROOT, 'shared', 'skills');
const SCHEMA_PATH = join(ROOT, 'schemas', 'skill.schema.json');
const DIST_DIR = join(ROOT, 'dist');

const VALIDATE_ONLY = process.argv.includes('--validate-only');
const PLATFORM_SCHEMA_PATH = join(ROOT, 'schemas', 'platform.schema.json');

// Build version: semver + ISO timestamp slug
const buildVersion = (() => {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `1.0.0-build.${ts}`;
})();
const builtAt = new Date().toISOString();

async function loadValidators() {
  const { default: Ajv } = await import('ajv/dist/2020.js');
  const { default: addFormats } = await import('ajv-formats');
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  const skillSchema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
  const skillValidator = ajv.compile(skillSchema);

  const platformSchema = JSON.parse(readFileSync(PLATFORM_SCHEMA_PATH, 'utf8'));
  const platformValidator = ajv.compile(platformSchema);

  return { skillValidator, platformValidator };
}

function scanSkills() {
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
  return skills;
}

async function main() {
  console.log('\nai-config-os compiler');
  console.log(`  build: ${buildVersion}`);
  console.log(`  mode:  ${VALIDATE_ONLY ? 'validate-only' : 'full build'}\n`);

  const { skillValidator, platformValidator } = await loadValidators();

  const skillEntries = scanSkills();
  console.log(`Found ${skillEntries.length} skill(s)\n`);

  const parsed = [];
  let fatalErrors = 0;

  // Load platforms first for policy validation
  const platforms = loadPlatforms(ROOT);
  const knownPlatforms = new Set(platforms.keys());

  // Validate all platform definitions
  console.log('[platforms]');
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
    const skill = parsed.find(s => s.skillName === skillId);
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

  // Build skill map once (avoid O(n²) lookup)
  const skillById = new Map(parsed.map(s => [s.skillName, s]));

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

  const emittedPlatforms = Object.keys(platformSkills);
  console.log(`\nEmitting for platforms: ${emittedPlatforms.join(', ') || '(none)'}`);

  for (const [platformId, skills] of Object.entries(platformSkills)) {
    const platformDist = join(DIST_DIR, 'clients', platformId);
    console.log(`\n[platform: ${platformId}]`);

    if (platformId === 'claude-code') {
      emitClaudeCode(skills, { distDir: platformDist, buildVersion, builtAt });
    } else if (platformId === 'cursor') {
      emitCursor(skills, { distDir: platformDist, buildVersion, builtAt, compatMatrix });
    } else {
      console.log(`  [${platformId}] emitter not yet implemented — skipping (${skills.length} skill(s))`);
    }
  }

  console.log('\n[registry]');
  emitRegistry(parsed, emittedPlatforms, { distDir: DIST_DIR, buildVersion, builtAt, compatMatrix });

  console.log('\nBuild complete.\n');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
