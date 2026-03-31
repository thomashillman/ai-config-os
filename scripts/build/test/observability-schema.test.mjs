/**
 * Atom 1 — Bootstrap Run schema validation tests
 *
 * Tests the validateBootstrapRun() contract inline (plain JS copy of the logic)
 * so they run without TypeScript compilation in the existing test runner.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

// ── Inline implementation (mirrors worker/src/observability/schema.ts) ─────────

const FORBIDDEN_FIELD_NAMES = new Set([
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
const MAX_MESSAGE_LENGTH = 2048;

function isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isIsoDateTime(v) {
  return typeof v === "string" && Number.isFinite(Date.parse(v));
}
function hasForbiddenField(obj) {
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_FIELD_NAMES.has(key.toLowerCase())) return key;
  }
  return null;
}
function validatePhase(p) {
  if (!isObject(p)) return { ok: false, error: "Each phase must be an object" };
  if (typeof p.phase !== "string" || p.phase.length === 0)
    return {
      ok: false,
      error: "Phase field 'phase' must be a non-empty string",
    };
  if (p.phase.length > 128)
    return { ok: false, error: "Phase field 'phase' exceeds 128 characters" };
  const VALID_RESULTS = ["ok", "error", "skipped"];
  if (!VALID_RESULTS.includes(p.result))
    return {
      ok: false,
      error: `Phase field 'result' must be one of: ${VALID_RESULTS.join(", ")}`,
    };
  if (typeof p.duration_ms !== "number" || p.duration_ms < 0)
    return {
      ok: false,
      error: "Phase field 'duration_ms' must be a non-negative number",
    };
  if (p.error_code !== undefined) {
    if (
      typeof p.error_code !== "string" ||
      p.error_code.length > MAX_MESSAGE_LENGTH
    )
      return {
        ok: false,
        error: "Phase field 'error_code' must be a string within length limit",
      };
  }
  return {
    ok: true,
    value: {
      phase: p.phase,
      result: p.result,
      duration_ms: p.duration_ms,
      ...(p.error_code !== undefined ? { error_code: p.error_code } : {}),
    },
  };
}
function validateBootstrapRun(payload) {
  if (!isObject(payload))
    return { ok: false, error: "Payload must be a JSON object" };
  const forbidden = hasForbiddenField(payload);
  if (forbidden !== null)
    return {
      ok: false,
      error: `Field '${forbidden}' is not permitted in a run record`,
    };
  if (typeof payload.run_id !== "string" || payload.run_id.length === 0)
    return { ok: false, error: "Field 'run_id' must be a non-empty string" };
  if (payload.run_id.length > 128)
    return { ok: false, error: "Field 'run_id' exceeds 128 characters" };
  if (!isIsoDateTime(payload.started_at))
    return {
      ok: false,
      error: "Field 'started_at' must be a valid ISO 8601 timestamp",
    };
  if (payload.finished_at !== undefined && !isIsoDateTime(payload.finished_at))
    return {
      ok: false,
      error: "Field 'finished_at' must be a valid ISO 8601 timestamp",
    };
  const VALID_STATUSES = ["success", "failure", "partial"];
  if (!VALID_STATUSES.includes(payload.status))
    return {
      ok: false,
      error: `Field 'status' must be one of: ${VALID_STATUSES.join(", ")}`,
    };
  const optionalStrings = [
    "project_dir",
    "install_root",
    "repo_revision",
    "expected_version",
    "observed_version",
    "first_failed_phase",
    "error_code",
  ];
  for (const field of optionalStrings) {
    const v = payload[field];
    if (v !== undefined) {
      if (typeof v !== "string")
        return { ok: false, error: `Field '${field}' must be a string` };
      if (v.length > MAX_MESSAGE_LENGTH)
        return {
          ok: false,
          error: `Field '${field}' exceeds ${MAX_MESSAGE_LENGTH} characters`,
        };
    }
  }
  if (!Array.isArray(payload.phases))
    return { ok: false, error: "Field 'phases' must be an array" };
  const phases = [];
  for (let i = 0; i < payload.phases.length; i++) {
    const result = validatePhase(payload.phases[i]);
    if (!result.ok)
      return { ok: false, error: `phases[${i}]: ${result.error}` };
    phases.push(result.value);
  }
  if (payload.evidence_refs !== undefined) {
    if (!Array.isArray(payload.evidence_refs))
      return { ok: false, error: "Field 'evidence_refs' must be an array" };
    for (let i = 0; i < payload.evidence_refs.length; i++) {
      if (typeof payload.evidence_refs[i] !== "string")
        return { ok: false, error: `evidence_refs[${i}] must be a string` };
    }
  }
  const run = {
    run_id: payload.run_id,
    started_at: payload.started_at,
    status: payload.status,
    phases,
  };
  if (typeof payload.finished_at === "string")
    run.finished_at = payload.finished_at;
  if (typeof payload.project_dir === "string")
    run.project_dir = payload.project_dir;
  if (typeof payload.install_root === "string")
    run.install_root = payload.install_root;
  if (typeof payload.repo_revision === "string")
    run.repo_revision = payload.repo_revision;
  if (typeof payload.expected_version === "string")
    run.expected_version = payload.expected_version;
  if (typeof payload.observed_version === "string")
    run.observed_version = payload.observed_version;
  if (typeof payload.first_failed_phase === "string")
    run.first_failed_phase = payload.first_failed_phase;
  if (typeof payload.error_code === "string")
    run.error_code = payload.error_code;
  if (Array.isArray(payload.evidence_refs))
    run.evidence_refs = payload.evidence_refs;
  return { ok: true, value: run };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_RUN = {
  run_id: "run-abc123",
  started_at: "2026-03-21T10:00:00.000Z",
  finished_at: "2026-03-21T10:00:03.000Z",
  status: "success",
  phases: [
    { phase: "bootstrap_start", result: "ok", duration_ms: 5 },
    { phase: "worker_package_fetch", result: "ok", duration_ms: 312 },
    { phase: "package_extract", result: "ok", duration_ms: 88 },
    { phase: "skills_install", result: "ok", duration_ms: 44 },
    { phase: "bootstrap_complete", result: "ok", duration_ms: 1 },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

test("validateBootstrapRun: accepts minimal valid run", () => {
  const result = validateBootstrapRun({
    run_id: "r1",
    started_at: "2026-01-01T00:00:00Z",
    status: "success",
    phases: [],
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.run_id, "r1");
  assert.equal(result.value.status, "success");
});

test("validateBootstrapRun: accepts full valid run fixture", () => {
  const result = validateBootstrapRun(VALID_RUN);
  assert.equal(result.ok, true);
  assert.equal(result.value.phases.length, 5);
  assert.equal(result.value.finished_at, "2026-03-21T10:00:03.000Z");
});

test("validateBootstrapRun: rejects non-object payload", () => {
  assert.equal(validateBootstrapRun(null).ok, false);
  assert.equal(validateBootstrapRun("string").ok, false);
  assert.equal(validateBootstrapRun(42).ok, false);
  assert.equal(validateBootstrapRun([]).ok, false);
});

test("validateBootstrapRun: rejects missing run_id", () => {
  const { run_id: _, ...rest } = VALID_RUN;
  const result = validateBootstrapRun(rest);
  assert.equal(result.ok, false);
  assert.match(result.error, /run_id/);
});

test("validateBootstrapRun: rejects empty run_id", () => {
  const result = validateBootstrapRun({ ...VALID_RUN, run_id: "" });
  assert.equal(result.ok, false);
  assert.match(result.error, /run_id/);
});

test("validateBootstrapRun: rejects run_id over 128 chars", () => {
  const result = validateBootstrapRun({
    ...VALID_RUN,
    run_id: "x".repeat(129),
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /run_id/);
});

test("validateBootstrapRun: rejects invalid started_at", () => {
  const result = validateBootstrapRun({
    ...VALID_RUN,
    started_at: "not-a-date",
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /started_at/);
});

test("validateBootstrapRun: rejects invalid finished_at", () => {
  const result = validateBootstrapRun({
    ...VALID_RUN,
    finished_at: "bad-date",
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /finished_at/);
});

test("validateBootstrapRun: rejects invalid status", () => {
  const result = validateBootstrapRun({ ...VALID_RUN, status: "running" });
  assert.equal(result.ok, false);
  assert.match(result.error, /status/);
});

test("validateBootstrapRun: rejects phases that is not an array", () => {
  const result = validateBootstrapRun({ ...VALID_RUN, phases: "bad" });
  assert.equal(result.ok, false);
  assert.match(result.error, /phases/);
});

test("validateBootstrapRun: rejects phase with invalid result", () => {
  const result = validateBootstrapRun({
    ...VALID_RUN,
    phases: [{ phase: "x", result: "bad", duration_ms: 10 }],
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /result/);
});

test("validateBootstrapRun: rejects phase with negative duration_ms", () => {
  const result = validateBootstrapRun({
    ...VALID_RUN,
    phases: [{ phase: "x", result: "ok", duration_ms: -1 }],
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /duration_ms/);
});

test('validateBootstrapRun: rejects forbidden field "token"', () => {
  const result = validateBootstrapRun({ ...VALID_RUN, token: "secret-value" });
  assert.equal(result.ok, false);
  assert.match(result.error, /token.*not permitted/i);
});

test('validateBootstrapRun: rejects forbidden field "authorization"', () => {
  const result = validateBootstrapRun({
    ...VALID_RUN,
    authorization: "Bearer xyz",
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /authorization.*not permitted/i);
});

test('validateBootstrapRun: rejects forbidden field "cookie"', () => {
  const result = validateBootstrapRun({ ...VALID_RUN, cookie: "session=abc" });
  assert.equal(result.ok, false);
  assert.match(result.error, /cookie.*not permitted/i);
});

test('validateBootstrapRun: rejects forbidden field "secret"', () => {
  const result = validateBootstrapRun({ ...VALID_RUN, secret: "shh" });
  assert.equal(result.ok, false);
  assert.match(result.error, /secret.*not permitted/i);
});

test("validateBootstrapRun: rejects overlong string fields", () => {
  const longStr = "x".repeat(MAX_MESSAGE_LENGTH + 1);
  for (const field of [
    "project_dir",
    "install_root",
    "repo_revision",
    "expected_version",
    "observed_version",
    "first_failed_phase",
    "error_code",
  ]) {
    const result = validateBootstrapRun({ ...VALID_RUN, [field]: longStr });
    assert.equal(
      result.ok,
      false,
      `Field '${field}' should be rejected when too long`,
    );
    assert.match(result.error, new RegExp(field));
  }
});

test("validateBootstrapRun: preserves all valid optional fields", () => {
  const run = {
    ...VALID_RUN,
    project_dir: "/home/user/project",
    install_root: "/home/user/.claude",
    repo_revision: "abc123def",
    expected_version: "0.5.4",
    observed_version: "0.5.4",
    first_failed_phase: undefined,
    error_code: undefined,
    evidence_refs: ["runs/r1/evidence.json"],
  };
  const result = validateBootstrapRun(run);
  assert.equal(result.ok, true);
  assert.equal(result.value.project_dir, "/home/user/project");
  assert.equal(result.value.expected_version, "0.5.4");
  assert.deepEqual(result.value.evidence_refs, ["runs/r1/evidence.json"]);
});

test("validateBootstrapRun: rejects evidence_refs with non-string entries", () => {
  const result = validateBootstrapRun({ ...VALID_RUN, evidence_refs: [42] });
  assert.equal(result.ok, false);
  assert.match(result.error, /evidence_refs/);
});

test("validateBootstrapRun: phase with error_code is preserved", () => {
  const result = validateBootstrapRun({
    ...VALID_RUN,
    phases: [
      {
        phase: "worker_package_fetch",
        result: "error",
        duration_ms: 100,
        error_code: "WORKER_PACKAGE_NOT_PUBLISHED",
      },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(
    result.value.phases[0].error_code,
    "WORKER_PACKAGE_NOT_PUBLISHED",
  );
});
