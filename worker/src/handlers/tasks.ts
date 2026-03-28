import { jsonResponse, readJsonBody } from '../http';
import { contractErrorResponse, WORKER_CAPABILITY } from '../contracts';
import { getContinuationFingerprint, getTaskService, setContinuationFingerprint, taskErrorResponse } from '../task-runtime';
import type { Env } from '../types';
import {
  validateTaskCreatePayload,
  validateTaskStatePayload,
  validateRouteSelectionPayload,
  validateContinuationPayload,
  validateAppendFindingPayload,
  validateTransitionFindingsPayload,
  validateAnswerQuestionPayload,
  validateDismissQuestionPayload,
} from '../validation/tasks';

const TASK_AVAILABLE_ROUTES: Record<string, string[]> = {
  review_repository: ['local_repo', 'github_pr', 'uploaded_bundle', 'pasted_diff'],
};

function validationError(message: string): Response {
  return contractErrorResponse({
    resource: 'tasks.error',
    data: null,
    summary: message,
    capability: WORKER_CAPABILITY,
    error: { code: 'validation_error', message, hint: 'Fix the request body and retry.' },
  });
}

function internalError(message: string): Response {
  return contractErrorResponse({
    resource: 'tasks.error',
    data: null,
    summary: message,
    capability: WORKER_CAPABILITY,
    error: { code: 'internal_error', message, hint: 'Retry the request or inspect server logs.' },
  }, 500);
}

export async function handleTaskGet(env: Env, taskId: string): Promise<Response> {
  try {
    return jsonResponse({ task: await getTaskService(env).getTask(taskId) });
  } catch (error) {
    return taskErrorResponse(error) ?? internalError('Unexpected task load error');
  }
}

export async function handleTaskTransitionState(request: Request, env: Env, taskId: string): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const validation = validateTaskStatePayload(body.value);
  if (!validation.ok) return validationError(validation.error);

  try {
    const updated = await getTaskService(env).transitionState(taskId, validation.value);
    return jsonResponse({ task: updated });
  } catch (error) {
    const mapped = taskErrorResponse(error);
    if (mapped) return mapped;
    return validationError(error instanceof Error ? error.message : 'Failed to transition task state');
  }
}

export async function handleTaskRouteSelection(request: Request, env: Env, taskId: string): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const validation = validateRouteSelectionPayload(body.value);
  if (!validation.ok) return validationError(validation.error);

  try {
    const updated = await getTaskService(env).selectRoute(taskId, validation.value);
    return jsonResponse({ task: updated });
  } catch (error) {
    const mapped = taskErrorResponse(error);
    if (mapped) return mapped;
    return validationError(error instanceof Error ? error.message : 'Failed to select task route');
  }
}

export async function handleTaskContinuation(request: Request, env: Env, taskId: string): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const validation = validateContinuationPayload(body.value);
  if (!validation.ok) return validationError(validation.error);

  if (!env.HANDOFF_TOKEN_SIGNING_KEY) {
    return contractErrorResponse({
      resource: 'tasks.error',
      data: null,
      summary: 'Handoff token signing key is not configured.',
      capability: WORKER_CAPABILITY,
      error: {
        code: 'handoff_signing_key_missing',
        message: 'Handoff token signing key is not configured',
        hint: 'Set the HANDOFF_TOKEN_SIGNING_KEY environment variable on the Worker.',
      },
    }, 500);
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
      const msg = `Continuation replay fingerprint mismatch for token ${tokenId}`;
      return contractErrorResponse({
        resource: 'tasks.error',
        data: null,
        summary: msg,
        capability: WORKER_CAPABILITY,
        error: { code: 'handoff_token_forbidden', message: msg, hint: 'Request a new handoff token.' },
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
    return validationError(error instanceof Error ? error.message : 'Failed to create continuation package');
  }
}

export async function handleTaskProgressEvents(env: Env, taskId: string): Promise<Response> {
  try {
    return jsonResponse({ events: await getTaskService(env).listProgressEvents(taskId) });
  } catch (error) {
    return taskErrorResponse(error) ?? internalError('Unexpected task progress event error');
  }
}

export async function handleTaskReadiness(env: Env, taskId: string): Promise<Response> {
  try {
    return jsonResponse({ readiness: await getTaskService(env).getReadiness(taskId) });
  } catch (error) {
    return taskErrorResponse(error) ?? internalError('Unexpected task readiness error');
  }
}

export async function handleTaskSnapshots(env: Env, taskId: string, version: string | null): Promise<Response> {
  try {
    if (!version) {
      return jsonResponse({ snapshots: await getTaskService(env).listSnapshots(taskId) });
    }

    const snapshotVersion = Number(version);
    if (!Number.isInteger(snapshotVersion) || snapshotVersion <= 0) {
      return validationError("Path parameter 'version' must be a positive integer");
    }
    return jsonResponse({ snapshot: await getTaskService(env).getSnapshot(taskId, snapshotVersion) });
  } catch (error) {
    return taskErrorResponse(error) ?? internalError('Unexpected task snapshot error');
  }
}

function parseTaskListLimit(value: string | null): { ok: true; value: number } | { ok: false; response: Response } {
  if (value === null) {
    return { ok: true, value: 20 };
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { ok: false, response: validationError("Query parameter 'limit' must be a positive integer") };
  }

  return { ok: true, value: Math.min(parsed, 100) };
}

function parseUpdatedWithinSeconds(value: string | null): { ok: true; value: number | undefined } | { ok: false; response: Response } {
  if (value === null) {
    return { ok: true, value: undefined };
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { ok: false, response: validationError("Query parameter 'updated_within' must be a positive number") };
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
    return taskErrorResponse(error) ?? internalError('Unexpected task list error');
  }
}

export async function handleTaskByCode(env: Env, shortCode: string): Promise<Response> {
  try {
    const task = await getTaskService(env).getTaskByCode(shortCode);
    return jsonResponse({ task });
  } catch (error) {
    return taskErrorResponse(error) ?? internalError('Unexpected error looking up task by code');
  }
}

export async function handleTaskByName(env: Env, nameOrSlug: string): Promise<Response> {
  try {
    const task = await getTaskService(env).getTaskByName(nameOrSlug);
    return jsonResponse({ task });
  } catch (error) {
    return taskErrorResponse(error) ?? internalError('Unexpected error looking up task by name');
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
    return taskErrorResponse(error) ?? internalError('Unexpected error fetching latest task');
  }
}

export async function handleTaskAppendFinding(request: Request, env: Env, taskId: string): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const validation = validateAppendFindingPayload(body.value);
  if (!validation.ok) return validationError(validation.error);

  try {
    const updated = await getTaskService(env).appendFinding(taskId, validation.value);
    return jsonResponse({ task: updated }, 201);
  } catch (error) {
    const mapped = taskErrorResponse(error);
    if (mapped) return mapped;
    return validationError(error instanceof Error ? error.message : 'Failed to append finding');
  }
}

export async function handleTaskTransitionFindings(request: Request, env: Env, taskId: string): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const validation = validateTransitionFindingsPayload(body.value);
  if (!validation.ok) return validationError(validation.error);

  try {
    const updated = await getTaskService(env).transitionFindingsForRouteUpgrade(taskId, validation.value);
    return jsonResponse({ task: updated });
  } catch (error) {
    const mapped = taskErrorResponse(error);
    if (mapped) return mapped;
    return validationError(error instanceof Error ? error.message : 'Failed to transition findings');
  }
}

function toQuestionFindingId(questionId: string): string {
  return decodeURIComponent(questionId);
}

export async function handleTaskAnswerQuestion(request: Request, env: Env, taskId: string, questionId: string): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const validation = validateAnswerQuestionPayload(body.value);
  if (!validation.ok) return validationError(validation.error);

  const answeredAt = validation.value.answered_at || new Date().toISOString();
  const questionFindingId = toQuestionFindingId(questionId);

  try {
    const updated = await getTaskService(env).appendFinding(taskId, {
      expected_version: validation.value.expected_version,
      finding: {
        findingId: `answer_${Date.now()}`,
        summary: `Answer: ${validation.value.answer.trim()}`,
        status: 'verified',
        recordedByRoute: validation.value.answered_by_route || 'hub',
        recordedAt: answeredAt,
        note: `Question ${questionFindingId}\nAnswer: ${validation.value.answer.trim()}`,
      },
      updated_at: answeredAt,
    });
    return jsonResponse({ task: updated }, 201);
  } catch (error) {
    const mapped = taskErrorResponse(error);
    if (mapped) return mapped;
    return validationError(error instanceof Error ? error.message : 'Failed to answer question');
  }
}

export async function handleTaskDismissQuestion(request: Request, env: Env, taskId: string, questionId: string): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const validation = validateDismissQuestionPayload(body.value);
  if (!validation.ok) return validationError(validation.error);

  const dismissedAt = validation.value.dismissed_at || new Date().toISOString();
  const questionFindingId = toQuestionFindingId(questionId);
  const reason = validation.value.reason?.trim();

  try {
    const updated = await getTaskService(env).appendFinding(taskId, {
      expected_version: validation.value.expected_version,
      finding: {
        findingId: `dismiss_${Date.now()}`,
        summary: reason ? `Dismissed: ${reason}` : `Dismissed question ${questionFindingId}`,
        status: 'invalidated',
        recordedByRoute: validation.value.dismissed_by_route || 'hub',
        recordedAt: dismissedAt,
        note: reason || `Question ${questionFindingId} dismissed`,
      },
      updated_at: dismissedAt,
    });
    return jsonResponse({ task: updated }, 201);
  } catch (error) {
    const mapped = taskErrorResponse(error);
    if (mapped) return mapped;
    return validationError(error instanceof Error ? error.message : 'Failed to dismiss question');
  }
}

export async function handleTaskAvailableRoutes(env: Env, taskId: string): Promise<Response> {
  try {
    const task = await getTaskService(env).getTask(taskId);
    const availableRoutes = TASK_AVAILABLE_ROUTES[task.task_type] || [task.current_route];
    const bestNextRoute = task.task_type === 'review_repository' && task.current_route !== 'local_repo'
      ? 'local_repo'
      : task.current_route;
    return jsonResponse({
      task_id: taskId,
      task_type: task.task_type,
      current_route: task.current_route,
      best_next_route: bestNextRoute,
      available_routes: availableRoutes.map((route_id) => ({ route_id })),
    });
  } catch (error) {
    return taskErrorResponse(error) ?? internalError('Unexpected task route availability error');
  }
}

export async function handleTaskCreate(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const validation = validateTaskCreatePayload(body.value);
  if (!validation.ok) return validationError(validation.error);

  try {
    const created = await getTaskService(env).createTask(validation.value);
    return jsonResponse({ task: created }, 201);
  } catch (error) {
    const mapped = taskErrorResponse(error);
    if (mapped) return mapped;
    return validationError(error instanceof Error ? error.message : 'Failed to create task');
  }
}
