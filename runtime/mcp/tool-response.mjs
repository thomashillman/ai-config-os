import { attachCapabilityProfile } from '../lib/capability-profile.mjs';

/**
 * tool-response.mjs
 *
 * Pure helpers for shaping MCP tool responses.
 * Ensures consistent error handling and diagnostic context preservation.
 */

import {
  assertExecutionResult,
  makeErrorResponse,
} from '../../packages/contracts/index.js';


function normalizeExecutionResult(result) {
  if (result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'success')) {
    const now = new Date().toISOString();
    return {
      ok: Boolean(result.success),
      stdout: String(result.output ?? ''),
      stderr: String(result.error ?? ''),
      exitCode: result.success ? 0 : null,
      startedAt: now,
      finishedAt: now,
      durationMs: 0,
    };
  }

  return result;
}

/**
 * Convert a script execution result to an MCP tool response.
 * On success: returns output only.
 * On failure: preserves both stderr and stdout for full diagnostic context.
 *
 * @param {object} result
 * @returns {object} MCP-formatted tool response
 */
export function toToolResponse(result) {
  const executionResult = assertExecutionResult(normalizeExecutionResult(result));

  if (executionResult.ok) {
    return { content: [{ type: 'text', text: executionResult.stdout ?? '' }] };
  }

  // On failure: combine stderr and stdout to preserve diagnostic context.
  const parts = [];
  if (executionResult.stderr) parts.push(executionResult.stderr);
  if (executionResult.stdout) parts.push(executionResult.stdout);

  const text = parts.length > 0 ? parts.join('\n\n') : 'Unknown error';
  const nonFullContract = {
    status,
    missingCapabilities: [
      'local-runtime-script-execution',
    ],
    selectedRoute,
    requiredUserInput: [
      'Inspect the error details and confirm whether to run the equivalent route manually.',
    ],
    guidanceEquivalentRoute:
      'Run the corresponding runtime script directly in a shell (for example via npm scripts or the repo script path) and capture the output.',
    guidanceFullWorkflowHigherCapabilityEnvironment:
      'Re-run this MCP tool in an environment with full local runtime script execution enabled so the complete workflow can run end-to-end.',
    output: text,
  };

  return attachCapabilityProfile({
    content: [{ type: 'text', text }],
    structuredContent: nonFullContract,
    isError: true,
  }, capabilityProfile);
}

/**
 * Create an MCP error response for a validation or runtime error.
 *
 * @param {string} message - error message
 * @returns {object} MCP-formatted error response
 */
export function toolError(message) {
  const errorResponse = makeErrorResponse({
    code: 'MCP_TOOL_ERROR',
    message: String(message || 'Unknown error'),
  });

  return {
    content: [{ type: 'text', text: errorResponse.error.message }],
    isError: true,
  }, capabilityProfile);
}

