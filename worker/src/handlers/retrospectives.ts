/**
 * Post-Merge Retrospective — Worker HTTP handlers (V1)
 *
 * Endpoints:
 *   POST /v1/retrospectives              — store a new retrospective artifact
 *   GET  /v1/retrospectives              — list recent retrospective metas
 *   GET  /v1/retrospectives/aggregate    — aggregate skill-signal data (KV-only, no R2)
 *   GET  /v1/retrospectives/:id          — get full artifact from R2
 */

import { badRequest, jsonResponse, notFound, readJsonBody } from '../http';
import type { Env } from '../types';
import { validateRetrospectiveArtifact } from '../retrospectives/schema';
import {
  writeRetrospectiveArtifact,
  listRetrospectives,
  getRetrospectiveArtifact,
  aggregateRetrospectives,
} from '../retrospectives/storage';

// ── POST /v1/retrospectives ───────────────────────────────────────────────────

export async function handleRetrospectiveCreate(
  request: Request,
  env: Env,
): Promise<Response> {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;

  const validation = validateRetrospectiveArtifact(bodyResult.value);
  if (!validation.ok) {
    return badRequest(validation.error);
  }

  if (!env.MANIFEST_KV || !env.ARTEFACTS_R2) {
    return jsonResponse({ error: 'Retrospective storage not configured' }, 503);
  }

  try {
    const result = await writeRetrospectiveArtifact(
      validation.value,
      env.MANIFEST_KV,
      env.ARTEFACTS_R2,
    );
    return jsonResponse({ ok: true, id: result.id }, 201);
  } catch {
    return jsonResponse({ error: 'Failed to persist retrospective' }, 500);
  }
}

// ── GET /v1/retrospectives ────────────────────────────────────────────────────

export async function handleRetrospectiveList(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!env.MANIFEST_KV || !env.ARTEFACTS_R2) {
    return jsonResponse({ retrospectives: [], count: 0 });
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.max(1, Math.min(100, parseInt(limitParam, 10) || 20)) : 20;

  const retrospectives = await listRetrospectives(env.MANIFEST_KV, env.ARTEFACTS_R2, limit);
  return jsonResponse({ retrospectives, count: retrospectives.length });
}

// ── GET /v1/retrospectives/aggregate ─────────────────────────────────────────

export async function handleRetrospectiveAggregate(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!env.MANIFEST_KV || !env.ARTEFACTS_R2) {
    return jsonResponse({
      period_days: 60,
      artifact_count: 0,
      signal_breakdown: {},
      top_recommendations: [],
    });
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.max(1, Math.min(100, parseInt(limitParam, 10) || 100)) : 100;

  const aggregate = await aggregateRetrospectives(env.MANIFEST_KV, env.ARTEFACTS_R2, limit);
  return jsonResponse({ period_days: 60, ...aggregate });
}

// ── GET /v1/retrospectives/:id ────────────────────────────────────────────────

export async function handleRetrospectiveGet(
  id: string,
  env: Env,
): Promise<Response> {
  if (!env.ARTEFACTS_R2) {
    return jsonResponse({ error: 'Retrospective storage not configured' }, 503);
  }

  const artifact = await getRetrospectiveArtifact(id, env.ARTEFACTS_R2);
  if (!artifact) {
    return notFound(`Retrospective '${id}' not found`);
  }

  return jsonResponse({ retrospective: artifact });
}
