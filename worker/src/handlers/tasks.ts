import { badRequest, jsonResponse, readJsonBody } from '../http';
import { getContinuationFingerprint, getTaskService, setContinuationFingerprint, taskErrorResponse } from '../task-runtime';
import type { ContinuationPayload, Env, RouteSelectionPayload, TransitionTaskStatePayload } from '../types';

function asObject(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return null;
  }
  return payload as Record<string, unknown>;
}

function isIsoDateTime(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validateTaskCreatePayload(payload: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const data = asObject(payload);
  if (!data) {
    return { ok: false, error: 'Payload must be a JSON object' };
  }
  return { ok: true, value: data };
}

function validateTaskStatePayload(payload: unknown): { ok: true; value: TransitionTaskStatePayload } | { ok: false; error: string } {
  const data = asObject(payload);
  if (!data) return { ok: false, error: 'Payload must be a JSON object' };
  if (!Number.isInteger(data.expected_version)) return { ok: false, error: "Field 'expected_version' must be an integer" };
  if (typeof data.next_state !== 'string' || data.next_state.length === 0) return { ok: false, error: "Field 'next_state' must be a non-empty string" };
  if (typeof data.next_action !== 'string' || data.next_action.length === 0) return { ok: false, error: "Field 'next_action' must be a non-empty string" };
  if (!isIsoDateTime(data.updated_at)) return { ok: false, error: "Field 'updated_at' must be an ISO timestamp" };

  if (data.progress !== undefined) {
    const progress = asObject(data.progress);
    if (!progress) return { ok: false, error: "Field 'progress' must be an object" };
    if (!Number.isInteger(progress.completed_steps) || !Number.isInteger(progress.total_steps)) {
      return { ok: false, error: "Field 'progress' must include integer 'completed_steps' and 'total_steps'" };
    }
  }

  return { ok: true, value: data as unknown as TransitionTaskStatePayload };
}

function validateRouteSelectionPayload(payload: unknown): { ok: true; value: RouteSelectionPayload } | { ok: false; error: string } {
  const data = asObject(payload);
  if (!data) return { ok: false, error: 'Payload must be a JSON object' };
  if (!Number.isInteger(data.expected_version)) return { ok: false, error: "Field 'expected_version' must be an integer" };
  if (typeof data.route_id !== 'string' || data.route_id.length === 0) return { ok: false, error: "Field 'route_id' must be a non-empty string" };
  if (!isIsoDateTime(data.selected_at)) return { ok: false, error: "Field 'selected_at' must be an ISO timestamp" };
  return { ok: true, value: data as unknown as RouteSelectionPayload };
}

function validateContinuationPayload(payload: unknown): { ok: true; value: ContinuationPayload } | { ok: false; error: string } {
  const data = asObject(payload);
  if (!data) return { ok: false, error: 'Payload must be a JSON object' };

  if (!asObject(data.handoff_token)) {
    return { ok: false, error: "Field 'handoff_token' must be an object" };
  }
  if (!asObject(data.effective_execution_contract)) {
    return { ok: false, error: "Field 'effective_execution_contract' must be an object" };
  }
  if (data.created_at !== undefined && !isIsoDateTime(data.created_at)) {
    return { ok: false, error: "Field 'created_at' must be an ISO timestamp" };
  }

  return { ok: true, value: data as unknown as ContinuationPayload };
}

export async function handleTaskCreate(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const validation = validateTaskCreatePayload(body.value);
  if (!validation.ok) return badRequest(validation.error);

  try {
    const created = getTaskService(env).createTask(validation.value);
    return jsonResponse({ task: created }, 201);
  } catch (error) {
    const mapped = taskErrorResponse(error);
    if (mapped) return mapped;
    return badRequest(error instanceof Error ? error.message : 'Failed to create task');
  }
}

export function handleTaskGet(env: Env, taskId: string): Response {
  try {
    return jsonResponse({ task: getTaskService(env).getTask(taskId) });
  } catch (error) {
    return taskErrorResponse(error) ?? jsonResponse({ error: { code: 'internal_error', message: 'Unexpected task load error' } }, 500);
  }
}

export async function handleTaskTransitionState(request: Request, env: Env, taskId: string): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const validation = validateTaskStatePayload(body.value);
  if (!validation.ok) return badRequest(validation.error);

  try {
    const updated = getTaskService(env).transitionState(taskId, validation.value);
    return jsonResponse({ task: updated });
  } catch (error) {
    const mapped = taskErrorResponse(error);
    if (mapped) return mapped;
    return badRequest(error instanceof Error ? error.message : 'Failed to transition task state');
  }
}

export async function handleTaskRouteSelection(request: Request, env: Env, taskId: string): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const validation = validateRouteSelectionPayload(body.value);
  if (!validation.ok) return badRequest(validation.error);

  try {
    const updated = getTaskService(env).selectRoute(taskId, validation.value);
    return jsonResponse({ task: updated });
  } catch (error) {
    const mapped = taskErrorResponse(error);
    if (mapped) return mapped;
    return badRequest(error instanceof Error ? error.message : 'Failed to select task route');
  }
}

export async function handleTaskContinuation(request: Request, env: Env, taskId: string): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const validation = validateContinuationPayload(body.value);
  if (!validation.ok) return badRequest(validation.error);

  if (!env.HANDOFF_TOKEN_SIGNING_KEY) {
    return jsonResponse({ error: { code: 'handoff_signing_key_missing', message: 'Handoff token signing key is not configured' } }, 500);
  }

  const handoffToken = validation.value.handoff_token as { token_id?: unknown };
  const tokenId = typeof handoffToken.token_id === 'string' ? handoffToken.token_id : null;
  const fingerprint = JSON.stringify({
    task_id: taskId,
    token_id: tokenId,
    effective_execution_contract: validation.value.effective_execution_contract,
  });

  if (tokenId) {
    const existingFingerprint = getContinuationFingerprint(tokenId);
    if (existingFingerprint && existingFingerprint !== fingerprint) {
      return jsonResponse({
        error: {
          code: 'handoff_token_forbidden',
          message: `Continuation replay fingerprint mismatch for token ${tokenId}`,
        },
      }, 403);
    }
  }

  const replayed = Boolean(tokenId && getContinuationFingerprint(tokenId) === fingerprint);

  try {
    const continuation_package = getTaskService(env).createContinuation(taskId, validation.value);

    if (tokenId && !getContinuationFingerprint(tokenId)) {
      setContinuationFingerprint(tokenId, fingerprint);
    }

    return jsonResponse({ continuation_package }, replayed ? 200 : 201);
  } catch (error) {
    const mapped = taskErrorResponse(error);
    if (mapped) return mapped;
    return badRequest(error instanceof Error ? error.message : 'Failed to create continuation package');
  }
}

export function handleTaskProgressEvents(env: Env, taskId: string): Response {
  try {
    return jsonResponse({ events: getTaskService(env).listProgressEvents(taskId) });
  } catch (error) {
    return taskErrorResponse(error) ?? jsonResponse({ error: { code: 'internal_error', message: 'Unexpected task progress event error' } }, 500);
  }
}

export function handleTaskReadiness(env: Env, taskId: string): Response {
  try {
    return jsonResponse({ readiness: getTaskService(env).getReadiness(taskId) });
  } catch (error) {
    return taskErrorResponse(error) ?? jsonResponse({ error: { code: 'internal_error', message: 'Unexpected task readiness error' } }, 500);
  }
}

export function handleTaskSnapshots(env: Env, taskId: string, version: string | null): Response {
  try {
    if (!version) {
      return jsonResponse({ snapshots: getTaskService(env).listSnapshots(taskId) });
    }

    const snapshotVersion = Number(version);
    if (!Number.isInteger(snapshotVersion) || snapshotVersion <= 0) {
      return badRequest("Path parameter 'version' must be a positive integer");
    }
    return jsonResponse({ snapshot: getTaskService(env).getSnapshot(taskId, snapshotVersion) });
  } catch (error) {
    return taskErrorResponse(error) ?? jsonResponse({ error: { code: 'internal_error', message: 'Unexpected task snapshot error' } }, 500);
  }
}
