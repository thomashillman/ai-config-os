import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { emitSkillFolder } from "../lib/emit-skill-tree.mjs";

test("emitSkillFolder writes transformed SKILL.md and copies prompts", () => {
  const root = mkdtempSync(join(tmpdir(), "emit-tree-"));
  try {
    const skillDir = join(root, "src", "demo-skill");
    mkdirSync(join(skillDir, "prompts"), { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\ndescription: Hi\n---\n\nOK\n",
    );
    writeFileSync(join(skillDir, "prompts", "extra.md"), "# prompt\n");

    const skill = {
      skillName: "demo-skill",
      skillDir,
      filePath: join(skillDir, "SKILL.md"),
      frontmatter: { description: "Hi" },
    };

    const distSkills = join(root, "out", "skills");
    emitSkillFolder({
      skill,
      distSkillsDir: distSkills,
      transformSkillMd: (raw, s) =>
        raw.replace(/^---\n/, `---\nname: ${s.skillName}\n`),
    });

    const outMd = readFileSync(
      join(distSkills, "demo-skill", "SKILL.md"),
      "utf8",
    );
    assert.ok(outMd.includes("name: demo-skill"));
    assert.ok(
      existsSync(join(distSkills, "demo-skill", "prompts", "extra.md")),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
