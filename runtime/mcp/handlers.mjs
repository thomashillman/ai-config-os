import { MCP_TOOL_MAP } from "./tool-definitions.mjs";
import { attachCapabilityProfile } from "../lib/capability-profile.mjs";
import { createRuntimeActionDispatcher } from "../lib/runtime-action-dispatcher.mjs";
import {
  createCapability,
  createSuccessEnvelope,
} from "../lib/contracts/envelope.mjs";

export function createCallToolHandler(deps) {
  const {
    runScript,
    validateName,
    validateNumber,
    isCommandNameSafe,
    resolveEffectiveOutcomeContract,
    toToolResponse,
    toolError,
    getCapabilityProfile,
    readFlags,
    taskService,
    momentumEngine,
    callWorkerTaskApi,
  } = deps;
  const runtimeActionDispatcher = createRuntimeActionDispatcher({
    runScript,
    validateNumber,
  });

  function mcpCapability() {
    return createCapability({
      worker_backed: false,
      local_only: true,
      remote_safe: false,
      tunnel_required: false,
      unavailable_on_surface: false,
    });
  }

  function successResponse(resource, data, summary, capabilityProfile) {
    const envelope = createSuccessEnvelope({
      resource,
      data,
      summary,
      capability: mcpCapability(),
    });
    return attachCapabilityProfile(
      {
        content: [{ type: "text", text: JSON.stringify(envelope, null, 2) }],
        structuredContent: envelope,
      },
      capabilityProfile,
    );
  }

  function requireTaskService(capabilityProfile) {
    if (!taskService) {
      return toolError(
        "Task service is not configured for this MCP runtime",
        capabilityProfile,
        { resource: "tasks.service" },
      );
    }

    return null;
  }

  function requireWorkerTaskApi(capabilityProfile) {
    if (typeof callWorkerTaskApi !== "function") {
      return toolError(
        "Worker task API client is not configured for this MCP runtime",
        capabilityProfile,
      );
    }
    return null;
  }

  function summariseTask(task, extras = {}) {
    const findings = Array.isArray(task?.findings) ? task.findings : [];
    const findingQuestions = findings.filter((finding) => {
      const status = finding?.provenance?.status || "unknown";
      return (
        finding?.type === "question" &&
        status !== "invalidated" &&
        status !== "verified"
      );
    });
    const unresolvedQuestions = Array.isArray(task?.unresolved_questions)
      ? task.unresolved_questions.filter((question) => Boolean(question))
      : [];
    const blockingQuestions =
      unresolvedQuestions.length > 0 ? unresolvedQuestions : findingQuestions;
    const verificationState = findings.reduce((acc, finding) => {
      const status = finding?.provenance?.status || "unknown";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    const urgency =
      blockingQuestions.length > 0
        ? "high"
        : task?.state === "active"
          ? "medium"
          : "low";
    const bestNextRoute =
      extras.best_next_route ||
      (task?.task_type === "review_repository" &&
      task?.current_route !== "local_repo"
        ? "local_repo"
        : task?.current_route);

    const summary = [
      `Task ${task?.task_id || "unknown"} is ${task?.state || "unknown"}`,
      `${blockingQuestions.length} blocking question${blockingQuestions.length === 1 ? "" : "s"}`,
      `best next route: ${bestNextRoute || "unknown"}`,
    ].join("; ");

    return {
      summary,
      data: {
        task,
        urgency,
        blocking_questions: blockingQuestions,
        verification_state: verificationState,
        best_next_route: bestNextRoute,
        ...extras,
      },
    };
  }

  return async function handleCallTool(request) {
    const { name, arguments: args } = request.params;
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({
      toolName: name,
      executionChannel: "mcp",
    });
    const capabilityProfile =
      typeof getCapabilityProfile === "function"
        ? await getCapabilityProfile()
        : null;

    if (readFlags !== undefined && readFlags !== null) {
      const flags = readFlags();
      if (
        flags.effective_contract_required &&
        effectiveOutcomeContract.outcomeId === null
      ) {
        return toolError(
          `No outcome route for tool '${name}': effective_contract_required is enabled in manifest`,
          capabilityProfile,
          { resource: name, code: "contract_required" },
        );
      }
    }

    if (!MCP_TOOL_MAP.has(name)) {
      return toolError(`Unknown tool: ${name}`, capabilityProfile, {
        resource: name,
        code: "unknown_tool",
      });
    }

    switch (name) {
      case "resolve_outcome_contract": {
        const targetToolName = args?.tool_name || "";
        const contract = resolveEffectiveOutcomeContract({
          toolName: targetToolName,
          executionChannel: "mcp",
        });
        return successResponse(
          "outcome.contract.resolve",
          contract,
          "Resolved outcome contract.",
          capabilityProfile,
        );
      }
      case "sync_tools":
      case "list_tools":
      case "get_config":
      case "skill_stats":
      case "context_cost":
      case "validate_all": {
        try {
          const result = runtimeActionDispatcher.dispatch(name, args);
          return toToolResponse(
            result,
            effectiveOutcomeContract,
            capabilityProfile,
            name,
          );
        } catch (err) {
          return toolError(
            err.message || "Invalid arguments",
            capabilityProfile,
            { resource: name, code: "invalid_arguments" },
          );
        }
      }
      case "mcp_list": {
        const result = runScript("runtime/adapters/mcp-adapter.sh", ["list"]);
        return toToolResponse(
          result,
          effectiveOutcomeContract,
          capabilityProfile,
          name,
        );
      }
      case "mcp_add": {
        try {
          validateName(args?.name);
          if (!isCommandNameSafe(args?.command)) {
            return toolError(
              "Invalid command: must be a simple command name (alphanumeric, dash, underscore)",
              capabilityProfile,
              { resource: name, code: "invalid_command" },
            );
          }
          const result = runScript("runtime/adapters/mcp-adapter.sh", [
            "add",
            args.name,
            args.command,
            ...(Array.isArray(args?.args) ? args.args : []),
          ]);
          return toToolResponse(
            result,
            effectiveOutcomeContract,
            capabilityProfile,
            name,
          );
        } catch (err) {
          return toolError(
            err.message || "Invalid arguments",
            capabilityProfile,
            { resource: name, code: "invalid_arguments" },
          );
        }
      }
      case "task_start_review_repository": {
        const missingService = requireTaskService(capabilityProfile);
        if (missingService) return missingService;
        try {
          const result = taskService.startReviewRepositoryTask({
            taskId: args?.task_id,
            goal: args?.goal,
            routeInputs: args?.route_inputs,
            capabilityProfile: args?.capability_profile,
            narrator: momentumEngine?.narrator || null,
            observer: momentumEngine?.observer || null,
          });
          return successResponse(
            name,
            result,
            "Task started.",
            capabilityProfile,
          );
        } catch (err) {
          return toolError(
            err.message || "Invalid arguments",
            capabilityProfile,
            { resource: name, code: "invalid_arguments" },
          );
        }
      }
      case "task_resume_review_repository": {
        const missingService = requireTaskService(capabilityProfile);
        if (missingService) return missingService;
        try {
          const result = taskService.resumeReviewRepositoryTask({
            taskId: args?.task_id,
            capabilityProfile: args?.capability_profile,
            narrator: momentumEngine?.narrator || null,
            observer: momentumEngine?.observer || null,
          });
          return successResponse(
            name,
            result,
            "Task resumed.",
            capabilityProfile,
          );
        } catch (err) {
          return toolError(
            err.message || "Invalid arguments",
            capabilityProfile,
            { resource: name, code: "invalid_arguments" },
          );
        }
      }
      case "task_get_readiness": {
        const missingService = requireTaskService(capabilityProfile);
        if (missingService) return missingService;
        try {
          const readiness = taskService.getReadiness(args?.task_id);
          return successResponse(
            name,
            { readiness },
            "Task readiness loaded.",
            capabilityProfile,
          );
        } catch (err) {
          return toolError(
            err.message || "Invalid arguments",
            capabilityProfile,
            { resource: name, code: "invalid_arguments" },
          );
        }
      }

      case "tasks.list": {
        const missingWorker = requireWorkerTaskApi(capabilityProfile);
        if (missingWorker) return missingWorker;
        try {
          const searchParams = new URLSearchParams();
          if (args?.status) searchParams.set("status", args.status);
          if (args?.limit !== undefined)
            searchParams.set("limit", String(args.limit));
          if (args?.updated_within !== undefined)
            searchParams.set("updated_within", String(args.updated_within));
          const suffix = searchParams.toString()
            ? `?${searchParams.toString()}`
            : "";
          const response = await callWorkerTaskApi({
            method: "GET",
            path: `/v1/tasks${suffix}`,
          });
          const tasks = Array.isArray(response.tasks) ? response.tasks : [];
          const summary = `Loaded ${tasks.length} task${tasks.length === 1 ? "" : "s"}.`;
          return attachCapabilityProfile(
            {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ summary, data: { tasks } }, null, 2),
                },
              ],
            },
            capabilityProfile,
          );
        } catch (err) {
          return toolError(
            err.message || "Failed to list tasks",
            capabilityProfile,
          );
        }
      }

      case "tasks.get": {
        const missingWorker = requireWorkerTaskApi(capabilityProfile);
        if (missingWorker) return missingWorker;
        try {
          const response = await callWorkerTaskApi({
            method: "GET",
            path: `/v1/tasks/${encodeURIComponent(args?.task_id || "")}`,
          });
          const shaped = summariseTask(response.task || {});
          return attachCapabilityProfile(
            {
              content: [
                { type: "text", text: JSON.stringify(shaped, null, 2) },
              ],
            },
            capabilityProfile,
          );
        } catch (err) {
          return toolError(
            err.message || "Failed to get task",
            capabilityProfile,
          );
        }
      }

      case "tasks.events": {
        const missingWorker = requireWorkerTaskApi(capabilityProfile);
        if (missingWorker) return missingWorker;
        try {
          const taskId = encodeURIComponent(args?.task_id || "");
          const [taskResponse, eventsResponse] = await Promise.all([
            callWorkerTaskApi({ method: "GET", path: `/v1/tasks/${taskId}` }),
            callWorkerTaskApi({
              method: "GET",
              path: `/v1/tasks/${taskId}/progress-events`,
            }),
          ]);
          const events = Array.isArray(eventsResponse.events)
            ? eventsResponse.events
            : [];
          const shaped = summariseTask(taskResponse.task || {}, { events });
          shaped.summary = `${shaped.summary}; ${events.length} progress event${events.length === 1 ? "" : "s"}.`;
          return attachCapabilityProfile(
            {
              content: [
                { type: "text", text: JSON.stringify(shaped, null, 2) },
              ],
            },
            capabilityProfile,
          );
        } catch (err) {
          return toolError(
            err.message || "Failed to list task events",
            capabilityProfile,
          );
        }
      }

      case "tasks.answer_question": {
        const missingWorker = requireWorkerTaskApi(capabilityProfile);
        if (missingWorker) return missingWorker;
        try {
          const taskId = encodeURIComponent(args?.task_id || "");
          const questionId = encodeURIComponent(args?.question_id || "");
          const response = await callWorkerTaskApi({
            method: "POST",
            path: `/v1/tasks/${taskId}/questions/${questionId}/answer`,
            body: {
              expected_version: args?.expected_version,
              answer: args?.answer,
              answered_by_route: args?.answered_by_route,
              answered_at: args?.answered_at,
            },
          });
          const shaped = summariseTask(response.task || {});
          shaped.summary = `Recorded answer for question '${args?.question_id}'. ${shaped.summary}`;
          return attachCapabilityProfile(
            {
              content: [
                { type: "text", text: JSON.stringify(shaped, null, 2) },
              ],
            },
            capabilityProfile,
          );
        } catch (err) {
          return toolError(
            err.message || "Failed to answer question",
            capabilityProfile,
          );
        }
      }

      case "tasks.dismiss_question": {
        const missingWorker = requireWorkerTaskApi(capabilityProfile);
        if (missingWorker) return missingWorker;
        try {
          const taskId = encodeURIComponent(args?.task_id || "");
          const questionId = encodeURIComponent(args?.question_id || "");
          const response = await callWorkerTaskApi({
            method: "POST",
            path: `/v1/tasks/${taskId}/questions/${questionId}/dismiss`,
            body: {
              expected_version: args?.expected_version,
              reason: args?.reason,
              dismissed_by_route: args?.dismissed_by_route,
              dismissed_at: args?.dismissed_at,
            },
          });
          const shaped = summariseTask(response.task || {});
          shaped.summary = `Dismissed question '${args?.question_id}'. ${shaped.summary}`;
          return attachCapabilityProfile(
            {
              content: [
                { type: "text", text: JSON.stringify(shaped, null, 2) },
              ],
            },
            capabilityProfile,
          );
        } catch (err) {
          return toolError(
            err.message || "Failed to dismiss question",
            capabilityProfile,
          );
        }
      }

      case "tasks.continue": {
        const missingWorker = requireWorkerTaskApi(capabilityProfile);
        if (missingWorker) return missingWorker;
        try {
          const taskId = encodeURIComponent(args?.task_id || "");
          const continuation = await callWorkerTaskApi({
            method: "POST",
            path: `/v1/tasks/${taskId}/continuation`,
            body: {
              handoff_token: args?.handoff_token,
              effective_execution_contract: args?.effective_execution_contract,
              created_at: args?.created_at,
            },
          });
          const taskResponse = await callWorkerTaskApi({
            method: "GET",
            path: `/v1/tasks/${taskId}`,
          });
          const shaped = summariseTask(taskResponse.task || {}, {
            continuation_package: continuation.continuation_package,
          });
          shaped.summary = `Created continuation package for ${args?.task_id}. ${shaped.summary}`;
          return attachCapabilityProfile(
            {
              content: [
                { type: "text", text: JSON.stringify(shaped, null, 2) },
              ],
            },
            capabilityProfile,
          );
        } catch (err) {
          return toolError(
            err.message || "Failed to create continuation",
            capabilityProfile,
          );
        }
      }

      case "tasks.available_routes": {
        const missingWorker = requireWorkerTaskApi(capabilityProfile);
        if (missingWorker) return missingWorker;
        try {
          const taskId = encodeURIComponent(args?.task_id || "");
          const [taskResponse, routeResponse] = await Promise.all([
            callWorkerTaskApi({ method: "GET", path: `/v1/tasks/${taskId}` }),
            callWorkerTaskApi({
              method: "GET",
              path: `/v1/tasks/${taskId}/available-routes`,
            }),
          ]);
          const availableRoutes = Array.isArray(routeResponse.available_routes)
            ? routeResponse.available_routes
            : [];
          const shaped = summariseTask(taskResponse.task || {}, {
            available_routes: availableRoutes,
            best_next_route: routeResponse.best_next_route,
          });
          shaped.summary = `${shaped.summary}; ${availableRoutes.length} route option${availableRoutes.length === 1 ? "" : "s"} available.`;
          return attachCapabilityProfile(
            {
              content: [
                { type: "text", text: JSON.stringify(shaped, null, 2) },
              ],
            },
            capabilityProfile,
          );
        } catch (err) {
          return toolError(
            err.message || "Failed to load available routes",
            capabilityProfile,
          );
        }
      }
      case "momentum_narrate": {
        if (!momentumEngine)
          return toolError(
            "Momentum engine is not configured",
            capabilityProfile,
            { resource: name, code: "capability_unavailable" },
          );
        const missingService = requireTaskService(capabilityProfile);
        if (missingService) return missingService;
        try {
          const task = taskService.getTask(args?.task_id);
          const point = args?.narration_point;
          let narration;
          if (point === "onStart" || point === "onResume") {
            narration = momentumEngine[
              point === "onStart" ? "narrateStart" : "narrateResume"
            ](task, null, null);
          } else if (point === "onFindingEvolved") {
            const finding = (task.findings || []).find(
              (f) => f.finding_id === args?.finding_id,
            );
            if (!finding)
              return toolError(
                `Finding '${args?.finding_id}' not found on task`,
                capabilityProfile,
                { resource: name, code: "finding_not_found" },
              );
            narration = momentumEngine.narrateFindingEvolved(
              task,
              finding,
              args?.previous_confidence || "hypothesis",
              args?.new_confidence || "verified",
            );
          } else if (point === "onUpgradeAvailable") {
            narration = momentumEngine.narrateUpgradeAvailable(
              task,
              null,
              null,
            );
          } else {
            return toolError(
              `Unknown narration point: ${point}`,
              capabilityProfile,
              { resource: name, code: "invalid_arguments" },
            );
          }
          return successResponse(
            name,
            narration,
            "Momentum narration generated.",
            capabilityProfile,
          );
        } catch (err) {
          return toolError(
            err.message || "Narration failed",
            capabilityProfile,
            { resource: name, code: "narration_failed" },
          );
        }
      }
      case "momentum_shelf": {
        if (!momentumEngine)
          return toolError(
            "Momentum engine is not configured",
            capabilityProfile,
            { resource: name, code: "capability_unavailable" },
          );
        const missingService = requireTaskService(capabilityProfile);
        if (missingService) return missingService;
        try {
          const tasks = await taskService.listRecentTasks({ limit: 50 });
          const shelf = momentumEngine.buildShelf({
            tasks: Array.isArray(tasks) ? tasks : [],
            currentCapabilities: args?.capability_profile || capabilityProfile,
          });
          return successResponse(
            name,
            { shelf },
            "Momentum shelf generated.",
            capabilityProfile,
          );
        } catch (err) {
          return toolError(
            err.message || "Shelf build failed",
            capabilityProfile,
            { resource: name, code: "shelf_failed" },
          );
        }
      }
      case "momentum_reflect": {
        if (!momentumEngine)
          return toolError(
            "Momentum engine is not configured",
            capabilityProfile,
            { resource: name, code: "capability_unavailable" },
          );
        try {
          const result = momentumEngine.reflect({
            since: args?.since,
            limit: 200,
          });
          if (args?.auto_apply && result.report.insights.length > 0) {
            const minConfidence = args?.min_confidence ?? 0.7;
            const applied = [];
            for (const insight of result.report.insights) {
              const outcome = momentumEngine.applyInsight(insight, {
                minConfidence,
              });
              if (outcome.applied) applied.push(outcome);
            }
            result.applied = applied;
          }
          return successResponse(
            name,
            result,
            "Momentum reflection completed.",
            capabilityProfile,
          );
        } catch (err) {
          return toolError(
            err.message || "Reflection failed",
            capabilityProfile,
            { resource: name, code: "reflection_failed" },
          );
        }
      }
      case "momentum_resolve_intent": {
        if (!momentumEngine)
          return toolError(
            "Momentum engine is not configured",
            capabilityProfile,
            { resource: name, code: "capability_unavailable" },
          );
        try {
          const result = momentumEngine.resolveIntent(args?.phrase);
          return successResponse(
            name,
            result,
            "Intent resolution completed.",
            capabilityProfile,
          );
        } catch (err) {
          return toolError(
            err.message || "Intent resolution failed",
            capabilityProfile,
            { resource: name, code: "intent_failed" },
          );
        }
      }
      case "momentum_record_response": {
        if (!momentumEngine)
          return toolError(
            "Momentum engine is not configured",
            capabilityProfile,
            { resource: name, code: "capability_unavailable" },
          );
        try {
          const event = momentumEngine.recordUserResponse({
            taskId: args?.task_id,
            narrationEventId: args?.narration_event_id,
            responseType: args?.response_type,
            timeToActionMs: args?.time_to_action_ms,
            followUpText: args?.follow_up_text,
          });
          return successResponse(
            name,
            { recorded: true, event_id: event.event_id },
            "Response recorded.",
            capabilityProfile,
          );
        } catch (err) {
          return toolError(
            err.message || "Response recording failed",
            capabilityProfile,
            { resource: name, code: "record_response_failed" },
          );
        }
      }
      case "mcp_remove": {
        try {
          validateName(args?.name);
          const result = runScript("runtime/adapters/mcp-adapter.sh", [
            "remove",
            args.name,
          ]);
          return toToolResponse(
            result,
            effectiveOutcomeContract,
            capabilityProfile,
            name,
          );
        } catch (err) {
          return toolError(
            err.message || "Invalid arguments",
            capabilityProfile,
            { resource: name, code: "invalid_arguments" },
          );
        }
      }
      default:
        return toolError(`Unknown tool: ${name}`, capabilityProfile, {
          resource: name,
          code: "unknown_tool",
        });
    }
  };
}
