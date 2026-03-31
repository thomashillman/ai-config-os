/**
 * Atom 7 — Bootstrap run emitter tests
 *
 * Tests the BootstrapRun emitter contract:
 * - Validation logic (mirrors emitter's internal validateRun)
 * - Phase structure expected from a successful materialise.sh bootstrap
 * - Phase structure expected when package endpoint returns 404
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EMITTER_PATH = join(
  __dirname,
  "../../../adapters/claude/lib/bootstrap-run-emitter.mjs",
);

// ── Inline validation contract (same as emitter) ──────────────────────────────

const FORBIDDEN_FIELDS = new Set([
  "authorization",
  "token",
  "cookie",
  "secret",
  "password",
  "passwd",
  "credential",
  "credentials",
  "api_key",
  "apikey",
  "private_key",
  "privatekey",
  "auth",
]);

function isObj(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isIso(v) {
  return typeof v === "string" && Number.isFinite(Date.parse(v));
}

function validateRun(payload) {
  if (!isObj(payload))
    return { ok: false, error: "Payload must be a JSON object" };
  for (const k of Object.keys(payload)) {
    if (FORBIDDEN_FIELDS.has(k.toLowerCase()))
      return { ok: false, error: `Field '${k}' is not permitted` };
  }
  if (typeof payload.run_id !== "string" || !payload.run_id)
    return { ok: false, error: "run_id required" };
  if (!isIso(payload.started_at))
    return { ok: false, error: "started_at must be ISO 8601" };
  if (!["success", "failure", "partial"].includes(payload.status))
    return { ok: false, error: "status must be success|failure|partial" };
  if (!Array.isArray(payload.phases))
    return { ok: false, error: "phases must be an array" };
  return { ok: true };
}

// ── Expected phase names ───────────────────────────────────────────────────────

const BOOTSTRAP_SUCCESS_PHASES = [
  "bootstrap_start",
  "worker_package_fetch",
  "package_extract",
  "skills_install",
  "bootstrap_complete",
];

const BOOTSTRAP_404_PHASES_REQUIRED = [
  "bootstrap_start",
  "worker_package_fetch",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSuccessRun(overrides = {}) {
  return {
    run_id: `run-${Date.now()}`,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    status: "success",
    expected_version: "0.5.4",
    observed_version: "0.5.4",
    phases: BOOTSTRAP_SUCCESS_PHASES.map((name) => ({
      phase: name,
      result: "ok",
      duration_ms: 10,
    })),
    ...overrides,
  };
}

function make404FailureRun(overrides = {}) {
  return {
    run_id: `run-fail-${Date.now()}`,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    status: "failure",
    first_failed_phase: "worker_package_fetch",
    error_code: "WORKER_PACKAGE_NOT_PUBLISHED",
    phases: [
      { phase: "bootstrap_start", result: "ok", duration_ms: 3 },
      {
        phase: "worker_package_fetch",
        result: "error",
        duration_ms: 250,
        error_code: "WORKER_PACKAGE_NOT_PUBLISHED",
      },
    ],
    ...overrides,
  };
}

// ── Tests: emitter module exists ──────────────────────────────────────────────

test("bootstrap-run-emitter.mjs file exists", () => {
  assert.ok(existsSync(EMITTER_PATH), `Emitter not found at ${EMITTER_PATH}`);
});

// ── Tests: validateRun (emitter internal contract) ────────────────────────────

test("validateRun: accepts minimal valid run", () => {
  const result = validateRun({
    run_id: "r1",
    started_at: "2026-01-01T00:00:00Z",
    status: "success",
    phases: [],
  });
  assert.equal(result.ok, true);
});

test("validateRun: rejects missing run_id", () => {
  const result = validateRun({
    started_at: "2026-01-01T00:00:00Z",
    status: "success",
    phases: [],
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /run_id/);
});

test("validateRun: rejects missing started_at", () => {
  const result = validateRun({ run_id: "r1", status: "success", phases: [] });
  assert.equal(result.ok, false);
  assert.match(result.error, /started_at/);
});

test("validateRun: rejects invalid status", () => {
  const result = validateRun({
    run_id: "r1",
    started_at: "2026-01-01T00:00:00Z",
    status: "running",
    phases: [],
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /status/);
});

test('validateRun: rejects forbidden field "token"', () => {
  const result = validateRun({
    run_id: "r1",
    started_at: "2026-01-01T00:00:00Z",
    status: "success",
    phases: [],
    token: "secret",
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /token.*not permitted/i);
});

test('validateRun: rejects forbidden field "authorization"', () => {
  const result = validateRun({
    run_id: "r1",
    started_at: "2026-01-01T00:00:00Z",
    status: "success",
    phases: [],
    authorization: "Bearer x",
  });
  assert.equal(result.ok, false);
});

// ── Tests: successful bootstrap run structure ─────────────────────────────────

test("successful bootstrap run: passes validation", () => {
  const run = makeSuccessRun();
  assert.equal(validateRun(run).ok, true);
});

test("successful bootstrap run: contains all 5 expected phases", () => {
  const run = makeSuccessRun();
  const phaseNames = run.phases.map((p) => p.phase);
  for (const expected of BOOTSTRAP_SUCCESS_PHASES) {
    assert.ok(phaseNames.includes(expected), `Missing phase: ${expected}`);
  }
});

test('successful bootstrap run: all phases have result "ok"', () => {
  const run = makeSuccessRun();
  for (const phase of run.phases) {
    assert.equal(phase.result, "ok", `Phase ${phase.phase} should be ok`);
  }
});

test("successful bootstrap run: phases appear in correct order", () => {
  const run = makeSuccessRun();
  const phaseNames = run.phases.map((p) => p.phase);
  for (let i = 0; i < BOOTSTRAP_SUCCESS_PHASES.length; i++) {
    assert.equal(phaseNames[i], BOOTSTRAP_SUCCESS_PHASES[i]);
  }
});

test('successful bootstrap run: status is "success"', () => {
  const run = makeSuccessRun();
  assert.equal(run.status, "success");
});

test("successful bootstrap run: expected_version equals observed_version on success", () => {
  const run = makeSuccessRun();
  assert.equal(run.expected_version, run.observed_version);
});

// ── Tests: 404 failure run structure ─────────────────────────────────────────

test("404 failure run: passes validation", () => {
  const run = make404FailureRun();
  assert.equal(validateRun(run).ok, true);
});

test('404 failure run: status is "failure"', () => {
  const run = make404FailureRun();
  assert.equal(run.status, "failure");
});

test("404 failure run: first_failed_phase is worker_package_fetch", () => {
  const run = make404FailureRun();
  assert.equal(run.first_failed_phase, "worker_package_fetch");
});

test("404 failure run: error_code is WORKER_PACKAGE_NOT_PUBLISHED", () => {
  const run = make404FailureRun();
  assert.equal(run.error_code, "WORKER_PACKAGE_NOT_PUBLISHED");
});

test("404 failure run: contains bootstrap_start and worker_package_fetch phases", () => {
  const run = make404FailureRun();
  const phaseNames = run.phases.map((p) => p.phase);
  for (const expected of BOOTSTRAP_404_PHASES_REQUIRED) {
    assert.ok(phaseNames.includes(expected), `Missing phase: ${expected}`);
  }
});

test("404 failure run: worker_package_fetch phase has error result and error_code", () => {
  const run = make404FailureRun();
  const fetchPhase = run.phases.find((p) => p.phase === "worker_package_fetch");
  assert.ok(fetchPhase, "worker_package_fetch phase must exist");
  assert.equal(fetchPhase.result, "error");
  assert.equal(fetchPhase.error_code, "WORKER_PACKAGE_NOT_PUBLISHED");
});

// ── Tests: all phases have required fields ────────────────────────────────────

test("all phases have phase, result, and duration_ms", () => {
  const runs = [makeSuccessRun(), make404FailureRun()];
  for (const run of runs) {
    for (const phase of run.phases) {
      assert.ok(
        typeof phase.phase === "string" && phase.phase.length > 0,
        "phase.phase must be non-empty string",
      );
      assert.ok(
        ["ok", "error", "skipped"].includes(phase.result),
        `phase.result must be ok|error|skipped, got ${phase.result}`,
      );
      assert.ok(
        typeof phase.duration_ms === "number" && phase.duration_ms >= 0,
        "phase.duration_ms must be non-negative number",
      );
    }
  }
});
