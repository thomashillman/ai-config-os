/**
 * Atom 6: Bootstrap telemetry adapter tests
 *
 * TDD tests for bootstrap telemetry observation source:
 * - Reading existing bootstrap-*.jsonl files
 * - Parsing phase events into canonical format
 * - Handling missing files, malformed lines, and errors
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { loadBootstrapTelemetry } from "../../../runtime/lib/observation-sources/bootstrap-telemetry.mjs";

function createTempDir() {
  const dir = join(
    tmpdir(),
    `bootstrap-telemetry-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

test("loadBootstrapTelemetry: returns empty array when no log directory exists", async () => {
  const tempDir = createTempDir();
  const logsDir = join(tempDir, ".ai-config-os", "logs");

  const events = await loadBootstrapTelemetry({ home: tempDir });

  assert.deepEqual(events, []);
  rmSync(tempDir, { recursive: true, force: true });
});

test("loadBootstrapTelemetry: reads successful phase events from bootstrap-claude.jsonl", async () => {
  const tempDir = createTempDir();
  const logsDir = join(tempDir, ".ai-config-os", "logs");
  mkdirSync(logsDir, { recursive: true });

  const logFile = join(logsDir, "bootstrap-claude.jsonl");
  const line1 = JSON.stringify({
    phase: "resolve_provider",
    provider: "claude",
    duration_ms: 0,
    result: "ok",
    error_code: null,
    deferred: false,
  });
  const line2 = JSON.stringify({
    phase: "acquire_remote_bundle",
    provider: "claude",
    duration_ms: 386,
    result: "ok",
    error_code: null,
    deferred: false,
  });

  writeFileSync(logFile, `${line1}\n${line2}\n`, "utf8");

  const events = await loadBootstrapTelemetry({ home: tempDir });

  assert.equal(events.length, 2);
  assert.equal(events[0].type, "bootstrap_phase");
  assert.equal(events[0].metadata.phase, "resolve_provider");
  assert.equal(events[0].metadata.result, "ok");
  assert.equal(events[1].metadata.phase, "acquire_remote_bundle");
  assert.equal(events[1].metadata.duration_ms, 386);

  rmSync(tempDir, { recursive: true, force: true });
});

test("loadBootstrapTelemetry: reads error phase events", async () => {
  const tempDir = createTempDir();
  const logsDir = join(tempDir, ".ai-config-os", "logs");
  mkdirSync(logsDir, { recursive: true });

  const logFile = join(logsDir, "bootstrap-claude.jsonl");
  const errorEvent = JSON.stringify({
    phase: "worker_package_fetch",
    provider: "claude",
    duration_ms: 250,
    result: "error",
    error_code: "WORKER_PACKAGE_NOT_PUBLISHED",
    deferred: false,
  });

  writeFileSync(logFile, `${errorEvent}\n`, "utf8");

  const events = await loadBootstrapTelemetry({ home: tempDir });

  assert.equal(events.length, 1);
  assert.equal(events[0].metadata.result, "error");
  assert.equal(events[0].metadata.error_code, "WORKER_PACKAGE_NOT_PUBLISHED");

  rmSync(tempDir, { recursive: true, force: true });
});

test("loadBootstrapTelemetry: skips malformed JSON lines", async () => {
  const tempDir = createTempDir();
  const logsDir = join(tempDir, ".ai-config-os", "logs");
  mkdirSync(logsDir, { recursive: true });

  const logFile = join(logsDir, "bootstrap-claude.jsonl");
  const validLine = JSON.stringify({
    phase: "resolve_provider",
    provider: "claude",
    duration_ms: 0,
    result: "ok",
    error_code: null,
    deferred: false,
  });

  writeFileSync(
    logFile,
    `${validLine}\n{not valid json\n${validLine}\n`,
    "utf8",
  );

  const events = await loadBootstrapTelemetry({ home: tempDir });

  assert.equal(
    events.length,
    2,
    "should skip malformed line and load valid ones",
  );

  rmSync(tempDir, { recursive: true, force: true });
});

test("loadBootstrapTelemetry: reads from multiple provider files", async () => {
  const tempDir = createTempDir();
  const logsDir = join(tempDir, ".ai-config-os", "logs");
  mkdirSync(logsDir, { recursive: true });

  const claudeFile = join(logsDir, "bootstrap-claude.jsonl");
  const cursorFile = join(logsDir, "bootstrap-cursor.jsonl");

  const claudeEvent = JSON.stringify({
    phase: "resolve_provider",
    provider: "claude",
    duration_ms: 5,
    result: "ok",
    error_code: null,
    deferred: false,
  });

  const cursorEvent = JSON.stringify({
    phase: "resolve_provider",
    provider: "cursor",
    duration_ms: 3,
    result: "ok",
    error_code: null,
    deferred: false,
  });

  writeFileSync(claudeFile, `${claudeEvent}\n`, "utf8");
  writeFileSync(cursorFile, `${cursorEvent}\n`, "utf8");

  const events = await loadBootstrapTelemetry({ home: tempDir });

  assert.equal(events.length, 2);
  assert.ok(events.some((e) => e.metadata.provider === "claude"));
  assert.ok(events.some((e) => e.metadata.provider === "cursor"));

  rmSync(tempDir, { recursive: true, force: true });
});

test("loadBootstrapTelemetry: creates unique event_id for each event", async () => {
  const tempDir = createTempDir();
  const logsDir = join(tempDir, ".ai-config-os", "logs");
  mkdirSync(logsDir, { recursive: true });

  const logFile = join(logsDir, "bootstrap-claude.jsonl");
  const line1 = JSON.stringify({
    phase: "resolve_provider",
    provider: "claude",
    duration_ms: 0,
    result: "ok",
    error_code: null,
    deferred: false,
  });
  const line2 = JSON.stringify({
    phase: "acquire_remote_bundle",
    provider: "claude",
    duration_ms: 386,
    result: "ok",
    error_code: null,
    deferred: false,
  });

  writeFileSync(logFile, `${line1}\n${line2}\n`, "utf8");

  const events = await loadBootstrapTelemetry({ home: tempDir });

  assert.notEqual(
    events[0].event_id,
    events[1].event_id,
    "event IDs should be unique",
  );

  rmSync(tempDir, { recursive: true, force: true });
});
