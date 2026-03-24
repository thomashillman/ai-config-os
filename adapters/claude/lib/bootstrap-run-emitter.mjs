#!/usr/bin/env node
/**
 * Bootstrap Run Emitter — thin non-blocking HTTP emitter (V1)
 *
 * Sends one BootstrapRun record to the Worker observability endpoint.
 * Failure MUST NOT block or crash the bootstrap flow.
 *
 * Usage (from shell):
 *   node adapters/claude/lib/bootstrap-run-emitter.mjs <run-json-file>
 *
 * The run-json-file is a path to a JSON file containing a BootstrapRun object.
 * Exit codes: 0 = success, 1 = skipped (no token/worker), 2 = validation error,
 *             3 = network error (non-fatal; logged to stderr).
 *
 * Environment variables:
 *   AI_CONFIG_TOKEN   - Bearer token (required; skip emit if absent)
 *   AI_CONFIG_WORKER  - Worker base URL (default: https://ai-config-os.workers.dev)
 *   AI_CONFIG_BOOTSTRAP_EMIT_RUNS - Set to '0' or 'false' to disable (default: enabled)
 */

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const WORKER_URL = process.env.AI_CONFIG_WORKER ?? 'https://ai-config-os.workers.dev';
const EMIT_RUNS = (process.env.AI_CONFIG_BOOTSTRAP_EMIT_RUNS ?? '1') !== '0' &&
                 (process.env.AI_CONFIG_BOOTSTRAP_EMIT_RUNS ?? 'true') !== 'false';

// ── Validation (same contract as Worker, no external deps) ────────────────────

const FORBIDDEN_FIELDS = new Set([
  'authorization','token','cookie','secret','password','passwd',
  'credential','credentials','api_key','apikey','private_key','privatekey','auth',
]);
const MAX_MSG_LEN = 2048;

function isObj(v) { return typeof v === 'object' && v !== null && !Array.isArray(v); }
function isIso(v) { return typeof v === 'string' && Number.isFinite(Date.parse(v)); }

function validateRun(payload) {
  if (!isObj(payload)) return { ok: false, error: 'Payload must be a JSON object' };
  for (const k of Object.keys(payload)) {
    if (FORBIDDEN_FIELDS.has(k.toLowerCase())) return { ok: false, error: `Field '${k}' is not permitted` };
  }
  if (typeof payload.run_id !== 'string' || !payload.run_id) return { ok: false, error: 'run_id required' };
  if (!isIso(payload.started_at)) return { ok: false, error: 'started_at must be ISO 8601' };
  if (!['success','failure','partial'].includes(payload.status)) return { ok: false, error: 'status must be success|failure|partial' };
  if (!Array.isArray(payload.phases)) return { ok: false, error: 'phases must be an array' };
  return { ok: true };
}

// ── Emit ──────────────────────────────────────────────────────────────────────

async function emit(run) {
  const token = process.env.AI_CONFIG_TOKEN;
  if (!token) {
    process.stderr.write('[bootstrap-run-emitter] AI_CONFIG_TOKEN not set; skipping run emit\n');
    process.exit(1);
  }

  if (!EMIT_RUNS) {
    process.stderr.write('[bootstrap-run-emitter] Run emission disabled via AI_CONFIG_BOOTSTRAP_EMIT_RUNS\n');
    process.exit(1);
  }

  const validation = validateRun(run);
  if (!validation.ok) {
    process.stderr.write(`[bootstrap-run-emitter] Validation error: ${validation.error}\n`);
    process.exit(2);
  }

  const endpoint = `${WORKER_URL}/v1/observability/runs`;

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(run),
      signal: AbortSignal.timeout(5000), // 5 s max; non-blocking for bootstrap
    });

    if (!resp.ok) {
      process.stderr.write(`[bootstrap-run-emitter] Worker returned HTTP ${resp.status}\n`);
      process.exit(3);
    }

    process.stdout.write(`[bootstrap-run-emitter] Run ${run.run_id} emitted (HTTP ${resp.status})\n`);
    process.exit(0);
  } catch (err) {
    // Network errors are non-fatal — log to stderr but do not abort bootstrap
    process.stderr.write(`[bootstrap-run-emitter] Network error: ${err.message}\n`);
    process.exit(3);
  }
}

// ── CLI entry ─────────────────────────────────────────────────────────────────

const [,, runFile] = process.argv;

if (!runFile) {
  process.stderr.write('Usage: bootstrap-run-emitter.mjs <run-json-file>\n');
  process.exit(1);
}

readFile(runFile, 'utf8')
  .then(text => {
    let run;
    try { run = JSON.parse(text); }
    catch (e) { process.stderr.write(`[bootstrap-run-emitter] Invalid JSON in ${runFile}: ${e.message}\n`); process.exit(2); }
    return emit(run);
  })
  .catch(err => {
    process.stderr.write(`[bootstrap-run-emitter] Fatal: ${err.message}\n`);
    process.exit(3);
  });
