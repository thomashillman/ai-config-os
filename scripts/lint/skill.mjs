#!/usr/bin/env node
/**
 * skill.mjs — Node-based skill linter
 * Validates SKILL.md files against the schema + custom capability/platform rules.
 *
 * Usage: node scripts/lint/skill.mjs [SKILL.md paths...]
 *        node scripts/lint/skill.mjs shared/skills/star/SKILL.md  (glob)
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

// Load schemas
const skillSchema = JSON.parse(readFileSync(resolve(REPO_ROOT, 'schemas/skill.schema.json'), 'utf8'));

// Load known platform IDs
const platformDir = resolve(REPO_ROOT, 'shared/targets/platforms');
const knownPlatforms = new Set(
  existsSync(platformDir)
    ? readdirSync(platformDir).filter(f => f.endsWith('.yaml')).map(f => f.replace('.yaml', ''))
    : []
);

// Load platform capabilities for cross-referencing
const platformCaps = {};
for (const pid of knownPlatforms) {
  try {
    const raw = readFileSync(resolve(platformDir, `${pid}.yaml`), 'utf8');
    platformCaps[pid] = parseYaml(raw);
  } catch { /* skip unreadable */ }
}

// Capability enum from schema
const CAPABILITY_IDS = skillSchema.$defs?.capabilityId?.enum || [];

// Parse frontmatter
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseFrontmatter(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const match = raw.match(FRONTMATTER_RE);
  if (!match) throw new Error(`No YAML frontmatter found`);
  return { frontmatter: parseYaml(match[1], { strict: false }), body: match[2] };
}

function lintSkill(filePath) {
  const errors = [];
  const warnings = [];
  const skillName = basename(dirname(filePath));

  let fm;
  try {
    ({ frontmatter: fm } = parseFrontmatter(filePath));
  } catch (e) {
    return { errors: [e.message], warnings: [], skillName };
  }

  // === HARD ERRORS ===

  // 1. capabilities.required must exist (if capabilities is present, it must be an object)
  if (fm.capabilities !== undefined) {
    if (Array.isArray(fm.capabilities)) {
      errors.push('Legacy flat capabilities array is forbidden. Use { required, optional, fallback_mode }.');
    } else if (typeof fm.capabilities === 'object' && fm.capabilities !== null) {
      if (!Array.isArray(fm.capabilities.required)) {
        errors.push('capabilities.required must be an array (can be empty).');
      } else {
        // 3. Every capability ID must be in the enum
        for (const cap of fm.capabilities.required) {
          if (!CAPABILITY_IDS.includes(cap)) {
            errors.push(`Unknown capability ID in required: '${cap}'. Valid: ${CAPABILITY_IDS.join(', ')}`);
          }
        }
        if (Array.isArray(fm.capabilities.optional)) {
          for (const cap of fm.capabilities.optional) {
            if (!CAPABILITY_IDS.includes(cap)) {
              errors.push(`Unknown capability ID in optional: '${cap}'. Valid: ${CAPABILITY_IDS.join(', ')}`);
            }
          }

          // 4. No capability in both required and optional
          const overlap = fm.capabilities.required.filter(c => fm.capabilities.optional.includes(c));
          if (overlap.length > 0) {
            errors.push(`Capability appears in both required and optional: ${overlap.join(', ')}`);
          }
        }

        // 5. fallback_mode required when required is non-empty
        if (fm.capabilities.required.length > 0 && !fm.capabilities.fallback_mode) {
          errors.push('fallback_mode is required when capabilities.required is non-empty.');
        }
      }
    }
  }

  // 6. Platform keys must map to known platform files
  if (fm.platforms && typeof fm.platforms === 'object') {
    for (const pid of Object.keys(fm.platforms)) {
      if (knownPlatforms.size > 0 && !knownPlatforms.has(pid)) {
        errors.push(`Unknown platform '${pid}'. Known: ${[...knownPlatforms].join(', ')}`);
      }

      const pOverride = fm.platforms[pid];
      if (pOverride && typeof pOverride === 'object') {
        // 7. mode=excluded cannot have allow_unverified=true
        if (pOverride.mode === 'excluded' && pOverride.allow_unverified === true) {
          errors.push(`Platform '${pid}': mode=excluded cannot have allow_unverified=true.`);
        }

        // 8. package must match enum
        if (pOverride.package && !['skill', 'plugin', 'rules', 'file', 'api'].includes(pOverride.package)) {
          errors.push(`Platform '${pid}': invalid package '${pOverride.package}'.`);
        }
      }
    }
  }

  // 9. Hook skills must exclude platforms that can't package hooks
  if (fm.type === 'hook' && fm.platforms) {
    // Hooks only make sense on claude-code currently
    const nonHookPlatforms = ['claude-web', 'claude-ios', 'cursor', 'codex'];
    for (const pid of nonHookPlatforms) {
      if (fm.platforms[pid] && fm.platforms[pid].mode !== 'excluded') {
        errors.push(`Hook skill should exclude platform '${pid}' (no hook surface).`);
      }
    }
  }

  // 10. No skill may ship with zero compatibility
  // (checked at build time, not lint time — would require full resolution)

  // === WARNINGS ===

  // 1. Non-empty required but missing fallback_notes
  if (fm.capabilities?.required?.length > 0 && !fm.capabilities.fallback_notes) {
    warnings.push('capabilities.required is non-empty but fallback_notes is missing.');
  }

  // 2. A platform has unknown for a required capability
  if (fm.capabilities?.required?.length > 0) {
    for (const pid of knownPlatforms) {
      const plat = platformCaps[pid];
      if (!plat?.capabilities) continue;
      for (const cap of fm.capabilities.required) {
        const state = plat.capabilities[cap];
        if (state?.status === 'unknown') {
          warnings.push(`Platform '${pid}' has 'unknown' for required capability '${cap}'.`);
        }
      }
    }
  }

  // 3. platforms: exists but only repeats defaults
  if (fm.platforms && typeof fm.platforms === 'object' && Object.keys(fm.platforms).length > 0) {
    const allDefault = Object.entries(fm.platforms).every(([pid, override]) => {
      if (!override || typeof override !== 'object') return true;
      return Object.keys(override).length === 0;
    });
    if (allDefault) {
      warnings.push('platforms: block exists but contains only empty overrides — consider removing.');
    }
  }

  // 4. fallback_mode: none on a prompt skill
  if (fm.type === 'prompt' && fm.capabilities?.fallback_mode === 'none' && fm.capabilities?.required?.length > 0) {
    warnings.push('fallback_mode: none on a prompt skill — most prompts can degrade to pasted input.');
  }

  // 5. Platform evidence older than 90 days
  const now = new Date();
  for (const pid of knownPlatforms) {
    const plat = platformCaps[pid];
    if (!plat?.capabilities) continue;
    for (const [cap, state] of Object.entries(plat.capabilities)) {
      if (state?.verified_at) {
        const verified = new Date(state.verified_at);
        const daysSince = (now - verified) / (1000 * 60 * 60 * 24);
        if (daysSince > 90) {
          warnings.push(`Platform '${pid}' capability '${cap}' evidence is ${Math.floor(daysSince)} days old.`);
        }
      }
    }
  }

  // 6. Skill uses fs.write or git.write without clear mutating description
  const mutating = ['fs.write', 'git.write'];
  const allCaps = [...(fm.capabilities?.required || []), ...(fm.capabilities?.optional || [])];
  const hasMutating = allCaps.some(c => mutating.includes(c));
  if (hasMutating && fm.description && !/(write|modif|creat|updat|delet|remov|chang|mutat|edit|save|persist)/i.test(fm.description)) {
    warnings.push('Skill uses fs.write or git.write but description does not mention mutation.');
  }

  return { errors, warnings, skillName };
}

// Main
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/lint/skill.mjs [SKILL.md paths...]');
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

  const { errors, warnings, skillName } = lintSkill(absPath);
  totalErrors += errors.length;
  totalWarnings += warnings.length;

  for (const e of errors) console.error(`  ERROR [${skillName}]: ${e}`);
  for (const w of warnings) console.warn(`  WARN  [${skillName}]: ${w}`);

  if (errors.length === 0 && warnings.length === 0) {
    console.log(`  OK: ${skillName}`);
  } else if (errors.length === 0) {
    console.log(`  OK: ${skillName} (${warnings.length} warning(s))`);
  } else {
    console.log(`  FAIL: ${skillName} — ${errors.length} error(s), ${warnings.length} warning(s)`);
  }
}

console.log(`\nTotal: ${args.length} skill(s), ${totalErrors} error(s), ${totalWarnings} warning(s)`);
process.exit(totalErrors > 0 ? 1 : 0);
