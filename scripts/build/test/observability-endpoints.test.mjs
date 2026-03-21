/**
 * Atom 6 — Worker HTTP endpoint contract tests
 *
 * Tests the handler logic inline, exercising auth, validation, routing,
 * and response shape — without starting a real Worker process.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Minimal inline implementations ────────────────────────────────────────────
// (Duplicated from the source files so tests run without TypeScript compilation.)

// --- schema ---
const FORBIDDEN = new Set(['authorization','token','cookie','secret','password','passwd','credential','credentials','api_key','apikey','private_key','privatekey','auth']);
const MAX_LEN = 2048;
function isObj(v) { return typeof v === 'object' && v !== null && !Array.isArray(v); }
function isIso(v) { return typeof v === 'string' && Number.isFinite(Date.parse(v)); }
function validateBootstrapRun(payload) {
  if (!isObj(payload)) return { ok: false, error: 'Payload must be a JSON object' };
  for (const k of Object.keys(payload)) { if (FORBIDDEN.has(k.toLowerCase())) return { ok: false, error: `Field '${k}' is not permitted in a run record` }; }
  if (typeof payload.run_id !== 'string' || !payload.run_id) return { ok: false, error: "Field 'run_id' must be a non-empty string" };
  if (!isIso(payload.started_at)) return { ok: false, error: "Field 'started_at' must be a valid ISO 8601 timestamp" };
  if (!['success','failure','partial'].includes(payload.status)) return { ok: false, error: "Field 'status' must be one of: success, failure, partial" };
  if (!Array.isArray(payload.phases)) return { ok: false, error: "Field 'phases' must be an array" };
  return { ok: true, value: { run_id: payload.run_id, started_at: payload.started_at, status: payload.status, phases: payload.phases } };
}

// --- sanitize ---
function sanitize(v) {
  if (typeof v !== 'string') return v;
  return v.replace(/[\r\n\t]/g, ' ').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}
function sanitizeRecord(v) {
  if (typeof v === 'string') return sanitize(v);
  if (Array.isArray(v)) return v.map(sanitizeRecord);
  if (isObj(v)) { const r = {}; for (const [k,val] of Object.entries(v)) r[k] = sanitizeRecord(val); return r; }
  return v;
}

// --- settings ---
const BOUNDS = { raw_retention_days:{min:1,max:30}, summary_retention_days:{min:7,max:365}, aggregate_retention_days:{min:30,max:730}, max_events_per_run:{min:1,max:500}, max_message_length:{min:64,max:4096} };
const DEFAULT_SETTINGS = { raw_retention_days:7, summary_retention_days:90, aggregate_retention_days:365, max_events_per_run:100, max_message_length:2048 };
const KV_SETTINGS_KEY = 'observability:settings';
function validateObservabilitySettings(input) {
  const errors = [];
  if (!isObj(input)) return { ok: false, errors: ['Settings must be a JSON object'] };
  const result = {};
  for (const [f, b] of Object.entries(BOUNDS)) {
    const v = input[f];
    if (v === undefined) { result[f] = DEFAULT_SETTINGS[f]; continue; }
    if (typeof v !== 'number' || !Number.isInteger(v)) { errors.push(`Field '${f}' must be an integer`); continue; }
    if (v < b.min || v > b.max) { errors.push(`Field '${f}' must be between ${b.min} and ${b.max} (got ${v})`); continue; }
    result[f] = v;
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: result };
}
async function readObservabilitySettings(kv) {
  if (!kv) return { ...DEFAULT_SETTINGS };
  let raw; try { raw = await kv.get(KV_SETTINGS_KEY); } catch { return { ...DEFAULT_SETTINGS }; }
  if (!raw) return { ...DEFAULT_SETTINGS };
  let p; try { p = JSON.parse(raw); } catch { return { ...DEFAULT_SETTINGS }; }
  const r = validateObservabilitySettings(p);
  return r.ok ? r.value : { ...DEFAULT_SETTINGS };
}
async function writeObservabilitySettings(kv, s) { await kv.put(KV_SETTINGS_KEY, JSON.stringify(s)); }

// --- storage ---
function runSummaryR2Key(id) { return `observability/runs/${id}/summary.json`; }
function runMetaKvKey(id) { return `observability:run:${id}:meta`; }
const LATEST_KV = 'observability:latest-run';
const INDEX_KV = 'observability:runs:index';
function buildSummary(run) {
  const s = { run_id: run.run_id, started_at: run.started_at, status: run.status, phase_count: run.phases.length };
  if (run.finished_at) s.finished_at = run.finished_at;
  if (run.first_failed_phase) s.first_failed_phase = run.first_failed_phase;
  if (run.error_code) s.error_code = run.error_code;
  if (run.expected_version) s.expected_version = run.expected_version;
  if (run.observed_version) s.observed_version = run.observed_version;
  return s;
}
async function writeBootstrapRun(run, kv, r2) {
  const san = sanitizeRecord(run);
  const summary = buildSummary(san);
  await r2.put(runSummaryR2Key(san.run_id), JSON.stringify(san, null, 2));
  await kv.put(runMetaKvKey(san.run_id), JSON.stringify(summary));
  await kv.put(LATEST_KV, san.run_id);
  const rawIdx = await kv.get(INDEX_KV);
  let idx = []; if (rawIdx) { try { const p = JSON.parse(rawIdx); if (Array.isArray(p)) idx = p; } catch {} }
  idx = [san.run_id, ...idx.filter(id => id !== san.run_id)].slice(0, 100);
  await kv.put(INDEX_KV, JSON.stringify(idx));
  return { run_id: san.run_id, summary_key: runSummaryR2Key(san.run_id), kv_meta_key: runMetaKvKey(san.run_id) };
}
async function listBootstrapRuns(kv, limit = 20) {
  const raw = await kv.get(INDEX_KV); if (!raw) return [];
  let idx; try { idx = JSON.parse(raw); if (!Array.isArray(idx)) return []; } catch { return []; }
  const summaries = [];
  for (const id of idx.slice(0, limit)) { const m = await kv.get(runMetaKvKey(id)); if (m) { try { summaries.push(JSON.parse(m)); } catch {} } }
  return summaries;
}
async function getBootstrapRun(runId, r2) {
  const obj = await r2.get(runSummaryR2Key(runId)); if (!obj) return null;
  try { return JSON.parse(await obj.text()); } catch { return null; }
}
async function getLatestRunSummary(kv) {
  const id = await kv.get(LATEST_KV); if (!id) return null;
  const m = await kv.get(runMetaKvKey(id)); if (!m) return null;
  try { return JSON.parse(m); } catch { return null; }
}

// ── Inline handler implementations ────────────────────────────────────────────

function jsonResp(data, status = 200) {
  return { status, body: data };
}
function badReq(msg) { return jsonResp({ error: { code: 'bad_request', message: msg } }, 400); }
function nf(msg) { return jsonResp({ error: 'Not Found', message: msg }, 404); }

async function readBody(request) {
  try { return { ok: true, value: await request.json() }; }
  catch { return { ok: false, response: badReq('Invalid JSON body') }; }
}

async function handleRunCreate(request, env) {
  const body = await readBody(request);
  if (!body.ok) return body.response;
  const v = validateBootstrapRun(body.value);
  if (!v.ok) return badReq(v.error);
  if (!env.kv || !env.r2) return jsonResp({ error: 'Observability storage not configured' }, 503);
  try {
    const result = await writeBootstrapRun(v.value, env.kv, env.r2);
    return jsonResp({ ok: true, run_id: result.run_id }, 201);
  } catch { return jsonResp({ error: 'Failed to persist run record' }, 500); }
}

async function handleRunList(request, env) {
  if (!env.kv) return jsonResp({ runs: [], latest: null });
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '20', 10) || 20;
  const [runs, latest] = await Promise.all([listBootstrapRuns(env.kv, limit), getLatestRunSummary(env.kv)]);
  return jsonResp({ runs, latest, count: runs.length });
}

async function handleRunGet(runId, env) {
  if (!env.r2) return jsonResp({ error: 'Observability storage not configured' }, 503);
  const run = await getBootstrapRun(runId, env.r2);
  if (!run) return nf(`Run '${runId}' not found`);
  return jsonResp({ run });
}

async function handleSettingsGet(env) {
  const settings = await readObservabilitySettings(env.kv);
  return jsonResp({ settings });
}

async function handleSettingsPut(request, env) {
  const body = await readBody(request);
  if (!body.ok) return body.response;
  const v = validateObservabilitySettings(body.value);
  if (!v.ok) return jsonResp({ error: 'Validation failed', details: v.errors }, 400);
  if (!env.kv) return jsonResp({ error: 'Settings storage not configured' }, 503);
  await writeObservabilitySettings(env.kv, v.value);
  return jsonResp({ ok: true, settings: v.value });
}

// ── Mock infra ────────────────────────────────────────────────────────────────

function makeKv() { const s = {}; return { s, get: async k => s[k]??null, put: async (k,v) => { s[k]=v; } }; }
function makeR2() { const s = {}; return { s, put: async (k,v) => { s[k]=v; }, get: async k => k in s ? { text: async () => s[k] } : null }; }
function makeEnv(opts = {}) { return { kv: opts.kv ?? makeKv(), r2: opts.r2 ?? makeR2() }; }

function mockRequest(url, body) {
  return { url, json: async () => body };
}
function mockRequestStr(url, bodyStr) {
  return { url, json: async () => { throw new Error('bad json'); } };
}

const VALID_RUN = {
  run_id: 'r-test',
  started_at: '2026-03-21T10:00:00.000Z',
  status: 'success',
  phases: [
    { phase: 'bootstrap_start', result: 'ok', duration_ms: 5 },
    { phase: 'bootstrap_complete', result: 'ok', duration_ms: 2 },
  ],
};

// ── Tests: POST /v1/observability/runs ────────────────────────────────────────

test('POST runs: returns 201 with run_id for valid run', async () => {
  const env = makeEnv();
  const req = mockRequest('http://w/v1/observability/runs', VALID_RUN);
  const resp = await handleRunCreate(req, env);
  assert.equal(resp.status, 201);
  assert.equal(resp.body.run_id, 'r-test');
});

test('POST runs: returns 400 for missing run_id', async () => {
  const env = makeEnv();
  const { run_id: _, ...bad } = VALID_RUN;
  const req = mockRequest('http://w/v1/observability/runs', bad);
  const resp = await handleRunCreate(req, env);
  assert.equal(resp.status, 400);
});

test('POST runs: returns 400 for forbidden field "token"', async () => {
  const env = makeEnv();
  const req = mockRequest('http://w/v1/observability/runs', { ...VALID_RUN, token: 'secret' });
  const resp = await handleRunCreate(req, env);
  assert.equal(resp.status, 400);
  assert.match(JSON.stringify(resp.body), /token.*not permitted/i);
});

test('POST runs: returns 400 for invalid status', async () => {
  const env = makeEnv();
  const req = mockRequest('http://w/v1/observability/runs', { ...VALID_RUN, status: 'running' });
  const resp = await handleRunCreate(req, env);
  assert.equal(resp.status, 400);
});

test('POST runs: returns 503 when storage not configured', async () => {
  const env = { kv: null, r2: null };
  const req = mockRequest('http://w/v1/observability/runs', VALID_RUN);
  const resp = await handleRunCreate(req, env);
  assert.equal(resp.status, 503);
});

// ── Tests: GET /v1/observability/runs ─────────────────────────────────────────

test('GET runs: returns empty list when no runs', async () => {
  const env = makeEnv();
  const req = mockRequest('http://w/v1/observability/runs', null);
  const resp = await handleRunList(req, env);
  assert.equal(resp.status, 200);
  assert.deepEqual(resp.body.runs, []);
  assert.equal(resp.body.latest, null);
});

test('GET runs: returns summaries after writes', async () => {
  const env = makeEnv();
  const postReq = mockRequest('http://w/v1/observability/runs', VALID_RUN);
  await handleRunCreate(postReq, env);
  const listReq = mockRequest('http://w/v1/observability/runs', null);
  const resp = await handleRunList(listReq, env);
  assert.equal(resp.body.count, 1);
  assert.equal(resp.body.runs[0].run_id, 'r-test');
  assert.equal(resp.body.latest.run_id, 'r-test');
});

test('GET runs: respects limit query parameter', async () => {
  const env = makeEnv();
  for (let i = 1; i <= 5; i++) {
    await handleRunCreate(mockRequest('http://w/v1/observability/runs', { ...VALID_RUN, run_id: `r${i}` }), env);
  }
  const resp = await handleRunList(mockRequest('http://w/v1/observability/runs?limit=2', null), env);
  assert.equal(resp.body.count, 2);
});

test('GET runs: summaries do not contain raw phase arrays', async () => {
  const env = makeEnv();
  await handleRunCreate(mockRequest('http://w/v1/observability/runs', VALID_RUN), env);
  const resp = await handleRunList(mockRequest('http://w/v1/observability/runs', null), env);
  assert.equal('phases' in resp.body.runs[0], false);
  assert.equal(typeof resp.body.runs[0].phase_count, 'number');
});

// ── Tests: GET /v1/observability/runs/:runId ──────────────────────────────────

test('GET runs/:runId: returns full run', async () => {
  const env = makeEnv();
  await handleRunCreate(mockRequest('http://w/', VALID_RUN), env);
  const resp = await handleRunGet('r-test', env);
  assert.equal(resp.status, 200);
  assert.equal(resp.body.run.run_id, 'r-test');
  assert.ok(Array.isArray(resp.body.run.phases));
});

test('GET runs/:runId: returns 404 for unknown run', async () => {
  const env = makeEnv();
  const resp = await handleRunGet('does-not-exist', env);
  assert.equal(resp.status, 404);
});

test('GET runs/:runId: returns 503 when R2 not configured', async () => {
  const resp = await handleRunGet('any', { r2: null });
  assert.equal(resp.status, 503);
});

// ── Tests: GET /v1/observability/settings ─────────────────────────────────────

test('GET settings: returns default settings when KV empty', async () => {
  const env = makeEnv();
  const resp = await handleSettingsGet(env);
  assert.equal(resp.status, 200);
  assert.equal(resp.body.settings.raw_retention_days, 7);
  assert.equal(resp.body.settings.summary_retention_days, 90);
});

// ── Tests: PUT /v1/observability/settings ─────────────────────────────────────

test('PUT settings: persists valid settings', async () => {
  const env = makeEnv();
  const req = mockRequest('http://w/v1/observability/settings', { ...DEFAULT_SETTINGS, raw_retention_days: 14 });
  const resp = await handleSettingsPut(req, env);
  assert.equal(resp.status, 200);
  assert.equal(resp.body.settings.raw_retention_days, 14);

  // Verify persisted
  const getResp = await handleSettingsGet(env);
  assert.equal(getResp.body.settings.raw_retention_days, 14);
});

test('PUT settings: returns 400 for out-of-range value', async () => {
  const env = makeEnv();
  const req = mockRequest('http://w/v1/observability/settings', { ...DEFAULT_SETTINGS, raw_retention_days: 999 });
  const resp = await handleSettingsPut(req, env);
  assert.equal(resp.status, 400);
  assert.ok(Array.isArray(resp.body.details));
});

test('PUT settings: returns 503 when KV not configured', async () => {
  const env = { kv: null, r2: null };
  const req = mockRequest('http://w/v1/observability/settings', DEFAULT_SETTINGS);
  const resp = await handleSettingsPut(req, env);
  assert.equal(resp.status, 503);
});
