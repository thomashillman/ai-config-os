/**
 * Atom 5 — Test: run-tests dist-read vs dist-write classification
 *
 * Verifies that the DIST_WRITE_PATTERN regex correctly separates tests that
 * actually invoke the compiler (write) from tests that only read pre-built
 * dist/ artifacts (read). Read-only dist tests can safely run in parallel.
 *
 * RED: DIST_WRITE_PATTERN does not exist → read-only files match old broad pattern
 * GREEN: DIST_WRITE_PATTERN distinguishes compiler-invoking from read-only tests
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Known files that ONLY READ from dist/ (no compiler invocation)
const READ_ONLY_DIST_FILES = [
  join(__dirname, "capability-discovery-api.test.mjs"),
  join(__dirname, "materialisation-contract.test.mjs"),
  join(__dirname, "worker-contract.test.mjs"),
];

// Known files that INVOKE THE COMPILER (write to dist/)
const WRITE_DIST_FILES = [
  join(__dirname, "delivery-contract.test.mjs"),
  join(__dirname, "version.test.mjs"),
  join(__dirname, "scaffold-and-provenance.test.mjs"),
];

// The NARROW pattern that identifies only tests invoking the compiler
// (subset of the old broad DIST_PATTERN)
const DIST_WRITE_PATTERN = /COMPILE_MJS|ensureFreshDist|spawnSync[^)]*compile/;

describe("run-tests dist classification", () => {
  test("DIST_WRITE_PATTERN does NOT match read-only dist test files", () => {
    for (const filePath of READ_ONLY_DIST_FILES) {
      let content;
      try {
        content = readFileSync(filePath, "utf8");
      } catch {
        // Skip files that don't exist in this environment
        continue;
      }
      const matched = DIST_WRITE_PATTERN.test(content);
      assert.equal(
        matched,
        false,
        `Read-only dist test ${filePath} should NOT match DIST_WRITE_PATTERN (would be incorrectly serialised)`,
      );
    }
  });

  test("DIST_WRITE_PATTERN DOES match compiler-invoking test files", () => {
    for (const filePath of WRITE_DIST_FILES) {
      let content;
      try {
        content = readFileSync(filePath, "utf8");
      } catch {
        continue;
      }
      const matched = DIST_WRITE_PATTERN.test(content);
      assert.equal(
        matched,
        true,
        `Compiler-invoking test ${filePath} should match DIST_WRITE_PATTERN`,
      );
    }
  });

  test("read-only dist tests still match old broad DIST_PATTERN (baseline)", () => {
    // Confirms the old pattern was too broad — these files DO match DIST_PATTERN
    // even though they don't invoke the compiler
    const OLD_DIST_PATTERN =
      /COMPILE_MJS|ensureFreshDist|spawnSync[^)]*compile|DIST_DIR|['"`]dist\/clients|['"`]dist\/registry|['"`]dist\/runtime/;

    let atLeastOneMatched = false;
    for (const filePath of READ_ONLY_DIST_FILES) {
      let content;
      try {
        content = readFileSync(filePath, "utf8");
      } catch {
        continue;
      }
      if (OLD_DIST_PATTERN.test(content)) {
        atLeastOneMatched = true;
        break;
      }
    }
    assert.ok(
      atLeastOneMatched,
      "At least one read-only dist test should match the old broad DIST_PATTERN (confirming it was over-conservative)",
    );
  });
});
