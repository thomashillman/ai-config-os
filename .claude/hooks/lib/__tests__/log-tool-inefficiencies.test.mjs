/**
 * Log Tool Inefficiencies Rule Tests
 *
 * Tests logging of tool errors and loop detection
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { rule } from "../rules/log-tool-inefficiencies.mjs";

const analyticsDir = join(
  process.env.HOME || "/tmp",
  ".claude",
  "skill-analytics",
);
const counterDir = "/tmp/claude-sessions";

function cleanup() {
  try {
    rmSync(analyticsDir, { recursive: true, force: true });
    rmSync(counterDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore
  }
}

function readInefficienciesLog() {
  try {
    if (!existsSync(join(analyticsDir, "inefficiencies.jsonl"))) {
      return [];
    }
    return readFileSync(join(analyticsDir, "inefficiencies.jsonl"), "utf8")
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  } catch (e) {
    return [];
  }
}

test("log-tool-inefficiencies - logs tool errors", async () => {
  cleanup();

  const event = {
    type: "PostToolUse",
    tool_name: "Bash",
    tool_response: {
      is_error: true,
      content: "Command not found: foo",
    },
    session_id: "test-session-1",
    timestamp: "2026-03-30T10:00:00Z",
  };

  await rule.execute(event);

  const logs = readInefficienciesLog();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].type, "tool_error");
  assert.equal(logs[0].tool, "Bash");
  assert.ok(logs[0].snippet.includes("Command not found"));

  cleanup();
});

test("log-tool-inefficiencies - extracts snippet from error content", async () => {
  cleanup();

  const longError = "x".repeat(500);
  const event = {
    type: "PostToolUse",
    tool_name: "Edit",
    tool_response: {
      is_error: true,
      content: longError,
    },
    session_id: "test-session-2",
    timestamp: "2026-03-30T10:00:00Z",
  };

  await rule.execute(event);

  const logs = readInefficienciesLog();
  assert.ok(
    logs[0].snippet.length <= 300,
    "Snippet should be truncated to 300 chars",
  );

  cleanup();
});

test("log-tool-inefficiencies - handles array content", async () => {
  cleanup();

  const event = {
    type: "PostToolUse",
    tool_name: "Bash",
    tool_response: {
      is_error: true,
      content: [{ text: "Error message in array" }],
    },
    session_id: "test-session-3",
    timestamp: "2026-03-30T10:00:00Z",
  };

  await rule.execute(event);

  const logs = readInefficienciesLog();
  assert.equal(logs[0].snippet, "Error message in array");

  cleanup();
});

test("log-tool-inefficiencies - ignores non-error responses", async () => {
  cleanup();

  const event = {
    type: "PostToolUse",
    tool_name: "Bash",
    tool_response: {
      is_error: false,
      content: "Success",
    },
    session_id: "test-session-4",
    timestamp: "2026-03-30T10:00:00Z",
  };

  await rule.execute(event);

  const logs = readInefficienciesLog();
  assert.equal(logs.length, 0, "Should not log non-error responses");

  cleanup();
});

test("log-tool-inefficiencies - detects Bash loop at threshold 6", async () => {
  cleanup();

  const sessionId = "test-session-5";

  // Call Bash 6 times
  for (let i = 0; i < 6; i++) {
    await rule.execute({
      type: "PostToolUse",
      tool_name: "Bash",
      tool_response: { is_error: false },
      session_id: sessionId,
      timestamp: `2026-03-30T10:0${i}:00Z`,
    });
  }

  const logs = readInefficienciesLog();
  const loopLog = logs.find((l) => l.type === "loop_suspected");
  assert.ok(loopLog, "Should log loop_suspected at Bash threshold");
  assert.equal(loopLog.tool, "Bash");
  assert.equal(loopLog.call_count, 6);

  cleanup();
});

test("log-tool-inefficiencies - detects Edit loop at threshold 10", async () => {
  cleanup();

  const sessionId = "test-session-6";

  // Call Edit 10 times
  for (let i = 0; i < 10; i++) {
    await rule.execute({
      type: "PostToolUse",
      tool_name: "Edit",
      file_path: `/file${i}.js`,
      tool_response: { is_error: false },
      session_id: sessionId,
      timestamp: `2026-03-30T10:0${i % 6}:0${i % 60}Z`,
    });
  }

  const logs = readInefficienciesLog();
  const loopLog = logs.find(
    (l) => l.type === "loop_suspected" && l.tool === "Edit",
  );
  assert.ok(loopLog, "Should log loop_suspected at Edit threshold");
  assert.equal(loopLog.call_count, 10);

  cleanup();
});

test("log-tool-inefficiencies - logs loop only at exact threshold", async () => {
  cleanup();

  const sessionId = "test-session-7";

  // Call Bash 7 times (threshold is 6)
  for (let i = 0; i < 7; i++) {
    await rule.execute({
      type: "PostToolUse",
      tool_name: "Bash",
      tool_response: { is_error: false },
      session_id: sessionId,
      timestamp: `2026-03-30T10:0${i}:00Z`,
    });
  }

  const logs = readInefficienciesLog();
  const loopLogs = logs.filter((l) => l.type === "loop_suspected");
  assert.equal(loopLogs.length, 1, "Should log loop only once (at threshold)");
  assert.equal(loopLogs[0].call_count, 6);

  cleanup();
});

test("log-tool-inefficiencies - uses tool-specific thresholds", async () => {
  cleanup();

  const sessionId = "test-session-8";

  // Read has threshold of 15, but let's call Grep which has 12
  for (let i = 0; i < 12; i++) {
    await rule.execute({
      type: "PostToolUse",
      tool_name: "Grep",
      tool_response: { is_error: false },
      session_id: sessionId,
      timestamp: `2026-03-30T10:00:${String(i).padStart(2, "0")}Z`,
    });
  }

  const logs = readInefficienciesLog();
  const loopLog = logs.find((l) => l.type === "loop_suspected");
  assert.ok(loopLog, "Grep should trigger at 12 calls");
  assert.equal(loopLog.call_count, 12);

  cleanup();
});

test("log-tool-inefficiencies - uses default threshold 8 for unknown tools", async () => {
  cleanup();

  const sessionId = "test-session-9";

  // Call unknown tool 8 times
  for (let i = 0; i < 8; i++) {
    await rule.execute({
      type: "PostToolUse",
      tool_name: "UnknownTool",
      tool_response: { is_error: false },
      session_id: sessionId,
      timestamp: `2026-03-30T10:00:${String(i).padStart(2, "0")}Z`,
    });
  }

  const logs = readInefficienciesLog();
  const loopLog = logs.find((l) => l.type === "loop_suspected");
  assert.ok(loopLog, "Unknown tool should use default threshold 8");
  assert.equal(loopLog.call_count, 8);

  cleanup();
});

test("log-tool-inefficiencies - maintains per-tool counts per session", async () => {
  cleanup();

  const sessionId = "test-session-10";

  // Call Bash 3 times, Edit 3 times (both under thresholds)
  for (let i = 0; i < 3; i++) {
    await rule.execute({
      type: "PostToolUse",
      tool_name: "Bash",
      tool_response: { is_error: false },
      session_id: sessionId,
      timestamp: `2026-03-30T10:00:0${i}Z`,
    });

    await rule.execute({
      type: "PostToolUse",
      tool_name: "Edit",
      file_path: `/file${i}.js`,
      tool_response: { is_error: false },
      session_id: sessionId,
      timestamp: `2026-03-30T10:00:${String(3 + i).padStart(2, "0")}Z`,
    });
  }

  const logs = readInefficienciesLog();
  // Should be no loops yet
  assert.equal(logs.filter((l) => l.type === "loop_suspected").length, 0);

  cleanup();
});

test("log-tool-inefficiencies - creates analytics directory", async () => {
  cleanup();

  const event = {
    type: "PostToolUse",
    tool_name: "Bash",
    tool_response: { is_error: true, content: "Error" },
    session_id: "test-session-11",
    timestamp: "2026-03-30T10:00:00Z",
  };

  await rule.execute(event);

  assert.ok(existsSync(analyticsDir), "Analytics directory should be created");
  assert.ok(
    existsSync(join(analyticsDir, "inefficiencies.jsonl")),
    "JSONL file should exist",
  );

  cleanup();
});

test("log-tool-inefficiencies - returns allow decision", async () => {
  cleanup();

  const event = {
    type: "PostToolUse",
    tool_name: "Bash",
    tool_response: { is_error: false },
    session_id: "test-session-12",
    timestamp: "2026-03-30T10:00:00Z",
  };

  const result = await rule.execute(event);
  assert.equal(result.decision, "allow");

  cleanup();
});
