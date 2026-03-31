/**
 * Feedback Loop V1 Documentation Test
 *
 * Verifies that the feedback-loop-v1.md documentation exists and includes
 * required scope definitions and out-of-scope guardrails.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const FEEDBACK_LOOP_DOC = resolve(ROOT, "docs/feedback-loop-v1.md");

test("feedback-loop-v1.md documentation", async (t) => {
  await t.test("documentation file exists", () => {
    assert.ok(
      existsSync(FEEDBACK_LOOP_DOC),
      `${FEEDBACK_LOOP_DOC} should exist`,
    );
  });

  await t.test("documentation includes required scope anchors", () => {
    const content = readFileSync(FEEDBACK_LOOP_DOC, "utf8");

    const requiredPhrases = ["read model", "proposal", "not in scope"];

    for (const phrase of requiredPhrases) {
      assert.ok(
        content.includes(phrase),
        `documentation should include "${phrase}"`,
      );
    }
  });

  await t.test("documentation defines out-of-scope items", () => {
    const content = readFileSync(FEEDBACK_LOOP_DOC, "utf8");

    const outOfScopeItems = [
      "routing",
      "auth",
      "capability detection",
      "bootstrap provider selection",
      "task persistence",
      "Worker security",
    ];

    for (const item of outOfScopeItems) {
      assert.ok(
        content.includes(item),
        `documentation should mention "${item}" as out of scope`,
      );
    }
  });
});
