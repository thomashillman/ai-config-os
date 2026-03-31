#!/usr/bin/env node
/**
 * skill.mjs — Node-based skill linter
 * Validates SKILL.md files against the schema + custom capability/platform rules.
 *
 * Usage: node scripts/lint/skill.mjs [SKILL.md paths...]
 *        node scripts/lint/skill.mjs shared/skills/star/SKILL.md  (glob)
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { parse as parseYaml } from "yaml";
import {
  getSkillValidator,
  getSkillSchema,
} from "../build/lib/validators-cache.mjs";
import { validateSkillPolicy } from "../build/lib/validate-skill-policy.mjs";
import { registeredToolIds } from "../../runtime/tool-definitions.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

// Load known platform IDs
const platformDir = resolve(REPO_ROOT, "shared/targets/platforms");
const knownPlatforms = new Set(
  existsSync(platformDir)
    ? readdirSync(platformDir)
        .filter((f) => f.endsWith(".yaml"))
        .map((f) => f.replace(".yaml", ""))
    : [],
);
const knownTools = registeredToolIds();

// Load platform capabilities for cross-referencing
const platformCaps = {};
for (const pid of knownPlatforms) {
  try {
    const raw = readFileSync(resolve(platformDir, `${pid}.yaml`), "utf8");
    platformCaps[pid] = parseYaml(raw);
  } catch {
    /* skip unreadable */
  }
}

// Shared cached validator (lazy-initialised on first lint call)
const validateSchema = await getSkillValidator();
const skillSchema = getSkillSchema();

// Capability enum from schema
const CAPABILITY_IDS = skillSchema.$defs?.capabilityId?.enum || [];

// Parse frontmatter
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseFrontmatter(filePath) {
  const raw = readFileSync(filePath, "utf8");
  const match = raw.match(FRONTMATTER_RE);
  if (!match) throw new Error(`No YAML frontmatter found`);
  return {
    frontmatter: parseYaml(match[1], { strict: false }),
    body: match[2],
  };
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

  // === SCHEMA VALIDATION (AJV) ===
  const schemaValid = validateSchema(fm);
  if (!schemaValid) {
    for (const err of validateSchema.errors) {
      errors.push(`Schema: ${err.instancePath || "/"} ${err.message}`);
    }
    // Return early — custom rules depend on valid structure
    return { errors, warnings, skillName };
  }

  // === HARD ERRORS (custom rules beyond schema) ===
  const { errors: policyErrors } = validateSkillPolicy(
    fm,
    skillName,
    knownPlatforms,
    knownTools,
  );
  errors.push(...policyErrors);

  // === WARNINGS ===

  // 1. Non-empty required but missing fallback_notes
  if (
    fm.capabilities?.required?.length > 0 &&
    !fm.capabilities.fallback_notes
  ) {
    warnings.push(
      "capabilities.required is non-empty but fallback_notes is missing.",
    );
  }

  // 2. A platform has unknown for a required capability
  if (fm.capabilities?.required?.length > 0) {
    for (const pid of knownPlatforms) {
      const plat = platformCaps[pid];
      if (!plat?.capabilities) continue;
      for (const cap of fm.capabilities.required) {
        const state = plat.capabilities[cap];
        if (state?.status === "unknown") {
          warnings.push(
            `Platform '${pid}' has 'unknown' for required capability '${cap}'.`,
          );
        }
      }
    }
  }

  // 3. platforms: exists but only repeats defaults
  if (
    fm.platforms &&
    typeof fm.platforms === "object" &&
    Object.keys(fm.platforms).length > 0
  ) {
    const allDefault = Object.entries(fm.platforms).every(([pid, override]) => {
      if (!override || typeof override !== "object") return true;
      return Object.keys(override).length === 0;
    });
    if (allDefault) {
      warnings.push(
        "platforms: block exists but contains only empty overrides — consider removing.",
      );
    }
  }

  // 4. fallback_mode: none on a prompt skill
  if (
    fm.type === "prompt" &&
    fm.capabilities?.fallback_mode === "none" &&
    fm.capabilities?.required?.length > 0
  ) {
    warnings.push(
      "fallback_mode: none on a prompt skill — most prompts can degrade to pasted input.",
    );
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
          warnings.push(
            `Platform '${pid}' capability '${cap}' evidence is ${Math.floor(daysSince)} days old.`,
          );
        }
      }
    }
  }

  // 6. Skill uses fs.write or git.write without clear mutating description
  const mutating = ["fs.write", "git.write"];
  const allCaps = [
    ...(fm.capabilities?.required || []),
    ...(fm.capabilities?.optional || []),
  ];
  const hasMutating = allCaps.some((c) => mutating.includes(c));
  if (
    hasMutating &&
    fm.description &&
    !/(write|modif|creat|updat|delet|remov|chang|mutat|edit|save|persist)/i.test(
      fm.description,
    )
  ) {
    warnings.push(
      "Skill uses fs.write or git.write but description does not mention mutation.",
    );
  }

  return { errors, warnings, skillName };
}

// Main
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/lint/skill.mjs [SKILL.md paths...]");
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
    console.log(
      `  FAIL: ${skillName} — ${errors.length} error(s), ${warnings.length} warning(s)`,
    );
  }
}

console.log(
  `\nTotal: ${args.length} skill(s), ${totalErrors} error(s), ${totalWarnings} warning(s)`,
);
process.exit(totalErrors > 0 ? 1 : 0);
