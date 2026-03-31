/**
 * Bootstrap Run Ledger — storage helpers (V1)
 *
 * Storage layout:
 *   KV  observability:latest-run               → run_id of most recent run
 *   KV  observability:run:<run_id>:meta        → lightweight summary (no raw evidence)
 *   KV  observability:runs:index               → JSON array of recent run_ids (newest first)
 *   R2  observability/runs/<run_id>/summary.json → full run summary
 *
 * The KV meta key enables fast list operations without scanning R2.
 * R2 holds the canonical full record; KV is the index.
 */

import type { BootstrapRun } from "./schema";
import { sanitizeRecord } from "./sanitize";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Lightweight summary stored in KV for list operations. */
export interface RunSummary {
  run_id: string;
  started_at: string;
  finished_at?: string;
  status: BootstrapRun["status"];
  first_failed_phase?: string;
  error_code?: string;
  expected_version?: string;
  observed_version?: string;
  phase_count: number;
}

/** Result of a successful write. */
export interface WriteRunResult {
  run_id: string;
  summary_key: string;
  kv_meta_key: string;
}

// ── Path helpers ──────────────────────────────────────────────────────────────

export function runSummaryR2Key(runId: string): string {
  return `observability/runs/${runId}/summary.json`;
}

export function runMetaKvKey(runId: string): string {
  return `observability:run:${runId}:meta`;
}

export const LATEST_RUN_KV_KEY = "observability:latest-run";
export const RUNS_INDEX_KV_KEY = "observability:runs:index";

/** Maximum number of run IDs to retain in the lightweight KV index. */
const MAX_INDEX_SIZE = 100;

// ── Summary builder ───────────────────────────────────────────────────────────

export function buildRunSummary(run: BootstrapRun): RunSummary {
  const summary: RunSummary = {
    run_id: run.run_id,
    started_at: run.started_at,
    status: run.status,
    phase_count: run.phases.length,
  };
  if (run.finished_at) summary.finished_at = run.finished_at;
  if (run.first_failed_phase)
    summary.first_failed_phase = run.first_failed_phase;
  if (run.error_code) summary.error_code = run.error_code;
  if (run.expected_version) summary.expected_version = run.expected_version;
  if (run.observed_version) summary.observed_version = run.observed_version;
  return summary;
}

// ── KV/R2 type aliases ────────────────────────────────────────────────────────

type KvStore = {
  get(key: string): Promise<string | null> | string | null;
  put(key: string, value: string): Promise<void>;
};

type R2Bucket = {
  put(key: string, value: string): Promise<void>;
  get(
    key: string,
  ):
    | Promise<{ text(): Promise<string> } | null>
    | { text(): Promise<string> }
    | null;
};

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Persist a validated BootstrapRun.
 *
 * - Sanitizes all string fields before storage (OWASP Logging CS)
 * - Writes full summary to R2
 * - Writes lightweight meta to KV
 * - Updates the latest-run pointer and runs index in KV
 */
export async function writeBootstrapRun(
  run: BootstrapRun,
  kv: KvStore,
  r2: R2Bucket,
): Promise<WriteRunResult> {
  // Sanitize before any storage
  const sanitized = sanitizeRecord(run) as BootstrapRun;

  const summary = buildRunSummary(sanitized);
  const summaryKey = runSummaryR2Key(sanitized.run_id);
  const metaKey = runMetaKvKey(sanitized.run_id);

  // Write full record to R2
  await r2.put(summaryKey, JSON.stringify(sanitized, null, 2));

  // Write lightweight summary to KV
  await kv.put(metaKey, JSON.stringify(summary));

  // Update latest-run pointer
  await kv.put(LATEST_RUN_KV_KEY, sanitized.run_id);

  // Update runs index (prepend new run_id, cap at MAX_INDEX_SIZE)
  await updateRunsIndex(kv, sanitized.run_id);

  return {
    run_id: sanitized.run_id,
    summary_key: summaryKey,
    kv_meta_key: metaKey,
  };
}

async function updateRunsIndex(kv: KvStore, runId: string): Promise<void> {
  const raw = await kv.get(RUNS_INDEX_KV_KEY);
  let index: string[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) index = parsed;
    } catch {
      index = [];
    }
  }
  // Prepend; deduplicate; cap
  index = [runId, ...index.filter((id) => id !== runId)].slice(
    0,
    MAX_INDEX_SIZE,
  );
  await kv.put(RUNS_INDEX_KV_KEY, JSON.stringify(index));
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * List recent run summaries from KV (newest first, payloads from KV meta).
 * Does NOT fetch raw R2 blobs.
 *
 * @param limit  Maximum number of summaries to return (1–100). Default: 20.
 */
export async function listBootstrapRuns(
  kv: KvStore,
  limit = 20,
): Promise<RunSummary[]> {
  const safeLimit = Math.max(1, Math.min(limit, MAX_INDEX_SIZE));

  const raw = await kv.get(RUNS_INDEX_KV_KEY);
  if (!raw) return [];

  let index: string[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    index = parsed;
  } catch {
    return [];
  }

  const runIds = index.slice(0, safeLimit);

  const summaries: RunSummary[] = [];
  for (const runId of runIds) {
    const meta = await kv.get(runMetaKvKey(runId));
    if (!meta) continue;
    try {
      const parsed = JSON.parse(meta);
      summaries.push(parsed as RunSummary);
    } catch {
      // Skip corrupt entries
    }
  }

  return summaries;
}

/**
 * Read the full run record for a specific run_id from R2.
 * Returns null if not found.
 */
export async function getBootstrapRun(
  runId: string,
  r2: R2Bucket,
): Promise<BootstrapRun | null> {
  const key = runSummaryR2Key(runId);
  const obj = await r2.get(key);
  if (!obj) return null;
  try {
    const text = await obj.text();
    return JSON.parse(text) as BootstrapRun;
  } catch {
    return null;
  }
}

/**
 * Read the latest run summary from KV.
 * Returns null if no runs have been recorded.
 */
export async function getLatestRunSummary(
  kv: KvStore,
): Promise<RunSummary | null> {
  const runId = await kv.get(LATEST_RUN_KV_KEY);
  if (!runId) return null;
  const meta = await kv.get(runMetaKvKey(runId));
  if (!meta) return null;
  try {
    return JSON.parse(meta) as RunSummary;
  } catch {
    return null;
  }
}
