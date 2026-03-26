import { MCP_TOOL_MAP } from './tool-definitions.mjs';
import { attachCapabilityProfile } from '../lib/capability-profile.mjs';
import { createRuntimeActionDispatcher } from '../lib/runtime-action-dispatcher.mjs';
import { createCapability, createSuccessEnvelope } from '../lib/contracts/envelope.mjs';

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
  } = deps;
  const runtimeActionDispatcher = createRuntimeActionDispatcher({ runScript, validateNumber });

  function mcpCapability() {
    return createCapability({ worker_backed: false, local_only: true, remote_safe: false, tunnel_required: false, unavailable_on_surface: false });
  }

  function successResponse(resource, data, summary, capabilityProfile) {
    const envelope = createSuccessEnvelope({ resource, data, summary, capability: mcpCapability() });
    return attachCapabilityProfile({ content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }], structuredContent: envelope }, capabilityProfile);
  }

  function requireTaskService(capabilityProfile) {
    if (!taskService) {
      return toolError('Task service is not configured for this MCP runtime', capabilityProfile, { resource: 'tasks.service' });
    }

    return null;
  }

  return async function handleCallTool(request) {
    const { name, arguments: args } = request.params;
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({ toolName: name, executionChannel: 'mcp' });
    const capabilityProfile = typeof getCapabilityProfile === 'function' ? await getCapabilityProfile() : null;

    if (readFlags !== undefined && readFlags !== null) {
      const flags = readFlags();
      if (flags.effective_contract_required && effectiveOutcomeContract.outcomeId === null) {
        return toolError(`No outcome route for tool '${name}': effective_contract_required is enabled in manifest`, capabilityProfile, { resource: name, code: 'contract_required' });
      }
    }

    if (!MCP_TOOL_MAP.has(name)) {
      return toolError(`Unknown tool: ${name}`, capabilityProfile, { resource: name, code: 'unknown_tool' });
    }

    switch (name) {
      case 'resolve_outcome_contract': {
        const targetToolName = args?.tool_name || '';
        const contract = resolveEffectiveOutcomeContract({ toolName: targetToolName, executionChannel: 'mcp' });
        return successResponse('outcome.contract.resolve', contract, 'Resolved outcome contract.', capabilityProfile);
      }
      case 'sync_tools':
      case 'list_tools':
      case 'get_config':
      case 'skill_stats':
      case 'context_cost':
      case 'validate_all': {
        try {
          const result = runtimeActionDispatcher.dispatch(name, args);
          return toToolResponse(result, effectiveOutcomeContract, capabilityProfile, name);
        } catch (err) {
          return toolError(err.message || 'Invalid arguments', capabilityProfile, { resource: name, code: 'invalid_arguments' });
        }
      }
      case 'mcp_list': {
        const result = runScript('runtime/adapters/mcp-adapter.sh', ['list']);
        return toToolResponse(result, effectiveOutcomeContract, capabilityProfile, name);
      }
      case 'mcp_add': {
        try {
          validateName(args?.name);
          if (!isCommandNameSafe(args?.command)) {
            return toolError('Invalid command: must be a simple command name (alphanumeric, dash, underscore)', capabilityProfile, { resource: name, code: 'invalid_command' });
          }
          const result = runScript('runtime/adapters/mcp-adapter.sh', ['add', args.name, args.command, ...(Array.isArray(args?.args) ? args.args : [])]);
          return toToolResponse(result, effectiveOutcomeContract, capabilityProfile, name);
        } catch (err) {
          return toolError(err.message || 'Invalid arguments', capabilityProfile, { resource: name, code: 'invalid_arguments' });
        }
      }
      case 'task_start_review_repository': {
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
          return successResponse(name, result, 'Task started.', capabilityProfile);
        } catch (err) {
          return toolError(err.message || 'Invalid arguments', capabilityProfile, { resource: name, code: 'invalid_arguments' });
        }
      }
      case 'task_resume_review_repository': {
        const missingService = requireTaskService(capabilityProfile);
        if (missingService) return missingService;
        try {
          const result = taskService.resumeReviewRepositoryTask({
            taskId: args?.task_id,
            capabilityProfile: args?.capability_profile,
            narrator: momentumEngine?.narrator || null,
            observer: momentumEngine?.observer || null,
          });
          return successResponse(name, result, 'Task resumed.', capabilityProfile);
        } catch (err) {
          return toolError(err.message || 'Invalid arguments', capabilityProfile, { resource: name, code: 'invalid_arguments' });
        }
      }
      case 'task_get_readiness': {
        const missingService = requireTaskService(capabilityProfile);
        if (missingService) return missingService;
        try {
          const readiness = taskService.getReadiness(args?.task_id);
          return successResponse(name, { readiness }, 'Task readiness loaded.', capabilityProfile);
        } catch (err) {
          return toolError(err.message || 'Invalid arguments', capabilityProfile, { resource: name, code: 'invalid_arguments' });
        }
      }
      case 'momentum_narrate': {
        if (!momentumEngine) return toolError('Momentum engine is not configured', capabilityProfile, { resource: name, code: 'capability_unavailable' });
        const missingService = requireTaskService(capabilityProfile);
        if (missingService) return missingService;
        try {
          const task = taskService.getTask(args?.task_id);
          const point = args?.narration_point;
          let narration;
          if (point === 'onStart' || point === 'onResume') {
            narration = momentumEngine[point === 'onStart' ? 'narrateStart' : 'narrateResume'](task, null, null);
          } else if (point === 'onFindingEvolved') {
            const finding = (task.findings || []).find((f) => f.finding_id === args?.finding_id);
            if (!finding) return toolError(`Finding '${args?.finding_id}' not found on task`, capabilityProfile, { resource: name, code: 'finding_not_found' });
            narration = momentumEngine.narrateFindingEvolved(task, finding, args?.previous_confidence || 'hypothesis', args?.new_confidence || 'verified');
          } else if (point === 'onUpgradeAvailable') {
            narration = momentumEngine.narrateUpgradeAvailable(task, null, null);
          } else {
            return toolError(`Unknown narration point: ${point}`, capabilityProfile, { resource: name, code: 'invalid_arguments' });
          }
          return successResponse(name, narration, 'Momentum narration generated.', capabilityProfile);
        } catch (err) {
          return toolError(err.message || 'Narration failed', capabilityProfile, { resource: name, code: 'narration_failed' });
        }
      }
      case 'momentum_shelf': {
        if (!momentumEngine) return toolError('Momentum engine is not configured', capabilityProfile, { resource: name, code: 'capability_unavailable' });
        const missingService = requireTaskService(capabilityProfile);
        if (missingService) return missingService;
        try {
          const tasks = await taskService.listRecentTasks({ limit: 50 });
          const shelf = momentumEngine.buildShelf({ tasks: Array.isArray(tasks) ? tasks : [], currentCapabilities: args?.capability_profile || capabilityProfile });
          return successResponse(name, { shelf }, 'Momentum shelf generated.', capabilityProfile);
        } catch (err) {
          return toolError(err.message || 'Shelf build failed', capabilityProfile, { resource: name, code: 'shelf_failed' });
        }
      }
      case 'momentum_reflect': {
        if (!momentumEngine) return toolError('Momentum engine is not configured', capabilityProfile, { resource: name, code: 'capability_unavailable' });
        try {
          const result = momentumEngine.reflect({ since: args?.since, limit: 200 });
          if (args?.auto_apply && result.report.insights.length > 0) {
            const minConfidence = args?.min_confidence ?? 0.7;
            const applied = [];
            for (const insight of result.report.insights) {
              const outcome = momentumEngine.applyInsight(insight, { minConfidence });
              if (outcome.applied) applied.push(outcome);
            }
            result.applied = applied;
          }
          return successResponse(name, result, 'Momentum reflection completed.', capabilityProfile);
        } catch (err) {
          return toolError(err.message || 'Reflection failed', capabilityProfile, { resource: name, code: 'reflection_failed' });
        }
      }
      case 'momentum_resolve_intent': {
        if (!momentumEngine) return toolError('Momentum engine is not configured', capabilityProfile, { resource: name, code: 'capability_unavailable' });
        try {
          const result = momentumEngine.resolveIntent(args?.phrase);
          return successResponse(name, result, 'Intent resolution completed.', capabilityProfile);
        } catch (err) {
          return toolError(err.message || 'Intent resolution failed', capabilityProfile, { resource: name, code: 'intent_failed' });
        }
      }
      case 'momentum_record_response': {
        if (!momentumEngine) return toolError('Momentum engine is not configured', capabilityProfile, { resource: name, code: 'capability_unavailable' });
        try {
          const event = momentumEngine.recordUserResponse({
            taskId: args?.task_id,
            narrationEventId: args?.narration_event_id,
            responseType: args?.response_type,
            timeToActionMs: args?.time_to_action_ms,
            followUpText: args?.follow_up_text,
          });
          return successResponse(name, { recorded: true, event_id: event.event_id }, 'Response recorded.', capabilityProfile);
        } catch (err) {
          return toolError(err.message || 'Response recording failed', capabilityProfile, { resource: name, code: 'record_response_failed' });
        }
      }
      case 'mcp_remove': {
        try {
          validateName(args?.name);
          const result = runScript('runtime/adapters/mcp-adapter.sh', ['remove', args.name]);
          return toToolResponse(result, effectiveOutcomeContract, capabilityProfile, name);
        } catch (err) {
          return toolError(err.message || 'Invalid arguments', capabilityProfile, { resource: name, code: 'invalid_arguments' });
        }
      }
      default:
        return toolError(`Unknown tool: ${name}`, capabilityProfile, { resource: name, code: 'unknown_tool' });
    }
  };
}
