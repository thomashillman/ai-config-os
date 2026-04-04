/**
 * Payload Capture Tests
 *
 * Tests the diagnostic capture logic for:
 * - First invocation writes redacted capture file and sentinel
 * - Second invocation skips capture when sentinel exists
 * - Sensitive keys are redacted recursively
 * - Non-JSON stdin still gets captured safely
 * - Capture failures never throw or alter success path
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { capturePayload, notifyCaptureLocation } from "../payload-capture.mjs";

// Helpers for testing
function cleanupTestFiles() {
  const tempDir = os.tmpdir();
  const sentinelPath = path.join(tempDir, ".acos-hook-capture.sentinel");
  const payloadPath = path.join(tempDir, ".acos-hook-payload.jsonl");

  if (fs.existsSync(sentinelPath)) {
    fs.unlinkSync(sentinelPath);
  }
  if (fs.existsSync(payloadPath)) {
    fs.unlinkSync(payloadPath);
  }
}

function readCaptureFile() {
  const tempDir = os.tmpdir();
  const payloadPath = path.join(tempDir, ".acos-hook-payload.jsonl");
  if (!fs.existsSync(payloadPath)) return null;

  const lines = fs.readFileSync(payloadPath, "utf8").trim().split("\n");
  return lines.map((line) => JSON.parse(line));
}

test("capturePayload - first invocation writes file and sentinel", () => {
  cleanupTestFiles();

  const event = JSON.stringify({
    type: "PreToolUse",
    tool_name: "Write",
    session_id: "test-123",
  });

  const result = capturePayload(event);
  assert.ok(result, "capturePayload should return a path");
  assert.ok(result.includes(".acos-hook-payload.jsonl"));

  // Check that file was written
  assert.ok(fs.existsSync(result), "Payload file should exist");

  // Check that sentinel was written
  const tempDir = os.tmpdir();
  const sentinelPath = path.join(tempDir, ".acos-hook-capture.sentinel");
  assert.ok(fs.existsSync(sentinelPath), "Sentinel file should exist");

  cleanupTestFiles();
});

test("capturePayload - second invocation skips capture when sentinel exists", () => {
  cleanupTestFiles();

  const event = JSON.stringify({
    type: "PreToolUse",
    tool_name: "Write",
    session_id: "test-123",
  });

  // First call
  const result1 = capturePayload(event);
  assert.ok(result1, "First invocation should return path");

  // Get the content from first call
  const lines1 = readCaptureFile();
  assert.equal(lines1.length, 1, "Should have 1 entry after first call");

  // Second call with different content
  const event2 = JSON.stringify({
    type: "PostToolUse",
    tool_name: "Bash",
    session_id: "test-456",
  });

  const result2 = capturePayload(event2);
  assert.equal(result2, null, "Second invocation should return null");

  // Verify file wasn't appended to
  const lines2 = readCaptureFile();
  assert.equal(
    lines2.length,
    1,
    "Should still have 1 entry; second call should not append",
  );

  cleanupTestFiles();
});

test("capturePayload - redacts sensitive keys recursively", () => {
  cleanupTestFiles();

  const event = JSON.stringify({
    type: "PreToolUse",
    tool_name: "Write",
    session_id: "test-123",
    api_key: "secret-key-12345",
    nested: {
      authorization: "Bearer token-xyz-789",
      password: "my-password",
      safe_field: "keep-this",
    },
    array_of_objects: [
      { token: "token-1", name: "obj1" },
      { credential: "cred-2", name: "obj2" },
    ],
  });

  capturePayload(event);

  const lines = readCaptureFile();
  assert.ok(lines.length >= 1);

  const capture = lines[0];
  const redacted = capture.raw_stdin_redacted;

  // Check sensitive values are redacted
  assert.equal(redacted.api_key, "[REDACTED]");
  assert.equal(redacted.nested.authorization, "[REDACTED]");
  assert.equal(redacted.nested.password, "[REDACTED]");
  assert.equal(redacted.array_of_objects[0].token, "[REDACTED]");
  assert.equal(redacted.array_of_objects[1].credential, "[REDACTED]");

  // Check safe fields are preserved
  assert.equal(redacted.type, "PreToolUse");
  assert.equal(redacted.session_id, "test-123");
  assert.equal(redacted.nested.safe_field, "keep-this");
  assert.equal(redacted.array_of_objects[0].name, "obj1");

  cleanupTestFiles();
});

test("capturePayload - redacts bearer tokens by value pattern", () => {
  cleanupTestFiles();

  const event = JSON.stringify({
    type: "SessionStart",
    session_id: "test-123",
    auth_header: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz.abc",
  });

  capturePayload(event);

  const lines = readCaptureFile();
  const capture = lines[0];
  const redacted = capture.raw_stdin_redacted;

  // Should redact because it's a bearer token by pattern
  assert.equal(redacted.auth_header, "[REDACTED]");

  cleanupTestFiles();
});

test("capturePayload - captures non-JSON stdin safely", () => {
  cleanupTestFiles();

  const nonJsonInput = "this is not valid json {]";

  const result = capturePayload(nonJsonInput);
  assert.ok(result, "Should still capture non-JSON input");

  const lines = readCaptureFile();
  assert.equal(lines.length, 1);

  const capture = lines[0];
  assert.equal(capture.parseable_json, false);
  assert.ok(capture.raw_stdin_redacted, "Should have redacted content");

  cleanupTestFiles();
});

test("capturePayload - records metadata correctly", () => {
  cleanupTestFiles();

  const event = JSON.stringify({
    type: "PreToolUse",
    tool_name: "Read",
    session_id: "test-123",
  });

  const origCwd = process.cwd();
  capturePayload(event);

  const lines = readCaptureFile();
  assert.equal(lines.length, 1);

  const capture = lines[0];
  assert.ok(capture.captured_at, "Should have captured_at");
  assert.equal(capture.pid, process.pid);
  assert.equal(capture.cwd, origCwd);
  assert.ok(Array.isArray(capture.parsed_top_level_keys));
  assert.ok(capture.parsed_top_level_keys.includes("type"));

  cleanupTestFiles();
});

test("capturePayload - never throws on capture logic failure", () => {
  // This test verifies that even if something goes wrong (e.g., file system issue),
  // the function doesn't throw and returns gracefully.
  // We can't easily simulate an FS error in Node, so we just verify the
  // function never throws on valid input.

  cleanupTestFiles();

  assert.doesNotThrow(() => {
    capturePayload(JSON.stringify({ type: "PreToolUse" }));
  });

  cleanupTestFiles();
});

test("capturePayload - preserves JSON structure in redacted output", () => {
  cleanupTestFiles();

  const event = JSON.stringify({
    type: "PreToolUse",
    tool_name: "Write",
    tool_input: {
      file_path: "/path/to/file",
      content: "data",
      secret_key: "super-secret-123",
    },
    metadata: {
      session_id: "session-abc",
      token: "token-xyz",
    },
  });

  capturePayload(event);

  const lines = readCaptureFile();
  const capture = lines[0];
  const redacted = capture.raw_stdin_redacted;

  // Check structure is preserved
  assert.ok(typeof redacted === "object");
  assert.ok(redacted.tool_input);
  assert.equal(typeof redacted.tool_input, "object");
  assert.ok(redacted.tool_input.file_path);
  assert.ok(redacted.metadata);

  // Check redaction within structure
  assert.equal(redacted.tool_input.secret_key, "[REDACTED]");
  assert.equal(redacted.metadata.token, "[REDACTED]");

  cleanupTestFiles();
});

test("notifyCaptureLocation - does not throw on null path", () => {
  assert.doesNotThrow(() => {
    notifyCaptureLocation(null);
  });
});
