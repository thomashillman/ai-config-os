/**
 * skill-structure.test.mjs
 *
 * Tier 1 structure checks: static wiring validation for every skill in shared/skills/.
 * Runs at source level (no dist/ access) so it executes in parallel with other pure tests.
 *
 * Checks:
 *   1. variants.*.prompt_file paths resolve on disk (relative to skill directory)
 *   2. dependencies.skills[].name references exist in shared/skills/
 *   3. capabilities.required/optional values are valid schema enum entries
 *   4. ops/test-skills.sh --structure-only (quoted YAML type + prompts/ only when variants reference prompts/)
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "child_process";
import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSkill } from "../lib/parse-skill.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../../..");
const SKILLS_DIR = join(REPO_ROOT, "shared", "skills");
const IS_WINDOWS = process.platform === "win32";

// Sourced from schemas/skill.schema.json → $defs.capabilityId.enum
const VALID_CAPABILITY_IDS = new Set([
  "fs.read",
  "fs.write",
  "shell.exec",
  "shell.long-running",
  "git.read",
  "git.write",
  "network.http",
  "browser.fetch",
  "mcp.client",
  "env.read",
  "secrets.inject",
  "ui.prompt-only",
]);

// Build skill inventory once — single readdirSync, skip scaffold dirs (prefix _)
const skillEntries = readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
  .map((d) => d.name);

const knownSkillNames = new Set(skillEntries);

// Parse all frontmatter once up front (synchronous)
const skills = skillEntries.map((name) => {
  const filePath = join(SKILLS_DIR, name, "SKILL.md");
  const { frontmatter } = parseSkill(filePath);
  return { name, dir: join(SKILLS_DIR, name), frontmatter };
});

describe("skill structure checks", () => {
  test("variant prompt_files resolve on disk", () => {
    const failures = [];
    for (const { name, dir, frontmatter } of skills) {
      const variants = frontmatter.variants ?? {};
      for (const [model, variant] of Object.entries(variants)) {
        if (model === "fallback_chain") continue; // array, not a variant config
        if (!variant?.prompt_file) continue;
        const fullPath = join(dir, variant.prompt_file);
        if (!existsSync(fullPath)) {
          failures.push(
            `  ${name}: variants.${model}.prompt_file not found: ${variant.prompt_file}`,
          );
        }
      }
    }
    assert.equal(
      failures.length,
      0,
      `Missing prompt files:\n${failures.join("\n")}`,
    );
  });

  test("dependency skills exist in shared/skills/", () => {
    const failures = [];
    for (const { name, frontmatter } of skills) {
      const deps = frontmatter.dependencies?.skills ?? [];
      for (const dep of deps) {
        if (dep.optional) continue; // optional deps may not be installed
        if (!knownSkillNames.has(dep.name)) {
          failures.push(
            `  ${name}: dependencies.skills references unknown skill: ${dep.name}`,
          );
        }
      }
    }
    assert.equal(
      failures.length,
      0,
      `Unknown skill dependencies:\n${failures.join("\n")}`,
    );
  });

  test("capability names are valid enum values", () => {
    const failures = [];
    for (const { name, frontmatter } of skills) {
      const caps = [
        ...(frontmatter.capabilities?.required ?? []),
        ...(frontmatter.capabilities?.optional ?? []),
      ];
      for (const cap of caps) {
        if (!VALID_CAPABILITY_IDS.has(cap)) {
          failures.push(`  ${name}: unknown capability: "${cap}"`);
        }
      }
    }
    assert.equal(
      failures.length,
      0,
      `Invalid capability IDs:\n${failures.join("\n")}`,
    );
  });

  test(
    "ops/test-skills.sh --structure-only matches variant prompt_file policy (quoted YAML type)",
    {
      skip: IS_WINDOWS ? "bash test-skills gate runs on Linux/macOS CI" : false,
    },
    () => {
      const script = join(REPO_ROOT, "ops", "test-skills.sh");
      const result = spawnSync("bash", [script, "--structure-only"], {
        encoding: "utf8",
        cwd: REPO_ROOT,
      });
      assert.equal(
        result.status,
        0,
        `test-skills structure gate failed:\n${result.stdout}\n${result.stderr}`,
      );
    },
  );
});
