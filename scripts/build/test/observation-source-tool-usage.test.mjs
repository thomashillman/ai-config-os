/**
 * Atom 8: Tool usage observation source tests
 *
 * TDD tests for tool usage observation source:
 * - Reading project .claude/metrics.jsonl file
 * - Parsing tool execution events into canonical format
 * - Counting successful vs failed tool invocations
 * - Handling missing files, malformed lines, and errors
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { loadToolUsageObservations } from "../../../runtime/lib/observation-sources/tool-usage.mjs";

function createTempDir() {
  const dir = join(
    tmpdir(),
    `tool-usage-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

test("loadToolUsageObservations: returns empty array when no metrics file exists", async () => {
  const tempDir = createTempDir();

  const events = await loadToolUsageObservations({ projectDir: tempDir });

  assert.deepEqual(events, []);
  rmSync(tempDir, { recursive: true, force: true });
});

test("loadToolUsageObservations: reads successful tool invocations", async () => {
  const tempDir = createTempDir();
  const claudeDir = join(tempDir, ".claude");
  mkdirSync(claudeDir, { recursive: true });

  const metricsFile = join(claudeDir, "metrics.jsonl");
  const line1 = JSON.stringify({
    timestamp: "2026-03-23T10:00:00Z",
    tool: "bash",
    status: "success",
    duration_ms: 150,
  });
  const line2 = JSON.stringify({
    timestamp: "2026-03-23T10:00:05Z",
    tool: "read",
    status: "success",
    duration_ms: 50,
  });

  writeFileSync(metricsFile, `${line1}\n${line2}\n`, "utf8");

  const events = await loadToolUsageObservations({ projectDir: tempDir });

  assert.equal(events.length, 2);
  assert.equal(events[0].type, "tool_usage");
  assert.equal(events[0].tool_name, "bash");
  assert.equal(events[0].status, "success");
  assert.equal(events[0].duration_ms, 150);
  assert.equal(events[1].tool_name, "read");

  rmSync(tempDir, { recursive: true, force: true });
});

test("loadToolUsageObservations: counts tool errors as separate events", async () => {
  const tempDir = createTempDir();
  const claudeDir = join(tempDir, ".claude");
  mkdirSync(claudeDir, { recursive: true });

  const metricsFile = join(claudeDir, "metrics.jsonl");
  const successEvent = JSON.stringify({
    timestamp: "2026-03-23T10:00:00Z",
    tool: "bash",
    status: "success",
    duration_ms: 100,
  });
  const errorEvent = JSON.stringify({
    timestamp: "2026-03-23T10:00:05Z",
    tool: "bash",
    status: "error",
    duration_ms: 50,
    error_code: "EXECUTION_FAILED",
  });

  writeFileSync(metricsFile, `${successEvent}\n${errorEvent}\n`, "utf8");

  const events = await loadToolUsageObservations({ projectDir: tempDir });

  assert.equal(events.length, 2);
  assert.equal(events[0].status, "success");
  assert.equal(events[1].status, "error");
  assert.equal(events[1].error_code, "EXECUTION_FAILED");

  rmSync(tempDir, { recursive: true, force: true });
});

test("loadToolUsageObservations: respects limit parameter", async () => {
  const tempDir = createTempDir();
  const claudeDir = join(tempDir, ".claude");
  mkdirSync(claudeDir, { recursive: true });

  const metricsFile = join(claudeDir, "metrics.jsonl");
  const events = [];
  for (let i = 0; i < 15; i++) {
    events.push(
      JSON.stringify({
        timestamp: `2026-03-23T10:00:${String(i).padStart(2, "0")}Z`,
        tool: `tool_${i}`,
        status: "success",
        duration_ms: i * 10,
      }),
    );
  }

  writeFileSync(metricsFile, events.join("\n") + "\n", "utf8");

  const result = await loadToolUsageObservations({
    projectDir: tempDir,
    limit: 10,
  });

  assert.equal(result.length, 10, "should respect limit parameter");

  rmSync(tempDir, { recursive: true, force: true });
});

test("loadToolUsageObservations: skips malformed lines", async () => {
  const tempDir = createTempDir();
  const claudeDir = join(tempDir, ".claude");
  mkdirSync(claudeDir, { recursive: true });

  const metricsFile = join(claudeDir, "metrics.jsonl");
  const validEvent = JSON.stringify({
    timestamp: "2026-03-23T10:00:00Z",
    tool: "bash",
    status: "success",
    duration_ms: 100,
  });

  writeFileSync(
    metricsFile,
    `${validEvent}\ninvalid json line\n${validEvent}\n`,
    "utf8",
  );

  const events = await loadToolUsageObservations({ projectDir: tempDir });

  assert.equal(events.length, 2, "should skip malformed lines");
  assert.equal(events[0].tool_name, "bash");
  assert.equal(events[1].tool_name, "bash");

  rmSync(tempDir, { recursive: true, force: true });
});
