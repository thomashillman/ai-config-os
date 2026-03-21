/**
 * Atom 3 — Observability settings tests
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Inline implementation (mirrors worker/src/observability/settings.ts) ──────

const SETTINGS_BOUNDS = {
  raw_retention_days: { min: 1, max: 30 },
  summary_retention_days: { min: 7, max: 365 },
  aggregate_retention_days: { min: 30, max: 730 },
  max_events_per_run: { min: 1, max: 500 },
  max_message_length: { min: 64, max: 4096 },
};

const DEFAULT_SETTINGS = {
  raw_retention_days: 7,
  summary_retention_days: 90,
  aggregate_retention_days: 365,
  max_events_per_run: 100,
  max_message_length: 2048,
};

const KV_SETTINGS_KEY = 'observability:settings';

function validateObservabilitySettings(input) {
  const errors = [];
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['Settings must be a JSON object'] };
  }
  const result = {};
  for (const [field, bounds] of Object.entries(SETTINGS_BOUNDS)) {
    const v = input[field];
    if (v === undefined) { result[field] = DEFAULT_SETTINGS[field]; continue; }
    if (typeof v !== 'number' || !Number.isInteger(v) || !Number.isFinite(v)) {
      errors.push(`Field '${field}' must be an integer`); continue;
    }
    if (v < bounds.min || v > bounds.max) {
      errors.push(`Field '${field}' must be between ${bounds.min} and ${bounds.max} (got ${v})`); continue;
    }
    result[field] = v;
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: result };
}

async function readObservabilitySettings(kv) {
  if (!kv) return { ...DEFAULT_SETTINGS };
  let raw;
  try { raw = await kv.get(KV_SETTINGS_KEY); } catch { return { ...DEFAULT_SETTINGS }; }
  if (!raw) return { ...DEFAULT_SETTINGS };
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { ...DEFAULT_SETTINGS }; }
  const result = validateObservabilitySettings(parsed);
  if (!result.ok) return { ...DEFAULT_SETTINGS };
  return result.value;
}

async function writeObservabilitySettings(kv, settings) {
  await kv.put(KV_SETTINGS_KEY, JSON.stringify(settings));
}

// ── Mock KV ───────────────────────────────────────────────────────────────────

function makeKv(initial = {}) {
  const store = { ...initial };
  return {
    store,
    get: async (key) => store[key] ?? null,
    put: async (key, value) => { store[key] = value; },
  };
}

// ── Tests: validateObservabilitySettings ─────────────────────────────────────

test('validateObservabilitySettings: accepts all valid defaults', () => {
  const result = validateObservabilitySettings(DEFAULT_SETTINGS);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, DEFAULT_SETTINGS);
});

test('validateObservabilitySettings: fills missing fields with defaults', () => {
  const result = validateObservabilitySettings({});
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, DEFAULT_SETTINGS);
});

test('validateObservabilitySettings: rejects non-object', () => {
  assert.equal(validateObservabilitySettings(null).ok, false);
  assert.equal(validateObservabilitySettings('string').ok, false);
  assert.equal(validateObservabilitySettings([]).ok, false);
});

test('validateObservabilitySettings: rejects non-integer values', () => {
  const result = validateObservabilitySettings({ ...DEFAULT_SETTINGS, raw_retention_days: 3.5 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('raw_retention_days')));
});

test('validateObservabilitySettings: rejects raw_retention_days below min (1)', () => {
  const result = validateObservabilitySettings({ ...DEFAULT_SETTINGS, raw_retention_days: 0 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('raw_retention_days')));
});

test('validateObservabilitySettings: rejects raw_retention_days above max (30)', () => {
  const result = validateObservabilitySettings({ ...DEFAULT_SETTINGS, raw_retention_days: 31 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('raw_retention_days')));
});

test('validateObservabilitySettings: rejects summary_retention_days below min (7)', () => {
  const result = validateObservabilitySettings({ ...DEFAULT_SETTINGS, summary_retention_days: 6 });
  assert.equal(result.ok, false);
});

test('validateObservabilitySettings: rejects summary_retention_days above max (365)', () => {
  const result = validateObservabilitySettings({ ...DEFAULT_SETTINGS, summary_retention_days: 366 });
  assert.equal(result.ok, false);
});

test('validateObservabilitySettings: rejects aggregate_retention_days below min (30)', () => {
  const result = validateObservabilitySettings({ ...DEFAULT_SETTINGS, aggregate_retention_days: 29 });
  assert.equal(result.ok, false);
});

test('validateObservabilitySettings: rejects aggregate_retention_days above max (730)', () => {
  const result = validateObservabilitySettings({ ...DEFAULT_SETTINGS, aggregate_retention_days: 731 });
  assert.equal(result.ok, false);
});

test('validateObservabilitySettings: accepts boundary values (min)', () => {
  const result = validateObservabilitySettings({
    raw_retention_days: 1,
    summary_retention_days: 7,
    aggregate_retention_days: 30,
    max_events_per_run: 1,
    max_message_length: 64,
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.raw_retention_days, 1);
});

test('validateObservabilitySettings: accepts boundary values (max)', () => {
  const result = validateObservabilitySettings({
    raw_retention_days: 30,
    summary_retention_days: 365,
    aggregate_retention_days: 730,
    max_events_per_run: 500,
    max_message_length: 4096,
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.aggregate_retention_days, 730);
});

test('validateObservabilitySettings: returns all errors, not just first', () => {
  const result = validateObservabilitySettings({
    ...DEFAULT_SETTINGS,
    raw_retention_days: 0,
    summary_retention_days: 999,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 2);
});

// ── Tests: readObservabilitySettings ─────────────────────────────────────────

test('readObservabilitySettings: returns defaults when kv is undefined', async () => {
  const result = await readObservabilitySettings(undefined);
  assert.deepEqual(result, DEFAULT_SETTINGS);
});

test('readObservabilitySettings: returns defaults when key is absent', async () => {
  const kv = makeKv({});
  const result = await readObservabilitySettings(kv);
  assert.deepEqual(result, DEFAULT_SETTINGS);
});

test('readObservabilitySettings: returns defaults when value is invalid JSON', async () => {
  const kv = makeKv({ [KV_SETTINGS_KEY]: 'not-json' });
  const result = await readObservabilitySettings(kv);
  assert.deepEqual(result, DEFAULT_SETTINGS);
});

test('readObservabilitySettings: returns defaults when value fails validation', async () => {
  const kv = makeKv({ [KV_SETTINGS_KEY]: JSON.stringify({ raw_retention_days: 999 }) });
  const result = await readObservabilitySettings(kv);
  assert.deepEqual(result, DEFAULT_SETTINGS);
});

test('readObservabilitySettings: returns stored settings when valid', async () => {
  const custom = { ...DEFAULT_SETTINGS, raw_retention_days: 14 };
  const kv = makeKv({ [KV_SETTINGS_KEY]: JSON.stringify(custom) });
  const result = await readObservabilitySettings(kv);
  assert.equal(result.raw_retention_days, 14);
});

test('readObservabilitySettings: returns defaults when kv.get throws', async () => {
  const kv = { get: async () => { throw new Error('KV unavailable'); }, put: async () => {} };
  const result = await readObservabilitySettings(kv);
  assert.deepEqual(result, DEFAULT_SETTINGS);
});

// ── Tests: writeObservabilitySettings ────────────────────────────────────────

test('writeObservabilitySettings: persists settings to KV', async () => {
  const kv = makeKv({});
  const custom = { ...DEFAULT_SETTINGS, raw_retention_days: 3 };
  await writeObservabilitySettings(kv, custom);
  const stored = JSON.parse(kv.store[KV_SETTINGS_KEY]);
  assert.equal(stored.raw_retention_days, 3);
});
