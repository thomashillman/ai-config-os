import { MCP_TOOL_MAP } from './tool-definitions.mjs';
import { attachCapabilityProfile } from '../lib/capability-profile.mjs';
import { createRuntimeActionDispatcher } from '../lib/runtime-action-dispatcher.mjs';

/**
 * handlers.mjs
 *
 * MCP request handlers extracted into a testable factory.
 * Accepts dependencies for injection, enabling unit testing without server startup.
 */

/**
 * Create a CallTool request handler with injected dependencies.
 *
 * @param {object} deps - injected dependencies
 * @param {Function} deps.runScript - execute a script
 * @param {Function} deps.validateName - validate MCP server name
 * @param {Function} deps.validateNumber - validate and coerce numeric arguments
 * @param {Function} deps.isCommandNameSafe - check if command is safe to execute
 * @param {Function} deps.resolveEffectiveOutcomeContract - compute effective routing contract
 * @param {Function} deps.toToolResponse - shape a result object into MCP response
 * @param {Function} deps.toolError - create an MCP error response
 * @returns {Function} async handler(request) => response
 */
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

  function requireTaskService(capabilityProfile) {
    if (!taskService) {
      return toolError('Task service is not configured for this MCP runtime', capabilityProfile);
    }

    return null;
  }

  return async function handleCallTool(request) {
    const { name, arguments: args } = request.params;
    const effectiveOutcomeContract = resolveEffectiveOutcomeContract({ toolName: name, executionChannel: 'mcp' });
    const capabilityProfile = typeof getCapabilityProfile === 'function'
      ? await getCapabilityProfile()
      : null;

    if (readFlags !== undefined && readFlags !== null) {
      const flags = readFlags();
      if (flags.effective_contract_required && effectiveOutcomeContract.outcomeId === null) {
        return toolError(
          `No outcome route for tool '${name}': effective_contract_required is enabled in manifest`,
          capabilityProfile
        );
      }
    }

    if (!MCP_TOOL_MAP.has(name)) {
      return toolError(`Unknown tool: ${name}`, capabilityProfile);
    }

    switch (name) {
      case 'resolve_outcome_contract': {
        const targetToolName = args?.tool_name || '';
        const contract = resolveEffectiveOutcomeContract({ toolName: targetToolName, executionChannel: 'mcp' });
        return attachCapabilityProfile({
          content: [{ type: 'text', text: JSON.stringify(contract, null, 2) }],
        }, capabilityProfile);
      }

      case 'sync_tools':
      case 'list_tools':
      case 'get_config':
      case 'skill_stats':
      case 'context_cost':
      case 'validate_all': {
        try {
          const result = runtimeActionDispatcher.dispatch(name, args);
          return toToolResponse(result, effectiveOutcomeContract, capabilityProfile);
        } catch (err) {
          return toolError(err.message || 'Invalid arguments', capabilityProfile);
        }
      }

      case 'mcp_list': {
        const result = runScript('runtime/adapters/mcp-adapter.sh', ['list']);
        return toToolResponse(result, effectiveOutcomeContract, capabilityProfile);
      }

      case 'mcp_add': {
        try {
          validateName(args?.name);
          if (!isCommandNameSafe(args?.command)) {
            return toolError('Invalid command: must be a simple command name (alphanumeric, dash, underscore)', capabilityProfile);
          }
          const result = runScript(
            'runtime/adapters/mcp-adapter.sh',
            ['add', args.name, args.command, ...(Array.isArray(args?.args) ? args.args : [])]
          );
          return toToolResponse(result, effectiveOutcomeContract, capabilityProfile);
        } catch (err) {
          return toolError(err.message || 'Invalid arguments', capabilityProfile);
        }
      }


      case 'task_start_review_repository': {
        const missingService = requireTaskService(capabilityProfile);
        if (missingService) {
          return missingService;
        }

        try {
          const result = taskService.startReviewRepositoryTask({
            taskId: args?.task_id,
            goal: args?.goal,
            routeInputs: args?.route_inputs,
            capabilityProfile: args?.capability_profile,
            narrator: momentumEngine?.narrator || null,
            observer: momentumEngine?.observer || null,
          });
          return attachCapabilityProfile({
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          }, capabilityProfile);
        } catch (err) {
          return toolError(err.message || 'Invalid arguments', capabilityProfile);
        }
      }

      case 'task_resume_review_repository': {
        const missingService = requireTaskService(capabilityProfile);
        if (missingService) {
          return missingService;
        }

        try {
          const result = taskService.resumeReviewRepositoryTask({
            taskId: args?.task_id,
            capabilityProfile: args?.capability_profile,
            narrator: momentumEngine?.narrator || null,
            observer: momentumEngine?.observer || null,
          });
          return attachCapabilityProfile({
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          }, capabilityProfile);
        } catch (err) {
          return toolError(err.message || 'Invalid arguments', capabilityProfile);
        }
      }

      case 'task_get_readiness': {
        const missingService = requireTaskService(capabilityProfile);
        if (missingService) {
          return missingService;
        }

        try {
          const readiness = taskService.getReadiness(args?.task_id);
          return attachCapabilityProfile({
            content: [{ type: 'text', text: JSON.stringify({ readiness }, null, 2) }],
          }, capabilityProfile);
        } catch (err) {
          return toolError(err.message || 'Invalid arguments', capabilityProfile);
        }
      }
      case 'momentum_narrate': {
        if (!momentumEngine) {
          return toolError('Momentum engine is not configured', capabilityProfile);
        }
        const missingService = requireTaskService(capabilityProfile);
        if (missingService) return missingService;

        try {
          const task = taskService.getTask(args?.task_id);
          const point = args?.narration_point;
          let narration;

          if (point === 'onStart' || point === 'onResume') {
            const method = point === 'onStart' ? 'narrateStart' : 'narrateResume';
            narration = momentumEngine[method](task, null, null);
          } else if (point === 'onFindingEvolved') {
            const finding = (task.findings || []).find((f) => f.finding_id === args?.finding_id);
            if (!finding) {
              return toolError(`Finding '${args?.finding_id}' not found on task`, capabilityProfile);
            }
            narration = momentumEngine.narrateFindingEvolved(
              task, finding, args?.previous_confidence || 'hypothesis', args?.new_confidence || 'verified',
            );
          } else if (point === 'onUpgradeAvailable') {
            narration = momentumEngine.narrateUpgradeAvailable(task, null, null);
          } else {
            return toolError(`Unknown narration point: ${point}`, capabilityProfile);
          }

          return attachCapabilityProfile({
            content: [{ type: 'text', text: JSON.stringify(narration, null, 2) }],
          }, capabilityProfile);
        } catch (err) {
          return toolError(err.message || 'Narration failed', capabilityProfile);
        }
      }

      case 'momentum_shelf': {
        if (!momentumEngine) {
          return toolError('Momentum engine is not configured', capabilityProfile);
        }
        const missingService = requireTaskService(capabilityProfile);
        if (missingService) return missingService;

        try {
          const tasks = await taskService.listRecentTasks({ limit: 50 });
          const shelf = momentumEngine.buildShelf({
            tasks: Array.isArray(tasks) ? tasks : [],
            currentCapabilities: args?.capability_profile || capabilityProfile,
          });
          return attachCapabilityProfile({
            content: [{ type: 'text', text: JSON.stringify({ shelf }, null, 2) }],
          }, capabilityProfile);
        } catch (err) {
          return toolError(err.message || 'Shelf build failed', capabilityProfile);
        }
      }

      case 'momentum_reflect': {
        if (!momentumEngine) {
          return toolError('Momentum engine is not configured', capabilityProfile);
        }

        try {
          const result = momentumEngine.reflect({
            since: args?.since,
            limit: 200,
          });

          if (args?.auto_apply && result.report.insights.length > 0) {
            const minConfidence = args?.min_confidence ?? 0.7;
            const applied = [];
            for (const insight of result.report.insights) {
              const outcome = momentumEngine.applyInsight(insight, { minConfidence });
              if (outcome.applied) {
                applied.push(outcome);
              }
            }
            result.applied = applied;
          }

          return attachCapabilityProfile({
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          }, capabilityProfile);
        } catch (err) {
          return toolError(err.message || 'Reflection failed', capabilityProfile);
        }
      }

      case 'momentum_resolve_intent': {
        if (!momentumEngine) {
          return toolError('Momentum engine is not configured', capabilityProfile);
        }

        try {
          const result = momentumEngine.resolveIntent(args?.phrase);
          return attachCapabilityProfile({
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          }, capabilityProfile);
        } catch (err) {
          return toolError(err.message || 'Intent resolution failed', capabilityProfile);
        }
      }

      case 'momentum_record_response': {
        if (!momentumEngine) {
          return toolError('Momentum engine is not configured', capabilityProfile);
        }

        try {
          const event = momentumEngine.recordUserResponse({
            taskId: args?.task_id,
            narrationEventId: args?.narration_event_id,
            responseType: args?.response_type,
            timeToActionMs: args?.time_to_action_ms,
            followUpText: args?.follow_up_text,
          });
          return attachCapabilityProfile({
            content: [{ type: 'text', text: JSON.stringify({ recorded: true, event_id: event.event_id }, null, 2) }],
          }, capabilityProfile);
        } catch (err) {
          return toolError(err.message || 'Response recording failed', capabilityProfile);
        }
      }

      case 'mcp_remove': {
        try {
          validateName(args?.name);
          const result = runScript('runtime/adapters/mcp-adapter.sh', ['remove', args.name]);
          return toToolResponse(result, effectiveOutcomeContract, capabilityProfile);
        } catch (err) {
          return toolError(err.message || 'Invalid arguments', capabilityProfile);
        }
      }

      default:
        return toolError(`Unknown tool: ${name}`, capabilityProfile);
    }
  };
}
