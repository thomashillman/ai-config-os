/**
 * Dashboard resource handlers — publish and read endpoints.
 *
 * Pattern:
 *   POST /v1/{resource}/publish  — local runtime pushes a snapshot
 *   GET  /v1/{resource}          — dashboard reads the latest snapshot
 *   POST /v1/{resource}/request  — dashboard requests a refresh (async)
 *
 * All responses use the standard contract envelope from contracts.ts.
 * Snapshots are stored in MANIFEST_KV under dashboard:{resource}:{repo}:{machine} keys.
 */

import { contractSuccessResponse, contractErrorResponse } from '../contracts';
import { readJsonBody } from '../http';
import { readSnapshot, writeSnapshot, missingMeta } from '../read-models/store';
import type { DashboardSnapshot, SnapshotScope } from '../read-models/types';
import type { Env } from '../types';

// ── Scope helpers ─────────────────────────────────────────────────────────────

function scopeFromHeaders(request: Request): SnapshotScope {
  return {
    repo_id: request.headers.get('X-Repo-Id') ?? 'unknown',
    machine_id: request.headers.get('X-Machine-Id') ?? 'unknown',
  };
}

function scopeFromQuery(url: URL): SnapshotScope {
  return {
    repo_id: url.searchParams.get('repo_id') ?? 'unknown',
    machine_id: url.searchParams.get('machine_id') ?? 'unknown',
  };
}

// ── Publish handler (shared) ──────────────────────────────────────────────────

async function handlePublish(
  resource: string,
  request: Request,
  env: Env,
): Promise<Response> {
  if (!env.MANIFEST_KV) {
    return contractErrorResponse({
      resource,
      summary: 'Snapshot store not configured',
      data: null,
      error: { code: 'storage_unavailable', message: 'MANIFEST_KV not bound', hint: 'Check Worker KV binding configuration' },
    }, 503);
  }

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;

  const body = bodyResult.value as Record<string, unknown>;
  if (!body.data || !body.meta || !body.summary) {
    return contractErrorResponse({
      resource,
      summary: 'Invalid snapshot payload',
      data: null,
      error: { code: 'invalid_payload', message: 'Snapshot must include data, meta, and summary', hint: 'See docs/DASHBOARD_TO_WORKER_PLAN.md for the required shape' },
    }, 400);
  }

  const scope = scopeFromHeaders(request);
  const snapshot: DashboardSnapshot = {
    data: body.data,
    meta: body.meta as DashboardSnapshot['meta'],
    summary: body.summary as string,
    updated_at: new Date().toISOString(),
    source_stamp: (body.source_stamp as string) ?? request.headers.get('X-Publisher-Surface') ?? 'unknown',
  };

  await writeSnapshot(env.MANIFEST_KV, resource, scope, snapshot);

  return contractSuccessResponse({
    resource,
    summary: `Snapshot for ${resource} stored`,
    data: { resource, scope, updated_at: snapshot.updated_at },
    meta: snapshot.meta,
  }, 201);
}

// ── Read handler (shared) ─────────────────────────────────────────────────────

async function handleRead(
  resource: string,
  url: URL,
  env: Env,
): Promise<Response> {
  if (!env.MANIFEST_KV) {
    const scope = scopeFromQuery(url);
    return contractSuccessResponse({
      resource,
      summary: `No snapshot available for ${resource} — store not configured`,
      data: null,
      meta: missingMeta(scope),
      suggestedActions: [
        { id: 'publish', label: 'Publish local snapshot', reason: 'Run runtime/publish-dashboard-state.mjs to push state to the Worker', runnable_target: 'runtime/publish-dashboard-state.mjs' },
      ],
    });
  }

  const scope = scopeFromQuery(url);
  const snapshot = await readSnapshot(env.MANIFEST_KV, resource, scope);

  if (!snapshot) {
    return contractSuccessResponse({
      resource,
      summary: `No snapshot found for ${resource}`,
      data: null,
      meta: missingMeta(scope),
      suggestedActions: [
        { id: 'publish', label: 'Publish local snapshot', reason: 'Run runtime/publish-dashboard-state.mjs to push state to the Worker', runnable_target: 'runtime/publish-dashboard-state.mjs' },
      ],
    });
  }

  return contractSuccessResponse({
    resource,
    summary: snapshot.summary,
    data: snapshot.data,
    meta: snapshot.meta,
  });
}

// ── Request handler (async refresh trigger) ───────────────────────────────────

function handleActionRequest(resource: string): Response {
  return contractSuccessResponse({
    resource,
    summary: `Refresh requested for ${resource}`,
    data: { status: 'requested', resource },
    meta: {
      generated_at: new Date().toISOString(),
      publisher_surface: 'worker',
      freshness_state: 'pending',
      scope: { repo_id: 'unknown', machine_id: 'unknown' },
    },
    suggestedActions: [
      { id: 'wait', label: 'Wait for local runtime to publish', reason: 'The local runtime will publish a fresh snapshot shortly', runnable_target: 'runtime/publish-dashboard-state.mjs' },
    ],
  });
}

// ── Public handlers ───────────────────────────────────────────────────────────

export async function handleSkillsPublish(request: Request, env: Env): Promise<Response> {
  return handlePublish('skills.list', request, env);
}
export async function handleSkillsRead(url: URL, env: Env): Promise<Response> {
  return handleRead('skills.list', url, env);
}

export async function handleToolingStatusPublish(request: Request, env: Env): Promise<Response> {
  return handlePublish('tooling.status', request, env);
}
export async function handleToolingStatusRead(url: URL, env: Env): Promise<Response> {
  return handleRead('tooling.status', url, env);
}
export function handleToolingSyncRequest(): Response {
  return handleActionRequest('tooling.status');
}

export async function handleConfigSummaryPublish(request: Request, env: Env): Promise<Response> {
  return handlePublish('config.summary', request, env);
}
export async function handleConfigSummaryRead(url: URL, env: Env): Promise<Response> {
  return handleRead('config.summary', url, env);
}

export async function handleContextCostPublish(request: Request, env: Env): Promise<Response> {
  return handlePublish('runtime.context_cost', request, env);
}
export async function handleContextCostRead(url: URL, env: Env): Promise<Response> {
  return handleRead('runtime.context_cost', url, env);
}
export function handleContextCostRequest(): Response {
  return handleActionRequest('runtime.context_cost');
}

export async function handleAuditPublish(request: Request, env: Env): Promise<Response> {
  return handlePublish('audit.validate_all', request, env);
}
export async function handleAuditRead(url: URL, env: Env): Promise<Response> {
  return handleRead('audit.validate_all', url, env);
}
export function handleAuditRequest(): Response {
  return handleActionRequest('audit.validate_all');
}

export async function handleAnalyticsToolUsagePublish(request: Request, env: Env): Promise<Response> {
  return handlePublish('analytics.tool_usage', request, env);
}
export async function handleAnalyticsToolUsageRead(url: URL, env: Env): Promise<Response> {
  return handleRead('analytics.tool_usage', url, env);
}

export async function handleAnalyticsSkillEffectivenessPublish(request: Request, env: Env): Promise<Response> {
  return handlePublish('analytics.skill_effectiveness', request, env);
}
export async function handleAnalyticsSkillEffectivenessRead(url: URL, env: Env): Promise<Response> {
  return handleRead('analytics.skill_effectiveness', url, env);
}

export async function handleAnalyticsAutoresearchRunsPublish(request: Request, env: Env): Promise<Response> {
  return handlePublish('analytics.autoresearch_runs', request, env);
}
export async function handleAnalyticsAutoresearchRunsRead(url: URL, env: Env): Promise<Response> {
  return handleRead('analytics.autoresearch_runs', url, env);
}

export async function handleAnalyticsFrictionSignalsPublish(request: Request, env: Env): Promise<Response> {
  return handlePublish('analytics.friction_signals', request, env);
}
export async function handleAnalyticsFrictionSignalsRead(url: URL, env: Env): Promise<Response> {
  return handleRead('analytics.friction_signals', url, env);
}
