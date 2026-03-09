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
  } = deps;

  return async function handleCallTool(request) {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'sync_tools': {
        const result = runScript('runtime/sync.sh', args?.dry_run ? ['--dry-run'] : []);
        return toToolResponse(result);
      }

      case 'list_tools': {
        const result = runScript('runtime/manifest.sh', ['status']);
        return toToolResponse(result);
      }

      case 'get_config': {
        const result = runScript('shared/lib/config-merger.sh');
        return toToolResponse(result);
      }

      case 'skill_stats': {
        const result = runScript('ops/skill-stats.sh');
        return toToolResponse(result);
      }

      case 'context_cost': {
        try {
          const threshold = validateNumber(args?.threshold, 2000);
          const result = runScript('ops/context-cost.sh', ['--threshold', String(threshold)]);
          return toToolResponse(result);
        } catch (err) {
          return toolError(err.message || 'Invalid arguments');
        }
      }

      case 'validate_all': {
        const result = runScript('ops/validate-all.sh');
        return toToolResponse(result);
      }

      case 'mcp_list': {
        const result = runScript('runtime/adapters/mcp-adapter.sh', ['list']);
        return toToolResponse(result);
      }

      case 'mcp_add': {
        try {
          validateName(args?.name);
          if (!isCommandNameSafe(args?.command)) {
            return toolError('Invalid command: must be a simple command name (alphanumeric, dash, underscore)');
          }
          const result = runScript(
            'runtime/adapters/mcp-adapter.sh',
            ['add', args.name, args.command, ...(Array.isArray(args?.args) ? args.args : [])]
          );
          return toToolResponse(result);
        } catch (err) {
          return toolError(err.message || 'Invalid arguments');
        }
      }

      case 'mcp_remove': {
        try {
          validateName(args?.name);
          const result = runScript('runtime/adapters/mcp-adapter.sh', ['remove', args.name]);
          return toToolResponse(result);
        } catch (err) {
          return toolError(err.message || 'Invalid arguments');
        }
      }

      default:
        return toolError(`Unknown tool: ${name}`);
    }
  };
}
