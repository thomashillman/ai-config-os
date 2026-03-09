import { MCP_TOOL_MAP } from './tool-definitions.mjs';

/**
 * handlers.mjs
 *
 * MCP request handlers extracted into a testable factory.
 * Accepts dependencies for injection, enabling unit testing without server startup.
 */

import { assertToolInvocationPayload } from '../../packages/contracts/index.js';

/**
 * Create a CallTool request handler with injected dependencies.
 *
 * @param {object} deps - injected dependencies
 * @param {Function} deps.runScript - execute a script
 * @param {Function} deps.validateName - validate MCP server name
 * @param {Function} deps.validateNumber - validate and coerce numeric arguments
 * @param {Function} deps.isCommandNameSafe - check if command is safe to execute
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
    toToolResponse,
    toolError,
    getCapabilityProfile,
  } = deps;

  return async function handleCallTool(request) {
    const { name, arguments: args } = request.params;
    const capabilityProfile = getCapabilityProfile ? await getCapabilityProfile() : null;

    if (!MCP_TOOL_MAP.has(name)) {
      return toolError(`Unknown tool: ${name}`);
    }

    const invocation = assertToolInvocationPayload({
      toolName: name,
      args: args && typeof args === 'object' ? args : {},
    });

    switch (invocation.toolName) {
      case 'sync_tools': {
        const result = runScript('runtime/sync.sh', invocation.args?.dry_run ? ['--dry-run'] : []);
        return toToolResponse(result);
      }

      case 'list_tools': {
        const result = runScript('runtime/manifest.sh', ['status']);
        return toToolResponse(result, capabilityProfile);
      }

      case 'get_config': {
        const result = runScript('shared/lib/config-merger.sh');
        return toToolResponse(result, capabilityProfile);
      }

      case 'skill_stats': {
        const result = runScript('ops/skill-stats.sh');
        return toToolResponse(result, capabilityProfile);
      }

      case 'context_cost': {
        try {
          const threshold = validateNumber(invocation.args?.threshold, 2000);
          const result = runScript('ops/context-cost.sh', ['--threshold', String(threshold)]);
          return toToolResponse(result, capabilityProfile);
        } catch (err) {
          return toolError(err.message || 'Invalid arguments', capabilityProfile);
        }
      }

      case 'validate_all': {
        const result = runScript('ops/validate-all.sh');
        return toToolResponse(result, capabilityProfile);
      }

      case 'mcp_list': {
        const result = runScript('runtime/adapters/mcp-adapter.sh', ['list']);
        return toToolResponse(result, capabilityProfile);
      }

      case 'mcp_add': {
        try {
          validateName(invocation.args?.name);
          if (!isCommandNameSafe(invocation.args?.command)) {
            return toolError('Invalid command: must be a simple command name (alphanumeric, dash, underscore)');
          }
          const result = runScript(
            'runtime/adapters/mcp-adapter.sh',
            ['add', invocation.args.name, invocation.args.command, ...(Array.isArray(invocation.args?.args) ? invocation.args.args : [])]
          );
          return toToolResponse(result, capabilityProfile);
        } catch (err) {
          return toolError(err.message || 'Invalid arguments', capabilityProfile);
        }
      }

      case 'mcp_remove': {
        try {
          validateName(invocation.args?.name);
          const result = runScript('runtime/adapters/mcp-adapter.sh', ['remove', invocation.args.name]);
          return toToolResponse(result);
        } catch (err) {
          return toolError(err.message || 'Invalid arguments', capabilityProfile);
        }
      }

      default:
        return toolError(`Unknown tool: ${name}`, capabilityProfile);
    }
  };
}
