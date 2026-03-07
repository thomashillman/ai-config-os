// compile.mjs - ai-config-os build compiler
//
// 1. Scans all shared/skills/*/SKILL.md
// 2. Validates each against schemas/skill.schema.json (warns, does not hard-fail)
// 3. Groups skills by declared platforms block
// 4. Emits dist/clients/<platform>/ artefacts
// 5. Emits dist/registry/index.json
//
// Usage:
//   node scripts/build/compile.mjs
//   node scripts/build/compile.mjs --validate-only

import { readdirSync, existsSync, readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { parseSkill } from './lib/parse-skill.mjs';
import { emitClaudeCode } from './lib/emit-claude-code.mjs';
import { emitRegistry } from './lib/emit-registry.mjs';
import { loadPlatforms } from './lib/load-platforms.mjs';
import { resolveAll } from './lib/resolve-compatibility.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const SKILLS_DIR = join(ROOT, 'shared', 'skills');
const SCHEMA_PATH = join(ROOT, 'schemas', 'skill.schema.json');
const DIST_DIR = join(ROOT, 'dist');

const VALIDATE_ONLY = process.argv.includes('--validate-only');

// Build version: semver + ISO timestamp slug
const buildVersion = (() => {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `1.0.0-build.${ts}`;
})();
const builtAt = new Date().toISOString();

async function loadValidator() {
  const { default: Ajv } = await import('ajv/dist/2020.js');
  const { default: addFormats } = await import('ajv-formats');
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
  return ajv.compile(schema);
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

  const validate = await loadValidator();

  const skillEntries = scanSkills();
  console.log(`Found ${skillEntries.length} skill(s)\n`);

  const parsed = [];
  let parseErrors = 0;
  let validateWarnings = 0;

  for (const { skillName, skillDir, skillMdPath } of skillEntries) {
    let skill;
    try {
      skill = parseSkill(skillMdPath);
      skill.skillName = skillName;
      skill.skillDir = skillDir;
    } catch (err) {
      console.error(`  [error] ${skillName}: parse failed - ${err.message}`);
      parseErrors++;
      continue;
    }

    const valid = validate(skill.frontmatter);
    if (!valid) {
      console.warn(`  [warn] ${skillName}: schema issues:`);
      for (const e of validate.errors || []) {
        console.warn(`         ${e.instancePath || '(root)'}: ${e.message}`);
      }
      validateWarnings++;
    } else {
      console.log(`  [ok]   ${skillName} v${skill.frontmatter.version || '?'}`);
    }
    parsed.push(skill);
  }

  console.log(`\nParsed: ${parsed.length}  errors: ${parseErrors}  warnings: ${validateWarnings}`);

  if (parseErrors > 0) {
    console.error('\nBuild failed: fix parse errors above.');
    process.exit(1);
  }

  if (VALIDATE_ONLY) {
    console.log('\nValidate-only mode - no artefacts written.');
    return;
  }

  // Load platform definitions
  const platforms = loadPlatforms(ROOT);
  console.log(`\nLoaded ${platforms.size} platform(s): ${[...platforms.keys()].join(', ')}`);

  // Resolve compatibility matrix
  const compatMatrix = resolveAll(parsed, platforms);

  // Log compatibility summary
  console.log('\n[compatibility]');
  for (const [skillId, platResults] of compatMatrix) {
    const statuses = [];
    for (const [pid, result] of platResults) {
      statuses.push(`${pid}:${result.status}`);
    }
    console.log(`  ${skillId}: ${statuses.join(', ')}`);
  }

  // Group skills by platform based on compatibility (emit=true)
  const platformSkills = {};
  for (const [skillId, platResults] of compatMatrix) {
    for (const [pid, result] of platResults) {
      if (result.emit) {
        if (!platformSkills[pid]) platformSkills[pid] = [];
        const skill = parsed.find(s => s.skillName === skillId);
        if (skill) platformSkills[pid].push(skill);
      }
    }
  }

  // Fallback: skills without capabilities.required default to claude-code (migration compat)
  const noCaps = parsed.filter(
    s => !s.frontmatter.capabilities || !Array.isArray(s.frontmatter.capabilities?.required)
  );
  if (noCaps.length > 0) {
    console.log(`\n  [warn] ${noCaps.length} skill(s) without capabilities.required — defaulting to claude-code`);
    if (!platformSkills['claude-code']) platformSkills['claude-code'] = [];
    for (const s of noCaps) {
      if (!platformSkills['claude-code'].includes(s)) {
        platformSkills['claude-code'].push(s);
      }
    }
  }

  const emittedPlatforms = Object.keys(platformSkills);
  console.log(`\nEmitting for platforms: ${emittedPlatforms.join(', ') || '(none)'}`);

  for (const [platformId, skills] of Object.entries(platformSkills)) {
    const platformDist = join(DIST_DIR, 'clients', platformId);
    console.log(`\n[platform: ${platformId}]`);

    if (platformId === 'claude-code') {
      emitClaudeCode(parsed, { distDir: platformDist, buildVersion, builtAt });
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
