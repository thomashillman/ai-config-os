/**
 * Skill Outcome Tracker Rule Tests
 *
 * Tests the state machine logic for tracking whether skill outputs are acted upon:
 * - PreToolUse (Skill): Record new pending skill, mark previous as replaced
 * - PostToolUse (Edit/Write): Check timing, record outcome, clear pending
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { rule } from "../rules/skill-outcome-tracker.mjs";

// Setup temp directories for test isolation
const tmpDir = "/tmp/claude-sessions";
const analyticsDir = join(
  process.env.HOME || "/tmp",
  ".claude",
  "skill-analytics",
);

function cleanup() {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(analyticsDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
}

function readOutcomesLog() {
  try {
    if (!existsSync(join(analyticsDir, "skill-outcomes.jsonl"))) {
      return [];
    }
    return readFileSync(join(analyticsDir, "skill-outcomes.jsonl"), "utf8")
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  } catch (e) {
    return [];
  }
}

test("skill-outcome-tracker - PreToolUse with Skill creates pending state", async () => {
  cleanup();

  const event = {
    type: "PreToolUse",
    tool_name: "Skill",
    tool_input: { skill: "debug", args: "--verbose" },
    session_id: "test-session-1",
    timestamp: "2026-03-30T10:00:00Z",
  };

  const result = await rule.execute(event);
  assert.equal(result.decision, "allow");

  // Verify pending file was created
  const pendingFile = join(tmpDir, "test-session-1-skill-pending.json");
  assert.ok(existsSync(pendingFile), "Pending file should exist");

  const pending = JSON.parse(readFileSync(pendingFile, "utf8"));
  assert.equal(pending.skill_name, "debug");
  assert.equal(pending.invoked_at, "2026-03-30T10:00:00Z");

  cleanup();
});

test("skill-outcome-tracker - PreToolUse with different Skill marks previous as replaced", async () => {
  cleanup();

  const sessionId = "test-session-2";

  // First Skill invocation
  await rule.execute({
    type: "PreToolUse",
    tool_name: "Skill",
    tool_input: { skill: "debug" },
    session_id: sessionId,
    timestamp: "2026-03-30T10:00:00Z",
  });

  // Second Skill invocation (should mark first as replaced)
  await rule.execute({
    type: "PreToolUse",
    tool_name: "Skill",
    tool_input: { skill: "simplify" },
    session_id: sessionId,
    timestamp: "2026-03-30T10:00:05Z",
  });

  const outcomes = readOutcomesLog();
  const replaced = outcomes.find((o) => o.outcome === "output_replaced");
  assert.ok(replaced, "Should record output_replaced");
  assert.equal(replaced.skill, "debug");

  // Verify new pending skill is recorded
  const pendingFile = join(tmpDir, `${sessionId}-skill-pending.json`);
  const pending = JSON.parse(readFileSync(pendingFile, "utf8"));
  assert.equal(pending.skill_name, "simplify");

  cleanup();
});

test("skill-outcome-tracker - PreToolUse ignores non-Skill tools", async () => {
  cleanup();

  const sessionId = "test-session-3";

  await rule.execute({
    type: "PreToolUse",
    tool_name: "Edit",
    file_path: "/home/user/test.js",
    session_id: sessionId,
    timestamp: "2026-03-30T10:00:00Z",
  });

  // Pending file should NOT exist
  const pendingFile = join(tmpDir, `${sessionId}-skill-pending.json`);
  assert.ok(
    !existsSync(pendingFile),
    "Pending file should not exist for non-Skill tools",
  );

  cleanup();
});

test("skill-outcome-tracker - PostToolUse with Edit within 10min records output_used", async () => {
  cleanup();

  const sessionId = "test-session-4";
  const baseTime = new Date("2026-03-30T10:00:00Z");

  // Skill invocation at time 0
  await rule.execute({
    type: "PreToolUse",
    tool_name: "Skill",
    tool_input: { skill: "refactor" },
    session_id: sessionId,
    timestamp: "2026-03-30T10:00:00Z",
  });

  // Edit 5 minutes later (within threshold)
  const editTime = new Date(baseTime.getTime() + 5 * 60 * 1000);
  await rule.execute({
    type: "PostToolUse",
    tool_name: "Edit",
    file_path: "/home/user/test.js",
    session_id: sessionId,
    timestamp: editTime.toISOString(),
  });

  const outcomes = readOutcomesLog();
  const used = outcomes.find((o) => o.outcome === "output_used");
  assert.ok(used, "Should record output_used within time threshold");
  assert.equal(used.skill, "refactor");

  cleanup();
});

test("skill-outcome-tracker - PostToolUse with Write within 10min records output_used", async () => {
  cleanup();

  const sessionId = "test-session-5";
  const baseTime = new Date("2026-03-30T10:00:00Z");

  // Skill invocation
  await rule.execute({
    type: "PreToolUse",
    tool_name: "Skill",
    tool_input: { skill: "test-writer" },
    session_id: sessionId,
    timestamp: "2026-03-30T10:00:00Z",
  });

  // Write 8 minutes later
  const writeTime = new Date(baseTime.getTime() + 8 * 60 * 1000);
  await rule.execute({
    type: "PostToolUse",
    tool_name: "Write",
    file_path: "/home/user/test.js",
    session_id: sessionId,
    timestamp: writeTime.toISOString(),
  });

  const outcomes = readOutcomesLog();
  const used = outcomes.find((o) => o.outcome === "output_used");
  assert.ok(used, "Should record output_used for Write tool");
  assert.equal(used.skill, "test-writer");

  cleanup();
});

test("skill-outcome-tracker - PostToolUse clears pending after outcome recorded", async () => {
  cleanup();

  const sessionId = "test-session-6";

  // Skill invocation
  await rule.execute({
    type: "PreToolUse",
    tool_name: "Skill",
    tool_input: { skill: "debug" },
    session_id: sessionId,
    timestamp: "2026-03-30T10:00:00Z",
  });

  const pendingFile = join(
    "/tmp/claude-sessions",
    `${sessionId}-skill-pending.json`,
  );
  assert.ok(existsSync(pendingFile), "Pending file should exist after Skill");

  // Edit within threshold
  await rule.execute({
    type: "PostToolUse",
    tool_name: "Edit",
    file_path: "/home/user/test.js",
    session_id: sessionId,
    timestamp: "2026-03-30T10:01:00Z",
  });

  assert.ok(
    !existsSync(pendingFile),
    "Pending file should be cleared after outcome recorded",
  );

  cleanup();
});

test("skill-outcome-tracker - PostToolUse ignores Edit/Write without pending skill", async () => {
  cleanup();

  const sessionId = "test-session-7";

  // No prior Skill invocation, just Edit
  await rule.execute({
    type: "PostToolUse",
    tool_name: "Edit",
    file_path: "/home/user/test.js",
    session_id: sessionId,
    timestamp: "2026-03-30T10:00:00Z",
  });

  const outcomes = readOutcomesLog();
  assert.equal(
    outcomes.length,
    0,
    "Should not record outcome without pending skill",
  );

  cleanup();
});

test("skill-outcome-tracker - PostToolUse ignores non-Edit/Write tools", async () => {
  cleanup();

  const sessionId = "test-session-8";

  // Skill invocation
  await rule.execute({
    type: "PreToolUse",
    tool_name: "Skill",
    tool_input: { skill: "debug" },
    session_id: sessionId,
    timestamp: "2026-03-30T10:00:00Z",
  });

  // PostToolUse with Bash (should be ignored)
  await rule.execute({
    type: "PostToolUse",
    tool_name: "Bash",
    session_id: sessionId,
    timestamp: "2026-03-30T10:00:05Z",
  });

  const outcomes = readOutcomesLog();
  assert.equal(
    outcomes.length,
    0,
    "Should not record outcome for non-Edit/Write tools",
  );

  // Pending should still exist
  const pendingFile = join(
    "/tmp/claude-sessions",
    `${sessionId}-skill-pending.json`,
  );
  assert.ok(
    existsSync(pendingFile),
    "Pending should remain after non-Edit/Write PostToolUse",
  );

  cleanup();
});

test("skill-outcome-tracker - Phase routing works correctly", async () => {
  cleanup();

  const sessionId = "test-session-9";

  // Test that execute() correctly routes to handlePreToolUse
  const preEvent = {
    type: "PreToolUse",
    tool_name: "Skill",
    tool_input: { skill: "debug" },
    session_id: sessionId,
    timestamp: "2026-03-30T10:00:00Z",
  };

  const preResult = await rule.execute(preEvent);
  assert.equal(preResult.decision, "allow");
  assert.ok(
    existsSync(join("/tmp/claude-sessions", `${sessionId}-skill-pending.json`)),
  );

  // Test that execute() correctly routes to handlePostToolUse
  const postEvent = {
    type: "PostToolUse",
    tool_name: "Edit",
    file_path: "/home/user/test.js",
    session_id: sessionId,
    timestamp: "2026-03-30T10:00:05Z",
  };

  const postResult = await rule.execute(postEvent);
  assert.equal(postResult.decision, "allow");

  cleanup();
});

test("skill-outcome-tracker - JSONL format is valid", async () => {
  cleanup();

  const sessionId = "test-session-10";

  await rule.execute({
    type: "PreToolUse",
    tool_name: "Skill",
    tool_input: { skill: "simplify" },
    session_id: sessionId,
    timestamp: "2026-03-30T10:00:00Z",
  });

  await rule.execute({
    type: "PreToolUse",
    tool_name: "Skill",
    tool_input: { skill: "debug" },
    session_id: sessionId,
    timestamp: "2026-03-30T10:00:05Z",
  });

  const outcomes = readOutcomesLog();
  const outcome = outcomes[0];

  assert.ok(outcome.timestamp, "Should have timestamp");
  assert.ok(outcome.session_id, "Should have session_id");
  assert.ok(outcome.skill, "Should have skill");
  assert.ok(outcome.outcome, "Should have outcome");
  assert.ok(
    ["output_used", "output_replaced"].includes(outcome.outcome),
    "Outcome should be valid",
  );

  cleanup();
});
