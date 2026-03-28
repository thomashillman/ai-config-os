/**
 * Bootstrap Run Ledger — Worker HTTP handlers (V1)
 *
 * Endpoints:
 *   POST /v1/observability/runs              — ingest a new bootstrap run
 *   GET  /v1/observability/runs              — list recent run summaries
 *   GET  /v1/observability/runs/:runId       — get full run record
 *   GET  /v1/observability/settings          — read retention settings
 *   PUT  /v1/observability/settings          — update retention settings
 */

import { badRequest, jsonResponse, notFound, readJsonBody } from '../http';
import type { Env } from '../types';
import { validateBootstrapRun } from '../observability/schema';
import {
  writeBootstrapRun,
  listBootstrapRuns,
  getBootstrapRun,
  getLatestRunSummary,
} from '../observability/storage';
import {
  readObservabilitySettings,
  writeObservabilitySettings,
  validateObservabilitySettings,
} from '../observability/settings';
import {
  OBSERVABILITY_CANONICAL_VERSION,
  settingsEnvelope,
  withRunSignals,
} from '../observability/canonical';

// ── POST /v1/observability/runs ───────────────────────────────────────────────

export async function handleObservabilityRunCreate(
  request: Request,
  env: Env,
): Promise<Response> {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;

  const validation = validateBootstrapRun(bodyResult.value);
  if (!validation.ok) {
    return badRequest(validation.error);
  }

  if (!env.MANIFEST_KV || !env.ARTEFACTS_R2) {
    return jsonResponse({ error: 'Observability storage not configured' }, 503);
  }

  try {
    const result = await writeBootstrapRun(validation.value, env.MANIFEST_KV, env.ARTEFACTS_R2);
    return jsonResponse({ ok: true, run_id: result.run_id }, 201);
  } catch (err) {
    // Observability failure must not expose internals
    return jsonResponse({ error: 'Failed to persist run record' }, 500);
  }
}

// ── GET /v1/observability/runs ────────────────────────────────────────────────

export async function handleObservabilityRunList(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!env.MANIFEST_KV) {
    return jsonResponse({ runs: [], latest: null });
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.max(1, Math.min(100, parseInt(limitParam, 10) || 20)) : 20;

  const [runs, latest] = await Promise.all([
    listBootstrapRuns(env.MANIFEST_KV, limit),
    getLatestRunSummary(env.MANIFEST_KV),
  ]);

  return jsonResponse({
    runs: runs.map(withRunSignals),
    latest: latest ? withRunSignals(latest) : null,
    count: runs.length,
    canonical_version: OBSERVABILITY_CANONICAL_VERSION,
    migration: {
      note: 'Legacy fields remain at the top level. Canonical signals are available under canonical_v2.signals.',
    },
  });
}

// ── GET /v1/observability/runs/:runId ─────────────────────────────────────────

export async function handleObservabilityRunGet(
  runId: string,
  env: Env,
): Promise<Response> {
  if (!env.ARTEFACTS_R2) {
    return jsonResponse({ error: 'Observability storage not configured' }, 503);
  }

  const run = await getBootstrapRun(runId, env.ARTEFACTS_R2);
  if (!run) {
    return notFound(`Run '${runId}' not found`);
  }

  return jsonResponse({
    run: withRunSignals(run),
    canonical_version: OBSERVABILITY_CANONICAL_VERSION,
    migration: {
      note: 'Legacy run fields are retained. Canonical signals are mirrored under canonical_v2.signals.',
    },
  });
}

// ── GET /v1/observability/settings ────────────────────────────────────────────

export async function handleObservabilitySettingsGet(env: Env): Promise<Response> {
  const settings = await readObservabilitySettings(env.MANIFEST_KV);
  return jsonResponse(settingsEnvelope(settings));
}

// ── PUT /v1/observability/settings ────────────────────────────────────────────

export async function handleObservabilitySettingsPut(
  request: Request,
  env: Env,
): Promise<Response> {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;

  const validation = validateObservabilitySettings(bodyResult.value);
  if (!validation.ok) {
    return jsonResponse({ error: 'Validation failed', details: validation.errors }, 400);
  }

  if (!env.MANIFEST_KV) {
    return jsonResponse({ error: 'Settings storage not configured' }, 503);
  }

  await writeObservabilitySettings(env.MANIFEST_KV, validation.value);
  return jsonResponse({ ok: true, ...settingsEnvelope(validation.value) });
}
