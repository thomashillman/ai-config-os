import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  compareSkillCounts,
  parseDeclaredCounts,
} from "../../ci/lib/skill-count-drift.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures", "skill-count-drift");

function fixture(name) {
  return readFileSync(path.join(fixturesDir, name), "utf8");
}

test("parseDeclaredCounts detects malformed missing-number declaration", () => {
  const parsed = parseDeclaredCounts(
    "missing-number.md",
    fixture("missing-number.md"),
  );
  assert.equal(parsed.matches.length, 0);
  assert.equal(parsed.hasMalformedPhrase, true);
});

test("parseDeclaredCounts detects malformed phrase that does not follow canonical format", () => {
  const parsed = parseDeclaredCounts(
    "malformed-phrase.md",
    fixture("malformed-phrase.md"),
  );
  assert.equal(parsed.matches.length, 0);
  assert.equal(parsed.hasMalformedPhrase, true);
});

test("compareSkillCounts fails when multiple canonical declarations exist", () => {
  const parsed = parseDeclaredCounts(
    "multiple-matches.md",
    fixture("multiple-matches.md"),
  );
  const result = compareSkillCounts(34, [parsed]);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /multiple canonical declarations found/);
});

test("compareSkillCounts passes for a single matching canonical declaration", () => {
  const parsed = parseDeclaredCounts(
    "valid-single.md",
    fixture("valid-single.md"),
  );
  const result = compareSkillCounts(34, [parsed]);
  assert.deepEqual(result.errors, []);
});

test("parseDeclaredCounts accepts PLAN header assertion format", () => {
  const parsed = parseDeclaredCounts(
    "valid-header.md",
    fixture("valid-header.md"),
  );
  const result = compareSkillCounts(34, [parsed]);
  assert.deepEqual(result.errors, []);
});
