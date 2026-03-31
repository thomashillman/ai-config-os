/**
 * Package Materialisation Contract Tests
 *
 * Verifies the portability contract: emitted packages (dist/clients/claude-code/)
 * are self-sufficient and require zero access to the source tree (shared/skills/).
 * This ensures packages can be distributed, cached, and used independently.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { join } from "path";
import { existsSync, readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "../../..");
const DIST_PACKAGE = join(ROOT, "dist", "clients", "claude-code");
const PLUGIN_MANIFEST = join(DIST_PACKAGE, ".claude-plugin", "plugin.json");

test("Package Materialisation Contract", async (t) => {
  // Skip tests if dist/ hasn't been built yet
  if (!existsSync(PLUGIN_MANIFEST)) {
    await t.test("dist/ not yet built (skip suite)", () => {
      // This is OK during development; tests will run after first compile
    });
    return;
  }

  // Parse manifest once; all subtests share this reference.
  const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST, "utf8"));
  const skillsDir = join(DIST_PACKAGE, "skills");

  await t.test(
    "should have complete plugin.json with all skills materialized",
    () => {
      assert.ok(
        Array.isArray(manifest.skills),
        "plugin.json must have skills array",
      );
      assert.ok(
        manifest.skills.length > 0,
        `skills array must be non-empty (got ${manifest.skills.length})`,
      );
    },
  );

  await t.test(
    "should have all skills in dist/clients/claude-code/skills/",
    () => {
      assert.ok(
        existsSync(skillsDir),
        "dist/clients/claude-code/skills/ must exist",
      );

      const failures = [];
      for (const skill of manifest.skills) {
        const skillFilePath = join(DIST_PACKAGE, skill.path);
        if (!existsSync(skillFilePath)) {
          failures.push(
            `  ${skill.name}: path not found in dist/: ${skill.path}`,
          );
        }
        if (!skill.path.startsWith("skills/")) {
          failures.push(
            `  ${skill.name}: path must be relative to dist root (got '${skill.path}')`,
          );
        }
      }
      assert.equal(
        failures.length,
        0,
        `${failures.length} materialisation issue(s):\n${failures.join("\n")}`,
      );
    },
  );

  await t.test(
    "should use only relative paths in plugin.json (no source references)",
    () => {
      const failures = [];
      for (const skill of manifest.skills) {
        if (skill.path.includes("shared/skills")) {
          failures.push(
            `  ${skill.name}: path must not reference shared/skills/ (got '${skill.path}')`,
          );
        }
        if (skill.path.startsWith("/")) {
          failures.push(
            `  ${skill.name}: path must be relative, not absolute (got '${skill.path}')`,
          );
        }
        if (skill.path.includes("..")) {
          failures.push(
            `  ${skill.name}: path must not escape dist/ root with ../ (got '${skill.path}')`,
          );
        }
      }
      assert.equal(
        failures.length,
        0,
        `${failures.length} path safety issue(s):\n${failures.join("\n")}`,
      );
    },
  );

  await t.test(
    "should have complete SKILL.md files with all required sections",
    () => {
      const failures = [];
      for (const skill of manifest.skills) {
        const skillFilePath = join(DIST_PACKAGE, skill.path);
        const content = readFileSync(skillFilePath, "utf8");
        if (!content.startsWith("---")) {
          failures.push(
            `  ${skill.name}: SKILL.md must start with --- frontmatter`,
          );
        }
        if (!/^---[\s\S]*?skill:\s*["']?[\w-]+["']?/.test(content)) {
          failures.push(
            `  ${skill.name}: SKILL.md must have 'skill' field in frontmatter`,
          );
        }
        if (!/^---[\s\S]*?description:/.test(content)) {
          failures.push(
            `  ${skill.name}: SKILL.md must have 'description' field in frontmatter`,
          );
        }
        if (!/^---[\s\S]*?type:/.test(content)) {
          failures.push(
            `  ${skill.name}: SKILL.md must have 'type' field in frontmatter`,
          );
        }
        if (!/^---[\s\S]*?status:/.test(content)) {
          failures.push(
            `  ${skill.name}: SKILL.md must have 'status' field in frontmatter`,
          );
        }
      }
      assert.equal(
        failures.length,
        0,
        `${failures.length} SKILL.md structure issue(s):\n${failures.join("\n")}`,
      );
    },
  );

  await t.test(
    "should have prompt files included for skills that reference them",
    () => {
      const failures = [];
      for (const skill of manifest.skills) {
        const skillFilePath = join(DIST_PACKAGE, skill.path);
        const content = readFileSync(skillFilePath, "utf8");

        const promptFileMatches = content.match(/prompt_file:\s*([^\n]+)/g);
        if (!promptFileMatches) continue;

        for (const match of promptFileMatches) {
          let promptPath = match
            .replace(/prompt_file:\s*/, "")
            .trim()
            .replace(/^["']|["']$/g, "");
          const fullPath = join(skillsDir, skill.name, promptPath);
          if (!existsSync(fullPath)) {
            failures.push(
              `  ${skill.name}: prompt_file '${promptPath}' not found in dist/ (looked at ${fullPath})`,
            );
          }
        }
      }
      assert.equal(
        failures.length,
        0,
        `${failures.length} missing prompt file(s):\n${failures.join("\n")}`,
      );
    },
  );

  await t.test("package version should match root VERSION file", () => {
    const versionFromFile = readFileSync(join(ROOT, "VERSION"), "utf8").trim();
    assert.equal(
      manifest.version,
      versionFromFile,
      `package version must match root VERSION file (manifest: '${manifest.version}', VERSION: '${versionFromFile}')`,
    );
  });
});
