import { MCP_TOOL_MAP } from './tool-definitions.mjs';
import { attachCapabilityProfile } from '../lib/capability-profile.mjs';

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
  } = deps;

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

      case 'sync_tools': {
        const result = runScript('runtime/sync.sh', args?.dry_run ? ['--dry-run'] : []);
        return toToolResponse(result, effectiveOutcomeContract, capabilityProfile);
      }

      case 'list_tools': {
        const result = runScript('runtime/manifest.sh', ['status']);
        return toToolResponse(result, effectiveOutcomeContract, capabilityProfile);
      }

      case 'get_config': {
        const result = runScript('shared/lib/config-merger.sh');
        return toToolResponse(result, effectiveOutcomeContract, capabilityProfile);
      }

      case 'skill_stats': {
        const result = runScript('ops/skill-stats.sh');
        return toToolResponse(result, effectiveOutcomeContract, capabilityProfile);
      }

      case 'context_cost': {
        try {
          const threshold = validateNumber(args?.threshold, 2000);
          const result = runScript('ops/context-cost.sh', ['--threshold', String(threshold)]);
          return toToolResponse(result, effectiveOutcomeContract, capabilityProfile);
        } catch (err) {
          return toolError(err.message || 'Invalid arguments', capabilityProfile);
        }
      }

      case 'validate_all': {
        const result = runScript('ops/validate-all.sh');
        return toToolResponse(result, effectiveOutcomeContract, capabilityProfile);
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
