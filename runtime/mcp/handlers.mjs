import { MCP_TOOL_MAP } from './tool-definitions.mjs';

/**
 * handlers.mjs
 *
 * MCP request handlers extracted into a testable factory.
 * Accepts dependencies for injection, enabling unit testing without server startup.
 */

import Ajv from 'ajv';
import { TOOL_REGISTRY } from './tool-registry.mjs';

const ajv = new Ajv({
  allErrors: true,
  strict: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});

const compiledSchemas = Object.fromEntries(
  Object.entries(TOOL_REGISTRY).map(([toolName, config]) => [toolName, ajv.compile(config.schema)])
);

function formatValidationError(tool, errors) {
  const first = errors?.[0] ?? {};
  const missing = first.keyword === 'required' ? first.params?.missingProperty : '';
  const normalizedPath = first.instancePath || '';
  const field = missing
    ? `${normalizedPath}/${missing}`.replace(/\/+/g, '/')
    : (normalizedPath || '/');

  return {
    type: 'validation_error',
    tool,
    field,
    message: first.message || 'Invalid arguments',
  };
}

/**
 * Create a CallTool request handler with injected dependencies.
 *
 * @param {object} deps - injected dependencies
 * @param {Function} deps.runScript - execute a script
 * @param {Function} deps.validateName - validate MCP server name
 * @param {Function} deps.isCommandNameSafe - check if command is safe to execute
 * @param {Function} deps.toToolResponse - shape a result object into MCP response
 * @param {Function} deps.toolError - create an MCP error response
 * @returns {Function} async handler(request) => response
 */
export function createCallToolHandler(deps) {
  const {
    runScript,
    validateName,
    isCommandNameSafe,
    toToolResponse,
    toolError,
    getCapabilityProfile,
  } = deps;

  return async function handleCallTool(request) {
    const { name, arguments: rawArgs } = request.params;
    const entry = TOOL_REGISTRY[name];

    if (!entry) {
      return toolError(JSON.stringify({
        type: 'validation_error',
        tool: name,
        field: '/name',
        message: 'Unknown tool id',
      }));
    }

    const args = rawArgs ?? {};
    const validateArgs = compiledSchemas[name];
    if (!validateArgs(args)) {
      return toolError(JSON.stringify(formatValidationError(name, validateArgs.errors)));
    }

    if (name === 'mcp_add' || name === 'mcp_remove') {
      try {
        validateName(args.name);
      } catch {
        return toolError(JSON.stringify({
          type: 'validation_error',
          tool: name,
          field: '/name',
          message: 'Invalid MCP server name',
        }));
      }
    }

    if (name === 'mcp_add' && !isCommandNameSafe(args.command)) {
      return toolError(JSON.stringify({
        type: 'validation_error',
        tool: name,
        field: '/command',
        message: 'Invalid command name',
      }));
    }

    const result = entry.run({ runScript }, args);
    return toToolResponse(result);
  };
}
