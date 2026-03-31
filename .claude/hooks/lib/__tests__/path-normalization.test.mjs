/**
 * Path Normalization Tests
 *
 * Tests the fix for directory traversal vulnerability in normalizeFilePath()
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFilePath } from "../contracts/hook-event.mjs";

test("normalizeFilePath - preserves absolute paths", () => {
  const result = normalizeFilePath("/home/user/file.js", "/home/user/project");
  assert.equal(result, "/home/user/file.js");
});

test("normalizeFilePath - converts relative paths to absolute", () => {
  const result = normalizeFilePath("src/index.js", "/home/user/project");
  assert.ok(
    result.includes("src/index.js") || result.includes("src\\index.js"),
    "Should contain relative path",
  );
  assert.ok(
    result.startsWith("/home/user/project") || result.includes("project"),
    "Should be absolute",
  );
});

test("normalizeFilePath - handles empty paths", () => {
  const result = normalizeFilePath("", "/home/user/project");
  assert.equal(result, "");
});

test("normalizeFilePath - handles null paths", () => {
  const result = normalizeFilePath(null, "/home/user/project");
  assert.equal(result, null);
});

test("normalizeFilePath - prevents directory traversal with ../", () => {
  const projectDir = "/home/user/project";
  const result = normalizeFilePath("../../etc/passwd", projectDir);

  // Should return original path if traversal is detected
  if (result !== "../../etc/passwd") {
    // If resolved, it should NOT escape the project directory
    assert.ok(
      result.startsWith(projectDir) || !result.includes("etc/passwd"),
      "Traversal should be blocked",
    );
  }
});

test("normalizeFilePath - allows safe relative paths", () => {
  const projectDir = "/home/user/project";
  const result = normalizeFilePath("src/components/App.js", projectDir);

  // Should resolve safely within project
  assert.ok(
    result.includes("src") &&
      result.includes("components") &&
      result.includes("App.js"),
    "Safe relative paths should be normalized",
  );
});

test("normalizeFilePath - handles paths with duplicate slashes", () => {
  const projectDir = "/home/user/project";
  const result = normalizeFilePath("src//index.js", projectDir);

  // path.normalize should clean this up
  assert.ok(!result.includes("//"), "Duplicate slashes should be normalized");
});

test("normalizeFilePath - handles paths with ./ prefix", () => {
  const projectDir = "/home/user/project";
  const result = normalizeFilePath("./src/index.js", projectDir);

  assert.ok(
    result.includes("src") && result.includes("index.js"),
    "Should handle ./ prefix",
  );
});

test("normalizeFilePath - returns original if escape detected", () => {
  const projectDir = "/home/user/project";
  const traversalPath = "../../../../../../etc/passwd";
  const result = normalizeFilePath(traversalPath, projectDir);

  // Either rejected or resolved within bounds
  if (result !== traversalPath) {
    assert.ok(
      result.startsWith(projectDir),
      "Should either reject traversal or resolve within project",
    );
  } else {
    // If returned original, traversal was detected
    assert.equal(result, traversalPath);
  }
});

test("normalizeFilePath - handles mixed separators safely", () => {
  const projectDir = "/home/user/project";
  const result = normalizeFilePath("src\\index.js", projectDir);

  // Should not crash and should produce a valid path
  assert.ok(typeof result === "string", "Should return string");
  assert.ok(result.length > 0, "Should not be empty");
});
