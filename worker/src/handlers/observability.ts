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
import { contractSuccessResponse, contractErrorResponse } from '../contracts';
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
import { withRunSignals, deriveRunSignals } from '../observability/canonical';

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
    return contractErrorResponse({
      resource: 'observability.runs.create',
      summary: 'Observability storage not configured',
      data: null,
      error: { code: 'storage_unavailable', message: 'MANIFEST_KV or ARTEFACTS_R2 not bound', hint: 'Check Worker storage binding configuration' },
    }, 503);
  }

  try {
    const result = await writeBootstrapRun(validation.value, env.MANIFEST_KV, env.ARTEFACTS_R2);
    return contractSuccessResponse({
      resource: 'observability.runs.create',
      summary: 'Bootstrap run recorded',
      data: { run_id: result.run_id },
    }, 201);
  } catch {
    return contractErrorResponse({
      resource: 'observability.runs.create',
      summary: 'Failed to persist run record',
      data: null,
      error: { code: 'storage_write_failed', message: 'Failed to persist run record', hint: 'Retry the request' },
    }, 500);
  }
}

// ── GET /v1/observability/runs ────────────────────────────────────────────────

export async function handleObservabilityRunList(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!env.MANIFEST_KV) {
    return contractSuccessResponse({
      resource: 'observability.runs.list',
      summary: 'No bootstrap runs recorded yet',
      data: { runs: [], latest: null, count: 0 },
    });
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.max(1, Math.min(100, parseInt(limitParam, 10) || 20)) : 20;

  const [runs, latest] = await Promise.all([
    listBootstrapRuns(env.MANIFEST_KV, limit),
    getLatestRunSummary(env.MANIFEST_KV),
  ]);

  const enrichedRuns = runs.map(withRunSignals);
  const enrichedLatest = latest ? withRunSignals(latest) : null;
  const anyAttention = enrichedRuns.some(r => r.attention_required);

  return contractSuccessResponse({
    resource: 'observability.runs.list',
    summary: enrichedLatest
      ? `Latest run: ${enrichedLatest.status}. ${runs.length} run(s) recorded.`
      : `${runs.length} run(s) recorded.`,
    data: { runs: enrichedRuns, latest: enrichedLatest, count: runs.length },
    meta: {
      interpretation: {
        attention_required: anyAttention,
        failure_reason_summary: enrichedLatest?.failure_reason_summary ?? null,
        locality: enrichedLatest?.locality ?? null,
        capability: enrichedLatest?.capability ?? null,
      },
    },
  });
}

// ── GET /v1/observability/runs/:runId ─────────────────────────────────────────

export async function handleObservabilityRunGet(
  runId: string,
  env: Env,
): Promise<Response> {
  if (!env.ARTEFACTS_R2) {
    return contractErrorResponse({
      resource: 'observability.runs.get',
      summary: 'Observability storage not configured',
      data: null,
      error: { code: 'storage_unavailable', message: 'ARTEFACTS_R2 not bound', hint: 'Check Worker storage binding configuration' },
    }, 503);
  }

  const run = await getBootstrapRun(runId, env.ARTEFACTS_R2);
  if (!run) {
    return contractErrorResponse({
      resource: 'observability.runs.get',
      summary: `Run '${runId}' not found`,
      data: null,
      error: { code: 'not_found', message: `No run with id '${runId}'`, hint: 'Check the run ID and retry' },
    }, 404);
  }

  const enriched = withRunSignals(run);
  const signals = deriveRunSignals(run);

  return contractSuccessResponse({
    resource: 'observability.runs.get',
    summary: `Run ${runId}: ${enriched.status}`,
    data: { run: enriched },
    meta: {
      interpretation: {
        attention_required: signals.attention_required,
        failure_reason_summary: signals.failure_reason_summary,
        locality: signals.locality,
        capability: signals.capability,
      },
    },
    suggestedActions: signals.next_actions.map((action, i) => ({
      id: `action_${i}`,
      label: action,
      reason: signals.failure_reason_summary,
      runnable_target: null,
    })),
  });
}

// ── GET /v1/observability/settings ────────────────────────────────────────────

export async function handleObservabilitySettingsGet(env: Env): Promise<Response> {
  const settings = await readObservabilitySettings(env.MANIFEST_KV);
  return contractSuccessResponse({
    resource: 'observability.settings.get',
    summary: 'Observability retention settings',
    data: { settings },
    meta: {
      interpretation: {
        locality: 'worker/kv',
        capability: 'observability.settings.retention',
      },
    },
  });
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
    return contractErrorResponse({
      resource: 'observability.settings.put',
      summary: 'Settings validation failed',
      data: null,
      error: { code: 'validation_failed', message: 'Settings did not pass validation', hint: validation.errors?.join('; ') ?? 'Check the settings values' },
    }, 400);
  }

  if (!env.MANIFEST_KV) {
    return contractErrorResponse({
      resource: 'observability.settings.put',
      summary: 'Settings storage not configured',
      data: null,
      error: { code: 'storage_unavailable', message: 'MANIFEST_KV not bound', hint: 'Check Worker KV binding configuration' },
    }, 503);
  }

  await writeObservabilitySettings(env.MANIFEST_KV, validation.value);
  return contractSuccessResponse({
    resource: 'observability.settings.put',
    summary: 'Observability settings saved',
    data: { settings: validation.value },
    meta: {
      interpretation: {
        locality: 'worker/kv',
        capability: 'observability.settings.retention',
      },
    },
  });
}
