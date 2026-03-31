/**
 * Hook Event Validation Tests
 *
 * Tests event parsing, validation, and path normalization.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateHookEvent,
  normalizeFilePath,
} from "../contracts/hook-event.mjs";
import * as fixtures from "./fixtures.mjs";

test("validateHookEvent - valid PreToolUseEvent", () => {
  const event = fixtures.preToolUseFixtures.skillInvocation;
  const validated = validateHookEvent(event);
  assert.equal(validated.type, "PreToolUse");
  assert.equal(validated.tool_name, "Skill");
  assert.equal(validated.session_id, "test-session-123");
});

test("validateHookEvent - valid PostToolUseEvent", () => {
  const event = fixtures.postToolUseFixtures.bashSuccess;
  const validated = validateHookEvent(event);
  assert.equal(validated.type, "PostToolUse");
  assert.equal(validated.tool_name, "Bash");
});

test("validateHookEvent - valid SessionStartEvent", () => {
  const event = fixtures.sessionStartFixtures.normal;
  const validated = validateHookEvent(event);
  assert.equal(validated.type, "SessionStart");
  assert.equal(validated.session_id, "session-abc-123-def");
});

test("validateHookEvent - rejects non-object", () => {
  assert.throws(
    () => validateHookEvent(null),
    /Event must be a non-null object/,
  );

  assert.throws(
    () => validateHookEvent("string"),
    /Event must be a non-null object/,
  );

  assert.throws(
    () => validateHookEvent(123),
    /Event must be a non-null object/,
  );
});

test("validateHookEvent - rejects invalid event type", () => {
  const event = fixtures.malformedFixtures.invalidType;
  assert.throws(() => validateHookEvent(event), /Invalid event type/);
});

test("validateHookEvent - rejects missing type", () => {
  const event = fixtures.malformedFixtures.missingType;
  assert.throws(() => validateHookEvent(event), /Invalid event type/);
});

test("validateHookEvent - rejects bad timestamp", () => {
  const event = fixtures.malformedFixtures.badTimestamp;
  assert.throws(() => validateHookEvent(event), /must be ISO 8601 format/);
});

test("validateHookEvent - rejects missing session_id", () => {
  const event = fixtures.malformedFixtures.missingSessionId;
  assert.throws(() => validateHookEvent(event), /session_id is required/);
});

test("validateHookEvent - rejects empty session_id", () => {
  const event = {
    type: "PreToolUse",
    tool_name: "Write",
    session_id: "  ", // Whitespace only
    timestamp: "2026-03-30T10:00:00Z",
  };
  assert.throws(() => validateHookEvent(event), /session_id is required/);
});

test("validateHookEvent - requires tool_name for PreToolUse", () => {
  const event = {
    type: "PreToolUse",
    session_id: "test-session",
    timestamp: "2026-03-30T10:00:00Z",
    // Missing tool_name
  };
  assert.throws(() => validateHookEvent(event), /requires tool_name/);
});

test("validateHookEvent - requires tool_name for PostToolUse", () => {
  const event = {
    type: "PostToolUse",
    session_id: "test-session",
    timestamp: "2026-03-30T10:00:00Z",
    // Missing tool_name
  };
  assert.throws(() => validateHookEvent(event), /requires tool_name/);
});

test("validateHookEvent - requires project_dir for SessionStart", () => {
  const event = {
    type: "SessionStart",
    session_id: "test-session",
    home_dir: "/home/user",
    timestamp: "2026-03-30T10:00:00Z",
    // Missing project_dir
  };
  assert.throws(() => validateHookEvent(event), /requires project_dir/);
});

test("validateHookEvent - requires home_dir for SessionStart", () => {
  const event = {
    type: "SessionStart",
    session_id: "test-session",
    project_dir: "/home/user/project",
    timestamp: "2026-03-30T10:00:00Z",
    // Missing home_dir
  };
  assert.throws(() => validateHookEvent(event), /requires home_dir/);
});

test("normalizeFilePath - preserves absolute paths", () => {
  const absolute = "/home/user/project/file.txt";
  const result = normalizeFilePath(absolute, "/home/user/project");
  assert.equal(result, absolute);
});

test("normalizeFilePath - converts relative to absolute", () => {
  const relative = "shared/skills/my-skill/SKILL.md";
  const projectDir = "/home/user/project";
  const result = normalizeFilePath(relative, projectDir);
  assert.equal(result, "/home/user/project/shared/skills/my-skill/SKILL.md");
});

test("normalizeFilePath - handles empty path", () => {
  const result = normalizeFilePath("", "/home/user/project");
  assert.equal(result, "");
});

test("normalizeFilePath - handles null path", () => {
  const result = normalizeFilePath(null, "/home/user/project");
  assert.equal(result, null);
});

test("normalizeFilePath - handles undefined path", () => {
  const result = normalizeFilePath(undefined, "/home/user/project");
  assert.equal(result, undefined);
});
