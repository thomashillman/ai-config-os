/**
 * Manifest Update Utility Tests
 *
 * Tests for the manifest update logic used by new-skill.mjs.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  extractDescription,
  updateManifestWithSkill,
} from "../lib/manifest-update.mjs";

test("Manifest Update Utility", async (t) => {
  await t.test(
    "extractDescription: should extract first line from description pipe",
    () => {
      const skillContent = `---
skill: test-skill
description: |
  One sentence summary here.
  Additional context paragraph.
type: prompt
status: stable
---
Body content...`;

      const desc = extractDescription(skillContent);
      assert.equal(desc, "One sentence summary here.");
    },
  );

  await t.test(
    "extractDescription: should return fallback if no description field",
    () => {
      const skillContent = `---
skill: test-skill
type: prompt
status: stable
---
Body content...`;

      const desc = extractDescription(skillContent);
      assert.equal(desc, "TODO: add description from SKILL.md frontmatter");
    },
  );

  await t.test("extractDescription: should trim whitespace", () => {
    const skillContent = `---
skill: test-skill
description: |

   Whitespace-padded description.

type: prompt
status: stable
---`;

    const desc = extractDescription(skillContent);
    assert.equal(desc, "Whitespace-padded description.");
  });

  await t.test(
    "extractDescription: should handle single-line YAML description",
    () => {
      const skillContent = `---
skill: test-skill
description: Single line summary
type: prompt
status: stable
---
Body content...`;

      const desc = extractDescription(skillContent);
      assert.equal(desc, "Single line summary");
    },
  );

  await t.test(
    "updateManifestWithSkill: should insert row before next section",
    () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "manifest-test-"));

      try {
        const manifestPath = join(tmpDir, "manifest.md");
        const initialManifest = `# Manifest

## Skills

| Skill | Description | Path |
|---|---|---|
| \`existing-skill\` | An existing skill | \`shared/skills/existing-skill/SKILL.md\` |

## Workflows

| Workflow | Skills |
|---|---|
`;

        writeFileSync(manifestPath, initialManifest);

        // Update with new skill
        updateManifestWithSkill(manifestPath, "new-skill", "A brand new skill");

        const updated = readFileSync(manifestPath, "utf8");

        // Verify new row was inserted
        assert(
          updated.includes(
            "| \`new-skill\` | A brand new skill | \`shared/skills/new-skill/SKILL.md\` |",
          ),
          "New skill row should be in manifest",
        );

        // Verify it's in the Skills section (before Workflows)
        const skillsIdx = updated.indexOf("## Skills");
        const workflowsIdx = updated.indexOf("## Workflows");
        const newSkillIdx = updated.indexOf("new-skill");

        assert(
          skillsIdx < newSkillIdx && newSkillIdx < workflowsIdx,
          "New skill should be between ## Skills and ## Workflows",
        );

        // Verify existing skill is still there
        assert(
          updated.includes("existing-skill"),
          "Existing skill should remain",
        );
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    },
  );

  await t.test(
    "updateManifestWithSkill: should preserve manifest structure",
    () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "manifest-test-"));

      try {
        const manifestPath = join(tmpDir, "manifest.md");
        const initialManifest = `# Title

## Skills

| Skill | Description | Path |
|---|---|---|

## Workflows

Content after workflows...
`;

        writeFileSync(manifestPath, initialManifest);
        updateManifestWithSkill(manifestPath, "test", "Test description");

        const updated = readFileSync(manifestPath, "utf8");

        // Verify structure is intact
        assert(updated.startsWith("# Title\n"), "Title should be preserved");
        assert(updated.includes("## Skills"), "Skills heading should exist");
        assert(
          updated.includes("## Workflows"),
          "Workflows heading should exist",
        );
        assert(
          updated.includes("Content after workflows"),
          "Content after workflows should exist",
        );
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    },
  );

  await t.test(
    "updateManifestWithSkill: should fail if ## Skills heading missing",
    () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "manifest-test-"));

      try {
        const manifestPath = join(tmpDir, "manifest.md");
        const badManifest = `# Manifest

## Workflows

| Workflow | Skills |
|---|---|
`;

        writeFileSync(manifestPath, badManifest);

        assert.throws(
          () => updateManifestWithSkill(manifestPath, "test", "Test"),
          /## Skills heading not found/,
          "Should throw if ## Skills not found",
        );
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    },
  );

  await t.test(
    "updateManifestWithSkill: should fail if table header malformed",
    () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "manifest-test-"));

      try {
        const manifestPath = join(tmpDir, "manifest.md");
        const badManifest = `# Manifest

## Skills

| Skill | Description | Path |

## Workflows
`;

        writeFileSync(manifestPath, badManifest);

        assert.throws(
          () => updateManifestWithSkill(manifestPath, "test", "Test"),
          /Skill table header not found/,
          "Should throw if table header malformed",
        );
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    },
  );
});
