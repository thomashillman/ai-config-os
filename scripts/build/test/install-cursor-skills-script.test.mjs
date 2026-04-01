/**
 * Ensures npm script matches docs/SKILLS.md (Cursor Agent Skills install path).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));

test("package.json defines install:cursor-skills delegating to install-agent-skills.sh", () => {
  assert.equal(
    pkg.scripts["install:cursor-skills"],
    "bash adapters/cursor/install-agent-skills.sh",
    "docs/SKILLS.md instructs users to run npm run install:cursor-skills",
  );
});
