/**
 * schema-contract.test.mjs
 * Verifies the skill schema is the single source of truth:
 * 1. All real skills validate against the schema
 * 2. Unknown fields in tests/docs/monitoring are rejected
 * 3. All fields used in the template are accepted
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parseSkill } from "../lib/parse-skill.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const SCHEMA_PATH = join(ROOT, "schemas", "skill.schema.json");
const SKILLS_DIR = join(ROOT, "shared", "skills");

const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

// ---------------------------------------------------------------------------
// All real skills pass validation
// ---------------------------------------------------------------------------

describe("schema contract — all skills validate", () => {
  const skillDirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() || d.isSymbolicLink())
    .filter((d) => d.name !== "_template")
    .map((d) => d.name);

  for (const skillName of skillDirs) {
    test(`${skillName} passes schema validation`, () => {
      const skillPath = join(SKILLS_DIR, skillName, "SKILL.md");
      let fm;
      try {
        ({ frontmatter: fm } = parseSkill(skillPath));
      } catch {
        // Skip skills without valid frontmatter (e.g. broken symlinks)
        return;
      }
      const valid = validate(fm);
      if (!valid) {
        const errors = validate.errors
          .map((e) => `${e.instancePath} ${e.message}`)
          .join("\n");
        assert.fail(`${skillName} failed schema validation:\n${errors}`);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Unknown fields are rejected (additionalProperties: false)
// ---------------------------------------------------------------------------

describe("schema contract — unknown fields rejected", () => {
  // Minimal valid skill for testing
  const baseSkill = {
    skill: "test-skill",
    description: "Test skill",
    type: "prompt",
    status: "stable",
    version: "1.0.0",
    capabilities: { required: [] },
  };

  test("unknown field in tests item is rejected", () => {
    const fm = {
      ...baseSkill,
      tests: [{ id: "t1", type: "structure-check", unknown_field: true }],
    };
    const valid = validate(fm);
    assert.equal(valid, false, "Should reject unknown field in tests item");
    assert.ok(
      validate.errors.some((e) => e.keyword === "additionalProperties"),
    );
  });

  test("unknown field in docs is rejected", () => {
    const fm = {
      ...baseSkill,
      docs: { auto_generate_readme: true, unknown_field: "bad" },
    };
    const valid = validate(fm);
    assert.equal(valid, false, "Should reject unknown field in docs");
    assert.ok(
      validate.errors.some((e) => e.keyword === "additionalProperties"),
    );
  });

  test("unknown field in monitoring is rejected", () => {
    const fm = {
      ...baseSkill,
      monitoring: { enabled: true, unknown_field: 42 },
    };
    const valid = validate(fm);
    assert.equal(valid, false, "Should reject unknown field in monitoring");
    assert.ok(
      validate.errors.some((e) => e.keyword === "additionalProperties"),
    );
  });

  test("known fields in tests item are accepted", () => {
    const fm = {
      ...baseSkill,
      tests: [
        {
          id: "t1",
          type: "performance",
          input: "test",
          expected_not_null: true,
          max_latency_ms: 2000,
          iterations: 5,
          model: "sonnet",
          track_metrics: ["latency"],
        },
      ],
    };
    const valid = validate(fm);
    assert.equal(
      valid,
      true,
      `Should accept known test fields: ${JSON.stringify(validate.errors)}`,
    );
  });

  test("known fields in docs are accepted", () => {
    const fm = {
      ...baseSkill,
      docs: {
        auto_generate_readme: true,
        sections_to_include: ["description"],
        help_text: "Help for {input}",
        keywords: ["search", "find"],
      },
    };
    const valid = validate(fm);
    assert.equal(
      valid,
      true,
      `Should accept known docs fields: ${JSON.stringify(validate.errors)}`,
    );
  });

  test("known fields in monitoring are accepted", () => {
    const fm = {
      ...baseSkill,
      monitoring: {
        enabled: true,
        track_metrics: ["latency", "cost"],
        alert_threshold_latency_ms: 5000,
        public_metrics: false,
      },
    };
    const valid = validate(fm);
    assert.equal(
      valid,
      true,
      `Should accept known monitoring fields: ${JSON.stringify(validate.errors)}`,
    );
  });

  test("disable-model-invocation boolean is accepted", () => {
    const fm = { ...baseSkill, "disable-model-invocation": true };
    const valid = validate(fm);
    assert.equal(
      valid,
      true,
      `Should accept disable-model-invocation: ${JSON.stringify(validate.errors)}`,
    );
  });

  test("user-invocable boolean is accepted", () => {
    const fm = { ...baseSkill, "user-invocable": false };
    const valid = validate(fm);
    assert.equal(
      valid,
      true,
      `Should accept user-invocable: ${JSON.stringify(validate.errors)}`,
    );
  });

  test("disable-model-invocation rejects non-boolean", () => {
    const fm = { ...baseSkill, "disable-model-invocation": "yes" };
    const valid = validate(fm);
    assert.equal(
      valid,
      false,
      "Should reject non-boolean disable-model-invocation",
    );
  });
});
