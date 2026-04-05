import { jsonResponse, readJsonBody } from "../http";
import {
  contractErrorResponse,
  contractSuccessResponse,
  WORKER_CAPABILITY,
} from "../contracts";
import {
  getContinuationFingerprint,
  getTaskService,
  getTaskStore,
  setContinuationFingerprint,
  taskErrorResponse,
} from "../task-runtime";
import { deriveAuthenticatedRequest } from "../auth";
import {
  resolveMutationContext,
  type TaskContextResolver,
} from "../task-mutation-context";
import {
  buildTaskCommand,
  deriveDeterministicIdempotencyKey,
  type TaskCommandType,
} from "../task-command";
import type { Env } from "../types";
import {
  validateTaskCreatePayload,
  validateTaskStatePayload,
  validateRouteSelectionPayload,
  validateContinuationPayload,
  validateAppendFindingPayload,
  validateTransitionFindingsPayload,
  validateAnswerQuestionPayload,
  validateDismissQuestionPayload,
} from "../validation/tasks";

const TASK_AVAILABLE_ROUTES: Record<string, string[]> = {
  review_repository: [
    "local_repo",
    "github_pr",
    "uploaded_bundle",
    "pasted_diff",
  ],
};

/**
 * Create a task context resolver for the given environment
 * Wraps task store lookups to extract boundary context for mutation resolution
 */
function createTaskContextResolver(env: Env): TaskContextResolver {
  return async (taskId: string) => {
    try {
      const store = getTaskStore(env);
      const task = await store.load(taskId);
      if (!task) return null;

      return {
        task_id: taskId,
        owner_principal_id: task.owner_principal_id ?? "owner",
        workspace_id: task.workspace_id ?? "default",
        repo_id: task.repo_id,
        version: task.version,
      };
    } catch {
      return null;
    }
  };
}

function taskSummary(task: Record<string, unknown>): string {
  const state = String(task.state ?? "unknown");
  const name = String(task.name ?? task.task_id ?? "task");
  return `Task "${name}" is ${state}.`;
}

function taskMeta(task: Record<string, unknown>): Record<string, unknown> {
  const findings = Array.isArray(task.findings) ? task.findings : [];
  const questions = findings.filter(
    (f: unknown) => (f as Record<string, unknown>)?.status === "open_question",
  );
  const blockers = findings.filter(
    (f: unknown) => (f as Record<string, unknown>)?.status === "blocked",
  );
  return {
    urgency:
      blockers.length > 0
        ? "blocked"
        : questions.length > 0
          ? "needs_input"
          : "normal",
    open_questions: questions.length,
    blocker_count: blockers.length,
    best_next_route: task.current_route ?? task.initial_route ?? null,
    verification_count: findings.filter(
      (f: unknown) => (f as Record<string, unknown>)?.status === "verified",
    ).length,
  };
}

function validationError(message: string): Response {
  return contractErrorResponse({
    resource: "tasks.error",
    data: null,
    summary: message,
    capability: WORKER_CAPABILITY,
    error: {
      code: "validation_error",
      message,
      hint: "Fix the request body and retry.",
    },
  });
}

function internalError(message: string): Response {
  return contractErrorResponse(
    {
      resource: "tasks.error",
      data: null,
      summary: message,
      capability: WORKER_CAPABILITY,
      error: {
        code: "internal_error",
        message,
        hint: "Retry the request or inspect server logs.",
      },
    },
    500,
  );
}

function resolveValidatedContext(
  requestContext: Record<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  if (typeof requestContext.route_id === "string") {
    resolved.route_id = requestContext.route_id;
  }
  if (
    requestContext.model_path &&
    typeof requestContext.model_path === "object" &&
    !Array.isArray(requestContext.model_path)
  ) {
    resolved.model_path = requestContext.model_path;
  }
  if (typeof requestContext.request_id === "string") {
    resolved.request_id = requestContext.request_id;
  }
  if (typeof requestContext.trace_id === "string") {
    resolved.trace_id = requestContext.trace_id;
  }
  return resolved;
}

function toMutationReceiptData(
  result: Record<string, unknown>,
): Record<string, unknown> {
  return {
    action_id: result.action_id,
    task_id: result.task_id,
    resulting_task_version: result.resulting_task_version,
    replayed: result.replayed,
    projection_status: result.projection_status,
  };
}

export async function handleTaskGet(
  env: Env,
  taskId: string,
): Promise<Response> {
  try {
    const task = (await getTaskService(env).getTask(taskId)) as Record<
      string,
      unknown
    >;
    return contractSuccessResponse({
      resource: "tasks.get",
      data: { task },
      summary: taskSummary(task),
      capability: WORKER_CAPABILITY,
      meta: taskMeta(task),
    });
  } catch (error) {
    return (
      taskErrorResponse(error) ?? internalError("Unexpected task load error")
    );
  }
}

export async function handleTaskTransitionState(
  request: Request,
  env: Env,
  taskId: string,
): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const validation = validateTaskStatePayload(body.value);
  if (!validation.ok) return validationError(validation.error);

  try {
    // Step 1: Resolve mutation context (principal, boundary, authority)
    const authenticatedRequest = deriveAuthenticatedRequest(request);
    const taskContextResolver = createTaskContextResolver(env);
    const allowedActions: TaskCommandType[] = [
      "task.select_route",
      "task.transition_state",
      "task.append_finding",
      "task.create",
      "task.create_continuation",
    ];

    const contextResult = await resolveMutationContext(
      authenticatedRequest,
      taskId,
      "task.transition_state",
      {
        next_state: validation.value.next_state,
        next_action: validation.value.next_action,
      },
      taskContextResolver,
      allowedActions,
    );

    if (!contextResult.ok) {
      return validationError(
        contextResult.error === "unauthorized"
          ? "Not authorized to transition state"
          : contextResult.error === "task_not_found"
            ? "Task not found"
            : contextResult.error === "workspace_mismatch"
              ? "Workspace mismatch"
              : "Invalid mutation context",
      );
    }

    const context = contextResult.context!;

    // Step 2: Build authoritative command envelope
    const commandPayload = {
      next_state: validation.value.next_state,
      next_action: validation.value.next_action,
    };
    const idempotencyKey = deriveDeterministicIdempotencyKey({
      command_type: "task.transition_state",
      task_id: taskId,
      expected_task_version: validation.value.expected_version ?? null,
      payload: commandPayload,
      caller_key:
        typeof validation.value.idempotency_key === "string"
          ? validation.value.idempotency_key
          : undefined,
    });

    const command = buildTaskCommand({
      task_id: taskId,
      idempotency_key: idempotencyKey,
      expected_task_version: validation.value.expected_version ?? null,
      command_type: "task.transition_state",
      payload: commandPayload,
      principal: context.principal,
      boundary: context.boundary,
      authority: context.authority,
      request_context: context.request_context,
      resolved_context: resolveValidatedContext(
        context.request_context as Record<string, unknown>,
      ),
    });

    // Step 3: Execute mutation via authoritative store with command envelope
    const updated = (await getTaskService(env).transitionState(
      taskId,
      validation.value,
      command,
    )) as Record<string, unknown>;
    return contractSuccessResponse({
      resource: "tasks.state",
      data: toMutationReceiptData(updated),
      summary: "Task state transition accepted.",
      capability: WORKER_CAPABILITY,
    });
  } catch (error) {
    const mapped = taskErrorResponse(error);
    if (mapped) return mapped;
    return validationError(
      error instanceof Error
        ? error.message
        : "Failed to transition task state",
    );
  }
}

export async function handleTaskRouteSelection(
  request: Request,
  env: Env,
  taskId: string,
): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const validation = validateRouteSelectionPayload(body.value);
  if (!validation.ok) return validationError(validation.error);

  try {
    // Step 1: Resolve mutation context (principal, boundary, authority)
    const authenticatedRequest = deriveAuthenticatedRequest(request);
    const taskContextResolver = createTaskContextResolver(env);
    const allowedActions: TaskCommandType[] = [
      "task.select_route",
      "task.transition_state",
      "task.append_finding",
      "task.create",
      "task.create_continuation",
    ];

    const contextResult = await resolveMutationContext(
      authenticatedRequest,
      taskId,
      "task.select_route",
      {
        route_id: validation.value.route_id,
        selected_at: validation.value.selected_at,
      },
      taskContextResolver,
      allowedActions,
    );

    if (!contextResult.ok) {
      return validationError(
        contextResult.error === "unauthorized"
          ? "Not authorized to select route"
          : contextResult.error === "task_not_found"
            ? "Task not found"
            : contextResult.error === "workspace_mismatch"
              ? "Workspace mismatch"
              : "Invalid mutation context",
      );
    }

    const context = contextResult.context!;

    // Step 2: Build authoritative command envelope
    const commandPayload = {
      route_id: validation.value.route_id,
    };
    const idempotencyKey = deriveDeterministicIdempotencyKey({
      command_type: "task.select_route",
      task_id: taskId,
      expected_task_version: validation.value.expected_version ?? null,
      payload: commandPayload,
      caller_key:
        typeof validation.value.idempotency_key === "string"
          ? validation.value.idempotency_key
          : undefined,
    });

    const command = buildTaskCommand({
      task_id: taskId,
      idempotency_key: idempotencyKey,
      expected_task_version: validation.value.expected_version ?? null,
      command_type: "task.select_route",
      payload: commandPayload,
      principal: context.principal,
      boundary: context.boundary,
      authority: context.authority,
      request_context: context.request_context,
      resolved_context: resolveValidatedContext(
        context.request_context as Record<string, unknown>,
      ),
    });

    // Step 3: Execute mutation via authoritative store with command envelope
    const updated = (await getTaskService(env).selectRoute(
      taskId,
      validation.value,
      command,
    )) as Record<string, unknown>;

    return contractSuccessResponse({
      resource: "tasks.route_selection",
      data: toMutationReceiptData(updated),
      summary: "Route selection accepted.",
      capability: WORKER_CAPABILITY,
    });
  } catch (error) {
    const mapped = taskErrorResponse(error);
    if (mapped) return mapped;
    return validationError(
      error instanceof Error ? error.message : "Failed to select task route",
    );
  }
}

export async function handleTaskContinuation(
  request: Request,
  env: Env,
  taskId: string,
): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const validation = validateContinuationPayload(body.value);
  if (!validation.ok) return validationError(validation.error);

  if (!env.HANDOFF_TOKEN_SIGNING_KEY) {
    return contractErrorResponse(
      {
        resource: "tasks.error",
        data: null,
        summary: "Handoff token signing key is not configured.",
        capability: WORKER_CAPABILITY,
        error: {
          code: "handoff_signing_key_missing",
          message: "Handoff token signing key is not configured",
          hint: "Set the HANDOFF_TOKEN_SIGNING_KEY environment variable on the Worker.",
        },
      },
      500,
    );
  }

  const handoffToken = validation.value.handoff_token as { token_id?: unknown };
  const tokenId =
    typeof handoffToken.token_id === "string" ? handoffToken.token_id : null;
  const fingerprint = JSON.stringify({
    task_id: taskId,
    token_id: tokenId,
    effective_execution_contract: validation.value.effective_execution_contract,
  });

  if (tokenId) {
    const existingFingerprint = getContinuationFingerprint(tokenId);
    if (existingFingerprint && existingFingerprint !== fingerprint) {
      const msg = `Continuation replay fingerprint mismatch for token ${tokenId}`;
      return contractErrorResponse(
        {
          resource: "tasks.error",
          data: null,
          summary: msg,
          capability: WORKER_CAPABILITY,
          error: {
            code: "handoff_token_forbidden",
            message: msg,
            hint: "Request a new handoff token.",
          },
        },
        403,
      );
    }
  }

  const replayed = Boolean(
    tokenId && getContinuationFingerprint(tokenId) === fingerprint,
  );

  try {
    const continuation_package = await getTaskService(env).createContinuation(
      taskId,
      validation.value,
    );

    if (tokenId && !getContinuationFingerprint(tokenId)) {
      setContinuationFingerprint(tokenId, fingerprint);
    }

    return contractSuccessResponse(
      {
        resource: "tasks.continue",
        data: { continuation_package },
        summary: replayed
          ? "Continuation package replayed."
          : "Continuation package created.",
        capability: WORKER_CAPABILITY,
      },
      replayed ? 200 : 201,
    );
  } catch (error) {
    const mapped = taskErrorResponse(error);
    if (mapped) return mapped;
    return validationError(
      error instanceof Error
        ? error.message
        : "Failed to create continuation package",
    );
  }
}

export async function handleTaskProgressEvents(
  env: Env,
  taskId: string,
): Promise<Response> {
  try {
    const events = (await getTaskService(env).listProgressEvents(
      taskId,
    )) as unknown[];
    return contractSuccessResponse({
      resource: "tasks.events",
      data: { events },
      summary: `${events.length} progress event(s).`,
      capability: WORKER_CAPABILITY,
    });
  } catch (error) {
    return (
      taskErrorResponse(error) ??
      internalError("Unexpected task progress event error")
    );
  }
}

export async function handleTaskReadiness(
  env: Env,
  taskId: string,
): Promise<Response> {
  try {
    const readiness = (await getTaskService(env).getReadiness(
      taskId,
    )) as Record<string, unknown>;
    const ready = readiness?.ready === true;
    return contractSuccessResponse({
      resource: "tasks.readiness",
      data: { readiness },
      summary: ready ? "Task is ready to continue." : "Task is not yet ready.",
      capability: WORKER_CAPABILITY,
    });
  } catch (error) {
    return (
      taskErrorResponse(error) ??
      internalError("Unexpected task readiness error")
    );
  }
}

export async function handleTaskSnapshots(
  env: Env,
  taskId: string,
  version: string | null,
): Promise<Response> {
  try {
    if (!version) {
      const snapshots = (await getTaskService(env).listSnapshots(
        taskId,
      )) as unknown[];
      return contractSuccessResponse({
        resource: "tasks.snapshots",
        data: { snapshots },
        summary: `${snapshots.length} snapshot(s) available.`,
        capability: WORKER_CAPABILITY,
      });
    }

    const snapshotVersion = Number(version);
    if (!Number.isInteger(snapshotVersion) || snapshotVersion <= 0) {
      return validationError(
        "Path parameter 'version' must be a positive integer",
      );
    }
    const snapshot = await getTaskService(env).getSnapshot(
      taskId,
      snapshotVersion,
    );
    return contractSuccessResponse({
      resource: "tasks.snapshots",
      data: { snapshot },
      summary: `Snapshot at version ${snapshotVersion}.`,
      capability: WORKER_CAPABILITY,
    });
  } catch (error) {
    return (
      taskErrorResponse(error) ??
      internalError("Unexpected task snapshot error")
    );
  }
}

function parseTaskListLimit(
  value: string | null,
): { ok: true; value: number } | { ok: false; response: Response } {
  if (value === null) {
    return { ok: true, value: 20 };
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return {
      ok: false,
      response: validationError(
        "Query parameter 'limit' must be a positive integer",
      ),
    };
  }

  return { ok: true, value: Math.min(parsed, 100) };
}

function parseUpdatedWithinSeconds(
  value: string | null,
): { ok: true; value: number | undefined } | { ok: false; response: Response } {
  if (value === null) {
    return { ok: true, value: undefined };
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      ok: false,
      response: validationError(
        "Query parameter 'updated_within' must be a positive number",
      ),
    };
  }

  return { ok: true, value: parsed };
}

export async function handleTaskList(env: Env, url: URL): Promise<Response> {
  const status = url.searchParams.get("status") ?? undefined;
  const limit = parseTaskListLimit(url.searchParams.get("limit"));
  if (!limit.ok) return limit.response;

  const updatedWithinSeconds = parseUpdatedWithinSeconds(
    url.searchParams.get("updated_within"),
  );
  if (!updatedWithinSeconds.ok) return updatedWithinSeconds.response;

  try {
    const tasks = (await getTaskService(env).listRecentTasks({
      status,
      limit: limit.value,
      updatedWithinSeconds: updatedWithinSeconds.value,
    })) as unknown[];
    return contractSuccessResponse({
      resource: "tasks.list",
      data: { tasks },
      summary: `${tasks.length} task(s).`,
      capability: WORKER_CAPABILITY,
    });
  } catch (error) {
    return (
      taskErrorResponse(error) ?? internalError("Unexpected task list error")
    );
  }
}

export async function handleTaskByCode(
  env: Env,
  shortCode: string,
): Promise<Response> {
  try {
    const task = (await getTaskService(env).getTaskByCode(shortCode)) as Record<
      string,
      unknown
    >;
    return contractSuccessResponse({
      resource: "tasks.get",
      data: { task },
      summary: taskSummary(task),
      capability: WORKER_CAPABILITY,
      meta: taskMeta(task),
    });
  } catch (error) {
    return (
      taskErrorResponse(error) ??
      internalError("Unexpected error looking up task by code")
    );
  }
}

export async function handleTaskByName(
  env: Env,
  nameOrSlug: string,
): Promise<Response> {
  try {
    const task = (await getTaskService(env).getTaskByName(
      nameOrSlug,
    )) as Record<string, unknown>;
    return contractSuccessResponse({
      resource: "tasks.get",
      data: { task },
      summary: taskSummary(task),
      capability: WORKER_CAPABILITY,
      meta: taskMeta(task),
    });
  } catch (error) {
    return (
      taskErrorResponse(error) ??
      internalError("Unexpected error looking up task by name")
    );
  }
}

export async function handleHubLatest(env: Env): Promise<Response> {
  try {
    const task = (await getTaskService(env).getLatestActiveTask()) as Record<
      string,
      unknown
    > | null;
    if (!task) {
      return contractSuccessResponse({
        resource: "tasks.hub_latest",
        data: { task: null },
        summary: "No active tasks found.",
        capability: WORKER_CAPABILITY,
      });
    }
    return contractSuccessResponse({
      resource: "tasks.hub_latest",
      data: { task },
      summary: taskSummary(task),
      capability: WORKER_CAPABILITY,
      meta: taskMeta(task),
    });
  } catch (error) {
    return (
      taskErrorResponse(error) ??
      internalError("Unexpected error fetching latest task")
    );
  }
}

export async function handleTaskAppendFinding(
  request: Request,
  env: Env,
  taskId: string,
): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const validation = validateAppendFindingPayload(body.value);
  if (!validation.ok) return validationError(validation.error);

  try {
    // Step 1: Resolve mutation context (principal, boundary, authority)
    const authenticatedRequest = deriveAuthenticatedRequest(request);
    const taskContextResolver = createTaskContextResolver(env);
    const allowedActions: TaskCommandType[] = [
      "task.select_route",
      "task.transition_state",
      "task.append_finding",
      "task.create",
      "task.create_continuation",
    ];

    const contextResult = await resolveMutationContext(
      authenticatedRequest,
      taskId,
      "task.append_finding",
      {
        finding: validation.value.finding,
      },
      taskContextResolver,
      allowedActions,
    );

    if (!contextResult.ok) {
      return validationError(
        contextResult.error === "unauthorized"
          ? "Not authorized to append finding"
          : contextResult.error === "task_not_found"
            ? "Task not found"
            : contextResult.error === "workspace_mismatch"
              ? "Workspace mismatch"
              : "Invalid mutation context",
      );
    }

    const context = contextResult.context!;

    // Step 2: Build authoritative command envelope
    const commandPayload = {
      finding: validation.value.finding,
    };
    const idempotencyKey = deriveDeterministicIdempotencyKey({
      command_type: "task.append_finding",
      task_id: taskId,
      expected_task_version: validation.value.expected_version ?? null,
      payload: commandPayload,
      caller_key:
        typeof validation.value.idempotency_key === "string"
          ? validation.value.idempotency_key
          : undefined,
    });

    const command = buildTaskCommand({
      task_id: taskId,
      idempotency_key: idempotencyKey,
      expected_task_version: validation.value.expected_version ?? null,
      command_type: "task.append_finding",
      payload: commandPayload,
      principal: context.principal,
      boundary: context.boundary,
      authority: context.authority,
      request_context: context.request_context,
      resolved_context: resolveValidatedContext(
        context.request_context as Record<string, unknown>,
      ),
    });

    // Step 3: Execute mutation via authoritative store with command envelope
    const updated = (await getTaskService(env).appendFinding(
      taskId,
      validation.value,
      command,
    )) as Record<string, unknown>;
    return contractSuccessResponse(
      {
        resource: "tasks.finding_recorded",
        data: toMutationReceiptData(updated),
        summary: "Finding append accepted.",
        capability: WORKER_CAPABILITY,
      },
      201,
    );
  } catch (error) {
    const mapped = taskErrorResponse(error);
    if (mapped) return mapped;
    return validationError(
      error instanceof Error ? error.message : "Failed to append finding",
    );
  }
}

export async function handleTaskTransitionFindings(
  request: Request,
  env: Env,
  taskId: string,
): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const validation = validateTransitionFindingsPayload(body.value);
  if (!validation.ok) return validationError(validation.error);

  try {
    const updated = (await getTaskService(
      env,
    ).transitionFindingsForRouteUpgrade(taskId, validation.value)) as Record<
      string,
      unknown
    >;
    return contractSuccessResponse({
      resource: "tasks.findings_transitioned",
      data: { task: updated },
      summary: taskSummary(updated),
      capability: WORKER_CAPABILITY,
      meta: taskMeta(updated),
    });
  } catch (error) {
    const mapped = taskErrorResponse(error);
    if (mapped) return mapped;
    return validationError(
      error instanceof Error ? error.message : "Failed to transition findings",
    );
  }
}

function toQuestionFindingId(questionId: string): string {
  return decodeURIComponent(questionId);
}

export async function handleTaskAnswerQuestion(
  request: Request,
  env: Env,
  taskId: string,
  questionId: string,
): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const validation = validateAnswerQuestionPayload(body.value);
  if (!validation.ok) return validationError(validation.error);

  const answeredAt = validation.value.answered_at || new Date().toISOString();
  const questionFindingId = toQuestionFindingId(questionId);

  const answerKey =
    validation.value.idempotency_key ||
    `${taskId}:${questionFindingId}:${validation.value.expected_version}:${validation.value.answer.trim()}`;
  const stableAnswerId = `answer_${encodeURIComponent(answerKey).replace(/%/g, "_")}`;

  try {
    const updated = await getTaskService(env).appendFinding(taskId, {
      expected_version: validation.value.expected_version,
      finding: {
        findingId: stableAnswerId,
        summary: `Answer: ${validation.value.answer.trim()}`,
        status: "verified",
        recordedByRoute: validation.value.answered_by_route || "hub",
        recordedAt: answeredAt,
        note: `Question ${questionFindingId}\nAnswer: ${validation.value.answer.trim()}`,
      },
      updated_at: answeredAt,
    });
    return contractSuccessResponse(
      {
        resource: "tasks.answer_question",
        data: { task: updated },
        summary: taskSummary(updated),
        capability: WORKER_CAPABILITY,
        meta: taskMeta(updated),
      },
      201,
    );
  } catch (error) {
    const mapped = taskErrorResponse(error);
    if (mapped) return mapped;
    return validationError(
      error instanceof Error ? error.message : "Failed to answer question",
    );
  }
}

export async function handleTaskDismissQuestion(
  request: Request,
  env: Env,
  taskId: string,
  questionId: string,
): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const validation = validateDismissQuestionPayload(body.value);
  if (!validation.ok) return validationError(validation.error);

  const dismissedAt = validation.value.dismissed_at || new Date().toISOString();
  const questionFindingId = toQuestionFindingId(questionId);
  const reason = validation.value.reason?.trim();

  const dismissKey =
    validation.value.idempotency_key ||
    `${taskId}:${questionFindingId}:${validation.value.expected_version}:${reason ?? ""}`;
  const stableDismissId = `dismiss_${encodeURIComponent(dismissKey).replace(/%/g, "_")}`;

  try {
    const updated = await getTaskService(env).appendFinding(taskId, {
      expected_version: validation.value.expected_version,
      finding: {
        findingId: stableDismissId,
        summary: reason
          ? `Dismissed: ${reason}`
          : `Dismissed question ${questionFindingId}`,
        status: "invalidated",
        recordedByRoute: validation.value.dismissed_by_route || "hub",
        recordedAt: dismissedAt,
        note: reason || `Question ${questionFindingId} dismissed`,
      },
      updated_at: dismissedAt,
    });
    return contractSuccessResponse(
      {
        resource: "tasks.dismiss_question",
        data: { task: updated },
        summary: taskSummary(updated),
        capability: WORKER_CAPABILITY,
        meta: taskMeta(updated),
      },
      201,
    );
  } catch (error) {
    const mapped = taskErrorResponse(error);
    if (mapped) return mapped;
    return validationError(
      error instanceof Error ? error.message : "Failed to dismiss question",
    );
  }
}

export async function handleTaskAvailableRoutes(
  env: Env,
  taskId: string,
): Promise<Response> {
  try {
    const task = (await getTaskService(env).getTask(taskId)) as Record<
      string,
      unknown
    >;
    const taskType = String(task.task_type ?? "");
    const currentRoute = String(task.current_route ?? "");
    const availableRoutes = TASK_AVAILABLE_ROUTES[taskType] ?? [currentRoute];
    const bestNextRoute =
      taskType === "review_repository" && currentRoute !== "local_repo"
        ? "local_repo"
        : currentRoute;
    const routeData = {
      task_id: taskId,
      task_type: taskType,
      current_route: currentRoute,
      best_next_route: bestNextRoute,
      available_routes: availableRoutes.map((route_id) => ({ route_id })),
    };
    return contractSuccessResponse({
      resource: "tasks.available_routes",
      data: routeData,
      summary: `${availableRoutes.length} route(s) available. Best next: ${bestNextRoute}.`,
      capability: WORKER_CAPABILITY,
    });
  } catch (error) {
    return (
      taskErrorResponse(error) ??
      internalError("Unexpected task route availability error")
    );
  }
}

export async function handleTaskProjectionRepair(
  env: Env,
  taskId: string,
): Promise<Response> {
  try {
    const store = getTaskStore(env) as {
      repairProjection?: (id: string) => Promise<Record<string, unknown>>;
    };
    if (typeof store.repairProjection !== "function") {
      return validationError(
        "Projection repair is only available when command store mode is authoritative.",
      );
    }
    const repair = await store.repairProjection(taskId);
    return contractSuccessResponse({
      resource: "tasks.projection_repair",
      data: repair,
      summary: "Projection repair completed.",
      capability: WORKER_CAPABILITY,
    });
  } catch (error) {
    const mapped = taskErrorResponse(error);
    if (mapped) return mapped;
    return validationError(
      error instanceof Error ? error.message : "Failed to repair projection",
    );
  }
}

export async function handleTaskCreate(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const validation = validateTaskCreatePayload(body.value);
  if (!validation.ok) return validationError(validation.error);

  try {
    const created = (await getTaskService(env).createTask(
      validation.value,
    )) as Record<string, unknown>;
    return contractSuccessResponse(
      {
        resource: "tasks.create",
        data: { task: created },
        summary: taskSummary(created),
        capability: WORKER_CAPABILITY,
        meta: taskMeta(created),
      },
      201,
    );
  } catch (error) {
    const mapped = taskErrorResponse(error);
    if (mapped) return mapped;
    return validationError(
      error instanceof Error ? error.message : "Failed to create task",
    );
  }
}
