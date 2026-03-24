import { badRequest, jsonResponse, readJsonBody } from '../http';
import { getContinuationFingerprint, getTaskService, setContinuationFingerprint, taskErrorResponse } from '../task-runtime';
import type { Env } from '../types';
import {
  validateTaskCreatePayload,
  validateTaskStatePayload,
  validateRouteSelectionPayload,
  validateContinuationPayload,
  validateAppendFindingPayload,
  validateTransitionFindingsPayload,
} from '../validation/tasks';

export async function handleTaskGet(env: Env, taskId: string): Promise<Response> {
  try {
    return jsonResponse({ task: await getTaskService(env).getTask(taskId) });
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
    const updated = await getTaskService(env).transitionState(taskId, validation.value);
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
    const updated = await getTaskService(env).selectRoute(taskId, validation.value);
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
    const continuation_package = await getTaskService(env).createContinuation(taskId, validation.value);

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

export async function handleTaskProgressEvents(env: Env, taskId: string): Promise<Response> {
  try {
    return jsonResponse({ events: await getTaskService(env).listProgressEvents(taskId) });
  } catch (error) {
    return taskErrorResponse(error) ?? jsonResponse({ error: { code: 'internal_error', message: 'Unexpected task progress event error' } }, 500);
  }
}

export async function handleTaskReadiness(env: Env, taskId: string): Promise<Response> {
  try {
    return jsonResponse({ readiness: await getTaskService(env).getReadiness(taskId) });
  } catch (error) {
    return taskErrorResponse(error) ?? jsonResponse({ error: { code: 'internal_error', message: 'Unexpected task readiness error' } }, 500);
  }
}

export async function handleTaskSnapshots(env: Env, taskId: string, version: string | null): Promise<Response> {
  try {
    if (!version) {
      return jsonResponse({ snapshots: await getTaskService(env).listSnapshots(taskId) });
    }

    const snapshotVersion = Number(version);
    if (!Number.isInteger(snapshotVersion) || snapshotVersion <= 0) {
      return badRequest("Path parameter 'version' must be a positive integer");
    }
    return jsonResponse({ snapshot: await getTaskService(env).getSnapshot(taskId, snapshotVersion) });
  } catch (error) {
    return taskErrorResponse(error) ?? jsonResponse({ error: { code: 'internal_error', message: 'Unexpected task snapshot error' } }, 500);
  }
}

function parseTaskListLimit(value: string | null): { ok: true; value: number } | { ok: false; response: Response } {
  if (value === null) {
    return { ok: true, value: 20 };
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { ok: false, response: badRequest("Query parameter 'limit' must be a positive integer") };
  }

  return { ok: true, value: Math.min(parsed, 100) };
}

function parseUpdatedWithinSeconds(value: string | null): { ok: true; value: number | undefined } | { ok: false; response: Response } {
  if (value === null) {
    return { ok: true, value: undefined };
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { ok: false, response: badRequest("Query parameter 'updated_within' must be a positive number") };
  }

  return { ok: true, value: parsed };
}

export async function handleTaskList(env: Env, url: URL): Promise<Response> {
  const status = url.searchParams.get('status') ?? undefined;
  const limit = parseTaskListLimit(url.searchParams.get('limit'));
  if (!limit.ok) return limit.response;

  const updatedWithinSeconds = parseUpdatedWithinSeconds(url.searchParams.get('updated_within'));
  if (!updatedWithinSeconds.ok) return updatedWithinSeconds.response;

  try {
    const tasks = await getTaskService(env).listRecentTasks({ status, limit: limit.value, updatedWithinSeconds: updatedWithinSeconds.value });
    return jsonResponse({ tasks });
  } catch (error) {
    return taskErrorResponse(error) ?? jsonResponse({ error: { code: 'internal_error', message: 'Unexpected task list error' } }, 500);
  }
}

export async function handleTaskByCode(env: Env, shortCode: string): Promise<Response> {
  try {
    const task = await getTaskService(env).getTaskByCode(shortCode);
    return jsonResponse({ task });
  } catch (error) {
    return taskErrorResponse(error) ?? jsonResponse({ error: { code: 'internal_error', message: 'Unexpected error looking up task by code' } }, 500);
  }
}

export async function handleTaskByName(env: Env, nameOrSlug: string): Promise<Response> {
  try {
    const task = await getTaskService(env).getTaskByName(nameOrSlug);
    return jsonResponse({ task });
  } catch (error) {
    return taskErrorResponse(error) ?? jsonResponse({ error: { code: 'internal_error', message: 'Unexpected error looking up task by name' } }, 500);
  }
}

export async function handleHubLatest(env: Env): Promise<Response> {
  try {
    const task = await getTaskService(env).getLatestActiveTask();
    if (!task) {
      return jsonResponse({ task: null, message: 'No active tasks found' });
    }
    return jsonResponse({ task });
  } catch (error) {
    return taskErrorResponse(error) ?? jsonResponse({ error: { code: 'internal_error', message: 'Unexpected error fetching latest task' } }, 500);
  }
}

export async function handleTaskAppendFinding(request: Request, env: Env, taskId: string): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const validation = validateAppendFindingPayload(body.value);
  if (!validation.ok) return badRequest(validation.error);

  try {
    const updated = await getTaskService(env).appendFinding(taskId, validation.value);
    return jsonResponse({ task: updated }, 201);
  } catch (error) {
    const mapped = taskErrorResponse(error);
    if (mapped) return mapped;
    return badRequest(error instanceof Error ? error.message : 'Failed to append finding');
  }
}

export async function handleTaskTransitionFindings(request: Request, env: Env, taskId: string): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const validation = validateTransitionFindingsPayload(body.value);
  if (!validation.ok) return badRequest(validation.error);

  try {
    const updated = await getTaskService(env).transitionFindingsForRouteUpgrade(taskId, validation.value);
    return jsonResponse({ task: updated });
  } catch (error) {
    const mapped = taskErrorResponse(error);
    if (mapped) return mapped;
    return badRequest(error instanceof Error ? error.message : 'Failed to transition findings');
  }
}

export async function handleTaskCreate(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const validation = validateTaskCreatePayload(body.value);
  if (!validation.ok) return badRequest(validation.error);

  try {
    const created = await getTaskService(env).createTask(validation.value);
    return jsonResponse({ task: created }, 201);
  } catch (error) {
    const mapped = taskErrorResponse(error);
    if (mapped) return mapped;
    return badRequest(error instanceof Error ? error.message : 'Failed to create task');
  }
}
