/**
 * retrospectives-schema.test.mjs
 *
 * Validates that:
 * 1. The artifact JSON Schema file is well-formed and contains expected structure
 * 2. The schema enums match what the TypeScript validator enforces
 * 3. Sample artifact payloads structurally satisfy the schema's required fields,
 *    enum constraints, and pattern checks — without an external validator library
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(join(__dirname, "../../.."));
const SCHEMA_PATH = join(
  ROOT,
  "shared/skills/post-merge-retrospective/schema/artifact.schema.json",
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadSchema() {
  assert.ok(existsSync(SCHEMA_PATH), `Schema file not found: ${SCHEMA_PATH}`);
  return JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
}

/** Minimal valid artifact for use in positive tests. */
function validArtifact(overrides = {}) {
  return {
    schema_version: "1.0",
    generated_at: "2026-03-23T10:00:00Z",
    pr_ref: "42",
    session_stats: { turn_count: 5, tool_calls: 10, duration_hint: "~20 min" },
    friction_signals: [],
    skill_recommendations: [],
    summary: {
      total_signals: 0,
      high_impact_signals: 0,
      recommendation_count: 0,
    },
    ...overrides,
  };
}

/** Minimal valid friction signal. */
function validSignal(overrides = {}) {
  return {
    type: "capability_gap",
    turn_index: 3,
    description: "No skill for db schema lookup",
    impact: "high",
    repeatable: true,
    ...overrides,
  };
}

/** Minimal valid skill recommendation. */
function validRecommendation(overrides = {}) {
  return {
    name: "db-schema-loader",
    category: "library-api-reference",
    rationale: "Repeated schema lookups during session",
    trigger_description: "Fetch database schema",
    priority: "high",
    estimated_reuse: "frequent",
    ...overrides,
  };
}

/**
 * Validate a payload against the schema's explicit constraints.
 * Returns null if valid, or an error string if invalid.
 * Checks: required top-level fields, schema_version const, enum values, patterns.
 */
function validateAgainstSchema(schema, payload) {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return "Payload must be an object";
  }

  // Check required top-level fields
  for (const field of schema.required) {
    if (!(field in payload)) return `Missing required field: ${field}`;
  }

  // schema_version must equal const "1.0"
  const svConst = schema.properties.schema_version.const;
  if (payload.schema_version !== svConst) {
    return `schema_version must be "${svConst}", got "${payload.schema_version}"`;
  }

  // friction_signals: each item must have required fields and valid enum values
  if (!Array.isArray(payload.friction_signals))
    return "friction_signals must be an array";
  const signalSchema = schema.properties.friction_signals.items;
  const validSignalTypes = signalSchema.properties.type.enum;
  const validImpacts = signalSchema.properties.impact.enum;
  for (let i = 0; i < payload.friction_signals.length; i++) {
    const s = payload.friction_signals[i];
    for (const f of signalSchema.required) {
      if (!(f in s))
        return `friction_signals[${i}] missing required field: ${f}`;
    }
    if (!validSignalTypes.includes(s.type)) {
      return `friction_signals[${i}].type "${s.type}" not in enum: ${validSignalTypes.join(", ")}`;
    }
    if (!validImpacts.includes(s.impact)) {
      return `friction_signals[${i}].impact "${s.impact}" not in enum: ${validImpacts.join(", ")}`;
    }
    if (typeof s.repeatable !== "boolean") {
      return `friction_signals[${i}].repeatable must be boolean`;
    }
  }

  // skill_recommendations: check required fields, enums, name pattern
  if (!Array.isArray(payload.skill_recommendations))
    return "skill_recommendations must be an array";
  const recSchema = schema.properties.skill_recommendations.items;
  const namePatternStr = recSchema.properties.name.pattern;
  const namePattern = new RegExp(namePatternStr);
  const validCategories = recSchema.properties.category.enum;
  const validPriorities = recSchema.properties.priority.enum;
  const validReuse = recSchema.properties.estimated_reuse.enum;
  for (let i = 0; i < payload.skill_recommendations.length; i++) {
    const r = payload.skill_recommendations[i];
    for (const f of recSchema.required) {
      if (!(f in r))
        return `skill_recommendations[${i}] missing required field: ${f}`;
    }
    if (!namePattern.test(r.name)) {
      return `skill_recommendations[${i}].name "${r.name}" does not match pattern ${namePatternStr}`;
    }
    if (!validCategories.includes(r.category)) {
      return `skill_recommendations[${i}].category "${r.category}" not in enum`;
    }
    if (!validPriorities.includes(r.priority)) {
      return `skill_recommendations[${i}].priority "${r.priority}" not in enum`;
    }
    if (!validReuse.includes(r.estimated_reuse)) {
      return `skill_recommendations[${i}].estimated_reuse "${r.estimated_reuse}" not in enum`;
    }
  }

  return null; // valid
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("Retrospective artifact JSON Schema", async (t) => {
  await t.test("schema file exists and is valid JSON", () => {
    const schema = loadSchema();
    assert.ok(schema, "Schema parsed successfully");
  });

  await t.test("schema has required metadata fields", () => {
    const schema = loadSchema();
    assert.equal(
      schema["$schema"],
      "https://json-schema.org/draft/2020-12/schema",
    );
    assert.ok(schema.properties, "Has properties");
    assert.ok(Array.isArray(schema.required), "Has required array");
    assert.equal(schema.type, "object");
  });

  await t.test("schema requires all expected top-level fields", () => {
    const schema = loadSchema();
    const expected = [
      "schema_version",
      "generated_at",
      "pr_ref",
      "session_stats",
      "friction_signals",
      "skill_recommendations",
      "summary",
    ];
    for (const field of expected) {
      assert.ok(
        schema.required.includes(field),
        `required includes "${field}"`,
      );
    }
  });

  await t.test('schema_version must be const "1.0"', () => {
    const schema = loadSchema();
    assert.equal(schema.properties.schema_version.const, "1.0");
    assert.equal(schema.properties.schema_version.type, "string");
  });

  await t.test("friction_signals has expected signal type enums", () => {
    const schema = loadSchema();
    const enums = schema.properties.friction_signals.items.properties.type.enum;
    const expected = [
      "error",
      "correction",
      "loop",
      "assumption_failure",
      "missing_context",
      "inefficiency",
      "capability_gap",
    ];
    for (const v of expected) {
      assert.ok(enums.includes(v), `friction type enum includes "${v}"`);
    }
    assert.equal(
      enums.length,
      expected.length,
      "No extra signal types in schema",
    );
  });

  await t.test("skill_recommendations.name has kebab-case pattern", () => {
    const schema = loadSchema();
    const pattern =
      schema.properties.skill_recommendations.items.properties.name.pattern;
    assert.ok(pattern, "name has pattern");
    const re = new RegExp(pattern);
    assert.ok(re.test("db-schema-loader"), "valid kebab-case passes");
    assert.ok(re.test("my-skill-123"), "alphanumeric kebab-case passes");
    assert.ok(!re.test("MySkill"), "uppercase fails");
    assert.ok(!re.test("my skill"), "spaces fail");
    assert.ok(!re.test("my_skill"), "underscores fail");
  });

  await t.test("skill_recommendations has expected category enums", () => {
    const schema = loadSchema();
    const enums =
      schema.properties.skill_recommendations.items.properties.category.enum;
    const expected = [
      "library-api-reference",
      "product-verification",
      "data-fetching",
      "business-automation",
      "scaffolding",
      "code-quality",
      "ci-cd",
      "runbook",
    ];
    for (const v of expected) {
      assert.ok(enums.includes(v), `category enum includes "${v}"`);
    }
  });

  await t.test("valid minimal artifact (empty arrays) passes", () => {
    const schema = loadSchema();
    const error = validateAgainstSchema(schema, validArtifact());
    assert.equal(error, null, `Expected valid but got: ${error}`);
  });

  await t.test("valid artifact with signals and recommendations passes", () => {
    const schema = loadSchema();
    const artifact = validArtifact({
      friction_signals: [validSignal()],
      skill_recommendations: [validRecommendation()],
      summary: {
        total_signals: 1,
        high_impact_signals: 1,
        recommendation_count: 1,
      },
    });
    const error = validateAgainstSchema(schema, artifact);
    assert.equal(error, null, `Expected valid but got: ${error}`);
  });

  await t.test("wrong schema_version fails", () => {
    const schema = loadSchema();
    const error = validateAgainstSchema(
      schema,
      validArtifact({ schema_version: "2.0" }),
    );
    assert.ok(error !== null, "Should fail with wrong schema_version");
    assert.ok(
      error.includes("schema_version"),
      `Error should mention field: ${error}`,
    );
  });

  await t.test("missing required field fails", () => {
    const schema = loadSchema();
    const artifact = validArtifact();
    delete artifact.pr_ref;
    const error = validateAgainstSchema(schema, artifact);
    assert.ok(error !== null, "Should fail with missing pr_ref");
    assert.ok(error.includes("pr_ref"), `Error should mention field: ${error}`);
  });

  await t.test("invalid friction signal type fails", () => {
    const schema = loadSchema();
    const artifact = validArtifact({
      friction_signals: [validSignal({ type: "unknown_type" })],
      summary: {
        total_signals: 1,
        high_impact_signals: 0,
        recommendation_count: 0,
      },
    });
    const error = validateAgainstSchema(schema, artifact);
    assert.ok(error !== null, "Should fail with invalid signal type");
    assert.ok(
      error.includes("type"),
      `Error should mention type field: ${error}`,
    );
  });

  await t.test("invalid impact level fails", () => {
    const schema = loadSchema();
    const artifact = validArtifact({
      friction_signals: [validSignal({ impact: "critical" })],
      summary: {
        total_signals: 1,
        high_impact_signals: 0,
        recommendation_count: 0,
      },
    });
    const error = validateAgainstSchema(schema, artifact);
    assert.ok(error !== null, "Should fail with invalid impact level");
    assert.ok(
      error.includes("impact"),
      `Error should mention impact field: ${error}`,
    );
  });

  await t.test("recommendation name with uppercase fails", () => {
    const schema = loadSchema();
    const artifact = validArtifact({
      skill_recommendations: [validRecommendation({ name: "MySkill" })],
      summary: {
        total_signals: 0,
        high_impact_signals: 0,
        recommendation_count: 1,
      },
    });
    const error = validateAgainstSchema(schema, artifact);
    assert.ok(error !== null, "Should fail with uppercase recommendation name");
    assert.ok(
      error.includes("name"),
      `Error should mention name field: ${error}`,
    );
  });

  await t.test("recommendation name with spaces fails", () => {
    const schema = loadSchema();
    const artifact = validArtifact({
      skill_recommendations: [validRecommendation({ name: "my skill" })],
      summary: {
        total_signals: 0,
        high_impact_signals: 0,
        recommendation_count: 1,
      },
    });
    const error = validateAgainstSchema(schema, artifact);
    assert.ok(error !== null, "Should fail with spaces in recommendation name");
  });

  await t.test("invalid recommendation category fails", () => {
    const schema = loadSchema();
    const artifact = validArtifact({
      skill_recommendations: [
        validRecommendation({ category: "unknown-category" }),
      ],
      summary: {
        total_signals: 0,
        high_impact_signals: 0,
        recommendation_count: 1,
      },
    });
    const error = validateAgainstSchema(schema, artifact);
    assert.ok(error !== null, "Should fail with invalid category");
    assert.ok(
      error.includes("category"),
      `Error should mention category: ${error}`,
    );
  });

  await t.test("non-boolean repeatable in friction signal fails", () => {
    const schema = loadSchema();
    const artifact = validArtifact({
      friction_signals: [validSignal({ repeatable: "yes" })],
      summary: {
        total_signals: 1,
        high_impact_signals: 0,
        recommendation_count: 0,
      },
    });
    const error = validateAgainstSchema(schema, artifact);
    assert.ok(error !== null, "Should fail with string repeatable");
    assert.ok(
      error.includes("repeatable"),
      `Error should mention repeatable: ${error}`,
    );
  });

  await t.test(
    "schema enums for priority and estimated_reuse are correct",
    () => {
      const schema = loadSchema();
      const recProps = schema.properties.skill_recommendations.items.properties;
      assert.deepEqual(recProps.priority.enum.sort(), [
        "high",
        "low",
        "medium",
      ]);
      assert.deepEqual(recProps.estimated_reuse.enum.sort(), [
        "frequent",
        "occasional",
        "once",
      ]);
    },
  );
});
