/**
 * Bootstrap Run Ledger — schema and validation (V1)
 *
 * One BootstrapRun record is created per bootstrap attempt.
 * Fields are intentionally narrow; secrets are never accepted.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type PhaseResult = "ok" | "error" | "skipped";

export interface BootstrapPhase {
  phase: string;
  result: PhaseResult;
  duration_ms: number;
  error_code?: string;
}

export interface BootstrapRun {
  run_id: string;
  started_at: string;
  finished_at?: string;
  status: "success" | "failure" | "partial";
  project_dir?: string;
  install_root?: string;
  repo_revision?: string;
  expected_version?: string;
  observed_version?: string;
  first_failed_phase?: string;
  error_code?: string;
  phases: BootstrapPhase[];
  evidence_refs?: string[];
}

// ── Deny-list: field names that must never appear in a run record ─────────────

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

// Maximum safe length for free-text string fields
const MAX_MESSAGE_LENGTH = 2048;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isIsoDateTime(v: unknown): v is string {
  return typeof v === "string" && Number.isFinite(Date.parse(v));
}

function hasForbiddenField(obj: Record<string, unknown>): string | null {
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_FIELD_NAMES.has(key.toLowerCase())) {
      return key;
    }
  }
  return null;
}

function validatePhase(
  p: unknown,
): { ok: true; value: BootstrapPhase } | { ok: false; error: string } {
  if (!isObject(p)) return { ok: false, error: "Each phase must be an object" };

  if (typeof p.phase !== "string" || p.phase.length === 0) {
    return {
      ok: false,
      error: "Phase field 'phase' must be a non-empty string",
    };
  }
  if (p.phase.length > 128) {
    return { ok: false, error: "Phase field 'phase' exceeds 128 characters" };
  }

  const VALID_RESULTS: PhaseResult[] = ["ok", "error", "skipped"];
  if (!VALID_RESULTS.includes(p.result as PhaseResult)) {
    return {
      ok: false,
      error: `Phase field 'result' must be one of: ${VALID_RESULTS.join(", ")}`,
    };
  }

  if (typeof p.duration_ms !== "number" || p.duration_ms < 0) {
    return {
      ok: false,
      error: "Phase field 'duration_ms' must be a non-negative number",
    };
  }

  if (p.error_code !== undefined) {
    if (
      typeof p.error_code !== "string" ||
      p.error_code.length > MAX_MESSAGE_LENGTH
    ) {
      return {
        ok: false,
        error: "Phase field 'error_code' must be a string within length limit",
      };
    }
  }

  return {
    ok: true,
    value: {
      phase: p.phase,
      result: p.result as PhaseResult,
      duration_ms: p.duration_ms,
      ...(p.error_code !== undefined
        ? { error_code: p.error_code as string }
        : {}),
    },
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export type ValidationResult =
  | { ok: true; value: BootstrapRun }
  | { ok: false; error: string };

/**
 * Validate an untrusted payload as a BootstrapRun.
 * Rejects missing required fields, invalid types, overlong messages,
 * and any field whose name matches the secrets deny-list.
 */
export function validateBootstrapRun(payload: unknown): ValidationResult {
  if (!isObject(payload)) {
    return { ok: false, error: "Payload must be a JSON object" };
  }

  // Check for forbidden field names at top level
  const forbidden = hasForbiddenField(payload);
  if (forbidden !== null) {
    return {
      ok: false,
      error: `Field '${forbidden}' is not permitted in a run record`,
    };
  }

  // Required: run_id
  if (typeof payload.run_id !== "string" || payload.run_id.length === 0) {
    return { ok: false, error: "Field 'run_id' must be a non-empty string" };
  }
  if (payload.run_id.length > 128) {
    return { ok: false, error: "Field 'run_id' exceeds 128 characters" };
  }

  // Required: started_at
  if (!isIsoDateTime(payload.started_at)) {
    return {
      ok: false,
      error: "Field 'started_at' must be a valid ISO 8601 timestamp",
    };
  }

  // Optional: finished_at
  if (
    payload.finished_at !== undefined &&
    !isIsoDateTime(payload.finished_at)
  ) {
    return {
      ok: false,
      error: "Field 'finished_at' must be a valid ISO 8601 timestamp",
    };
  }

  // Required: status
  const VALID_STATUSES = ["success", "failure", "partial"];
  if (!VALID_STATUSES.includes(payload.status as string)) {
    return {
      ok: false,
      error: `Field 'status' must be one of: ${VALID_STATUSES.join(", ")}`,
    };
  }

  // Optional string fields with length limits
  const optionalStrings: Array<keyof BootstrapRun> = [
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
      if (typeof v !== "string") {
        return { ok: false, error: `Field '${field}' must be a string` };
      }
      if (v.length > MAX_MESSAGE_LENGTH) {
        return {
          ok: false,
          error: `Field '${field}' exceeds ${MAX_MESSAGE_LENGTH} characters`,
        };
      }
    }
  }

  // Required: phases array
  if (!Array.isArray(payload.phases)) {
    return { ok: false, error: "Field 'phases' must be an array" };
  }

  const phases: BootstrapPhase[] = [];
  for (let i = 0; i < payload.phases.length; i++) {
    const result = validatePhase(payload.phases[i]);
    if (!result.ok) {
      return { ok: false, error: `phases[${i}]: ${result.error}` };
    }
    phases.push(result.value);
  }

  // Optional: evidence_refs
  if (payload.evidence_refs !== undefined) {
    if (!Array.isArray(payload.evidence_refs)) {
      return { ok: false, error: "Field 'evidence_refs' must be an array" };
    }
    for (let i = 0; i < payload.evidence_refs.length; i++) {
      if (typeof payload.evidence_refs[i] !== "string") {
        return { ok: false, error: `evidence_refs[${i}] must be a string` };
      }
    }
  }

  const run: BootstrapRun = {
    run_id: payload.run_id,
    started_at: payload.started_at as string,
    status: payload.status as BootstrapRun["status"],
    phases,
  };

  // Assign optional fields only when present
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
    run.evidence_refs = payload.evidence_refs as string[];

  return { ok: true, value: run };
}
