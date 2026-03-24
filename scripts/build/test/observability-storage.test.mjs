/**
 * Atoms 4 & 5 — writeBootstrapRun(), listBootstrapRuns(), getBootstrapRun() tests
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Inline implementations (mirrors worker/src/observability/storage.ts) ──────

function sanitizeLogField(value) {
  if (typeof value !== 'string') return value;
  let result = value.replace(/[\r\n\t]/g, ' ');
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  result = result.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\uFFF9-\uFFFB]/g, '');
  return result;
}
function sanitizeRecord(value) {
  if (typeof value === 'string') return sanitizeLogField(value);
  if (Array.isArray(value)) return value.map(sanitizeRecord);
  if (typeof value === 'object' && value !== null) {
    const result = {};
    for (const [k, v] of Object.entries(value)) result[k] = sanitizeRecord(v);
    return result;
  }
  return value;
}

function runSummaryR2Key(runId) { return `observability/runs/${runId}/summary.json`; }
function runMetaKvKey(runId) { return `observability:run:${runId}:meta`; }
const LATEST_RUN_KV_KEY = 'observability:latest-run';
const RUNS_INDEX_KV_KEY = 'observability:runs:index';
const MAX_INDEX_SIZE = 100;

function buildRunSummary(run) {
  const summary = { run_id: run.run_id, started_at: run.started_at, status: run.status, phase_count: run.phases.length };
  if (run.finished_at) summary.finished_at = run.finished_at;
  if (run.first_failed_phase) summary.first_failed_phase = run.first_failed_phase;
  if (run.error_code) summary.error_code = run.error_code;
  if (run.expected_version) summary.expected_version = run.expected_version;
  if (run.observed_version) summary.observed_version = run.observed_version;
  return summary;
}

async function updateRunsIndex(kv, runId) {
  const raw = await kv.get(RUNS_INDEX_KV_KEY);
  let index = [];
  if (raw) { try { const p = JSON.parse(raw); if (Array.isArray(p)) index = p; } catch {} }
  index = [runId, ...index.filter(id => id !== runId)].slice(0, MAX_INDEX_SIZE);
  await kv.put(RUNS_INDEX_KV_KEY, JSON.stringify(index));
}

async function writeBootstrapRun(run, kv, r2) {
  const sanitized = sanitizeRecord(run);
  const summary = buildRunSummary(sanitized);
  const summaryKey = runSummaryR2Key(sanitized.run_id);
  const metaKey = runMetaKvKey(sanitized.run_id);
  await r2.put(summaryKey, JSON.stringify(sanitized, null, 2));
  await kv.put(metaKey, JSON.stringify(summary));
  await kv.put(LATEST_RUN_KV_KEY, sanitized.run_id);
  await updateRunsIndex(kv, sanitized.run_id);
  return { run_id: sanitized.run_id, summary_key: summaryKey, kv_meta_key: metaKey };
}

async function listBootstrapRuns(kv, limit = 20) {
  const safeLimit = Math.max(1, Math.min(limit, MAX_INDEX_SIZE));
  const raw = await kv.get(RUNS_INDEX_KV_KEY);
  if (!raw) return [];
  let index;
  try { const p = JSON.parse(raw); if (!Array.isArray(p)) return []; index = p; } catch { return []; }
  const runIds = index.slice(0, safeLimit);
  const summaries = [];
  for (const runId of runIds) {
    const meta = await kv.get(runMetaKvKey(runId));
    if (!meta) continue;
    try { summaries.push(JSON.parse(meta)); } catch {}
  }
  return summaries;
}

async function getBootstrapRun(runId, r2) {
  const key = runSummaryR2Key(runId);
  const obj = await r2.get(key);
  if (!obj) return null;
  try { return JSON.parse(await obj.text()); } catch { return null; }
}

async function getLatestRunSummary(kv) {
  const runId = await kv.get(LATEST_RUN_KV_KEY);
  if (!runId) return null;
  const meta = await kv.get(runMetaKvKey(runId));
  if (!meta) return null;
  try { return JSON.parse(meta); } catch { return null; }
}

// ── Mock stores ───────────────────────────────────────────────────────────────

function makeKv() {
  const store = {};
  return { store, get: async k => store[k] ?? null, put: async (k, v) => { store[k] = v; } };
}

function makeR2() {
  const store = {};
  return {
    store,
    put: async (k, v) => { store[k] = v; },
    get: async k => {
      if (!(k in store)) return null;
      const val = store[k];
      return { text: async () => val };
    },
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRun(id = 'run-1', status = 'success', overrides = {}) {
  return {
    run_id: id,
    started_at: '2026-03-21T10:00:00.000Z',
    finished_at: '2026-03-21T10:00:03.000Z',
    status,
    expected_version: '0.5.4',
    observed_version: '0.5.4',
    phases: [
      { phase: 'bootstrap_start', result: 'ok', duration_ms: 5 },
      { phase: 'worker_package_fetch', result: 'ok', duration_ms: 312 },
      { phase: 'package_extract', result: 'ok', duration_ms: 88 },
      { phase: 'skills_install', result: 'ok', duration_ms: 44 },
      { phase: 'bootstrap_complete', result: 'ok', duration_ms: 1 },
    ],
    ...overrides,
  };
}

// ── Tests: path helpers ───────────────────────────────────────────────────────

test('runSummaryR2Key: produces correct path', () => {
  assert.equal(runSummaryR2Key('run-abc'), 'observability/runs/run-abc/summary.json');
});

test('runMetaKvKey: produces correct key', () => {
  assert.equal(runMetaKvKey('run-abc'), 'observability:run:run-abc:meta');
});

// ── Tests: buildRunSummary ────────────────────────────────────────────────────

test('buildRunSummary: includes required fields', () => {
  const run = makeRun();
  const summary = buildRunSummary(run);
  assert.equal(summary.run_id, 'run-1');
  assert.equal(summary.status, 'success');
  assert.equal(summary.phase_count, 5);
  assert.equal(summary.expected_version, '0.5.4');
});

test('buildRunSummary: omits undefined optional fields', () => {
  const run = makeRun('r', 'success', {});
  delete run.first_failed_phase;
  delete run.error_code;
  const summary = buildRunSummary(run);
  assert.equal('first_failed_phase' in summary, false);
  assert.equal('error_code' in summary, false);
});

test('buildRunSummary: includes first_failed_phase when present', () => {
  const run = makeRun('r', 'failure', { first_failed_phase: 'worker_package_fetch', error_code: 'WORKER_PACKAGE_NOT_PUBLISHED' });
  const summary = buildRunSummary(run);
  assert.equal(summary.first_failed_phase, 'worker_package_fetch');
  assert.equal(summary.error_code, 'WORKER_PACKAGE_NOT_PUBLISHED');
});

// ── Tests: writeBootstrapRun ──────────────────────────────────────────────────

test('writeBootstrapRun: writes summary to R2', async () => {
  const kv = makeKv(); const r2 = makeR2();
  await writeBootstrapRun(makeRun('run-1'), kv, r2);
  const key = runSummaryR2Key('run-1');
  assert.ok(key in r2.store, 'R2 should contain summary');
  const stored = JSON.parse(r2.store[key]);
  assert.equal(stored.run_id, 'run-1');
  assert.equal(stored.status, 'success');
});

test('writeBootstrapRun: writes KV meta entry', async () => {
  const kv = makeKv(); const r2 = makeR2();
  await writeBootstrapRun(makeRun('run-2'), kv, r2);
  const meta = JSON.parse(kv.store[runMetaKvKey('run-2')]);
  assert.equal(meta.run_id, 'run-2');
  assert.equal(meta.phase_count, 5);
});

test('writeBootstrapRun: updates latest-run pointer', async () => {
  const kv = makeKv(); const r2 = makeR2();
  await writeBootstrapRun(makeRun('run-A'), kv, r2);
  await writeBootstrapRun(makeRun('run-B'), kv, r2);
  assert.equal(kv.store[LATEST_RUN_KV_KEY], 'run-B');
});

test('writeBootstrapRun: updates runs index (newest first)', async () => {
  const kv = makeKv(); const r2 = makeR2();
  await writeBootstrapRun(makeRun('run-X'), kv, r2);
  await writeBootstrapRun(makeRun('run-Y'), kv, r2);
  const index = JSON.parse(kv.store[RUNS_INDEX_KV_KEY]);
  assert.equal(index[0], 'run-Y');
  assert.equal(index[1], 'run-X');
});

test('writeBootstrapRun: returns run_id, summary_key, kv_meta_key', async () => {
  const kv = makeKv(); const r2 = makeR2();
  const result = await writeBootstrapRun(makeRun('run-3'), kv, r2);
  assert.equal(result.run_id, 'run-3');
  assert.equal(result.summary_key, 'observability/runs/run-3/summary.json');
  assert.equal(result.kv_meta_key, 'observability:run:run-3:meta');
});

test('writeBootstrapRun: sanitizes string fields before storage', async () => {
  const kv = makeKv(); const r2 = makeR2();
  const run = makeRun('run-4', 'failure', { error_code: 'ERR\nINJECTED' });
  await writeBootstrapRun(run, kv, r2);
  const stored = JSON.parse(r2.store[runSummaryR2Key('run-4')]);
  assert.equal(stored.error_code, 'ERR INJECTED');
});

test('writeBootstrapRun: deduplicates run_id in index', async () => {
  const kv = makeKv(); const r2 = makeR2();
  await writeBootstrapRun(makeRun('dup'), kv, r2);
  await writeBootstrapRun(makeRun('dup'), kv, r2); // write again
  const index = JSON.parse(kv.store[RUNS_INDEX_KV_KEY]);
  assert.equal(index.filter(id => id === 'dup').length, 1);
});

// ── Tests: listBootstrapRuns ──────────────────────────────────────────────────

test('listBootstrapRuns: returns empty array when no runs', async () => {
  const kv = makeKv();
  const result = await listBootstrapRuns(kv);
  assert.deepEqual(result, []);
});

test('listBootstrapRuns: returns summaries newest first', async () => {
  const kv = makeKv(); const r2 = makeR2();
  await writeBootstrapRun(makeRun('r1'), kv, r2);
  await writeBootstrapRun(makeRun('r2'), kv, r2);
  await writeBootstrapRun(makeRun('r3'), kv, r2);
  const summaries = await listBootstrapRuns(kv);
  assert.equal(summaries[0].run_id, 'r3');
  assert.equal(summaries[1].run_id, 'r2');
  assert.equal(summaries[2].run_id, 'r1');
});

test('listBootstrapRuns: respects limit parameter', async () => {
  const kv = makeKv(); const r2 = makeR2();
  for (let i = 1; i <= 5; i++) await writeBootstrapRun(makeRun(`r${i}`), kv, r2);
  const summaries = await listBootstrapRuns(kv, 2);
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0].run_id, 'r5');
});

test('listBootstrapRuns: returns summaries without raw evidence', async () => {
  const kv = makeKv(); const r2 = makeR2();
  await writeBootstrapRun(makeRun('ev-run'), kv, r2);
  const [summary] = await listBootstrapRuns(kv);
  // Summary must not include full phase details (just phase_count)
  assert.equal('phases' in summary, false);
  assert.ok(typeof summary.phase_count === 'number');
});

// ── Tests: getBootstrapRun ────────────────────────────────────────────────────

test('getBootstrapRun: returns full run from R2', async () => {
  const kv = makeKv(); const r2 = makeR2();
  await writeBootstrapRun(makeRun('full-run'), kv, r2);
  const run = await getBootstrapRun('full-run', r2);
  assert.ok(run !== null);
  assert.equal(run.run_id, 'full-run');
  assert.equal(run.phases.length, 5);
});

test('getBootstrapRun: returns null for unknown run_id', async () => {
  const r2 = makeR2();
  const result = await getBootstrapRun('does-not-exist', r2);
  assert.equal(result, null);
});

// ── Tests: getLatestRunSummary ────────────────────────────────────────────────

test('getLatestRunSummary: returns null when no runs recorded', async () => {
  const kv = makeKv();
  const result = await getLatestRunSummary(kv);
  assert.equal(result, null);
});

test('getLatestRunSummary: returns summary of most recent run', async () => {
  const kv = makeKv(); const r2 = makeR2();
  await writeBootstrapRun(makeRun('old'), kv, r2);
  await writeBootstrapRun(makeRun('new'), kv, r2);
  const summary = await getLatestRunSummary(kv);
  assert.equal(summary.run_id, 'new');
});
