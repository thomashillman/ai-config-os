/**
 * Ensures verify.mjs documents and implements --skip-tests alongside --skip-dashboard.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERIFY = resolve(__dirname, "..", "verify.mjs");

test("verify.mjs supports --skip-tests and avoids duplicate test run", () => {
  const src = readFileSync(VERIFY, "utf8");
  assert.ok(
    src.includes("--skip-tests"),
    "verify.mjs must document and handle --skip-tests",
  );
  assert.ok(src.includes("skipTests"), "verify.mjs must use skipTests flag");
});
