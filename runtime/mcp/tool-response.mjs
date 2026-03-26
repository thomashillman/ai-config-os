import { attachCapabilityProfile } from '../lib/capability-profile.mjs';

/**
 * tool-response.mjs
 *
 * Pure helpers for shaping MCP tool responses.
 * Ensures consistent error handling and diagnostic context preservation.
 */

/**
 * Convert a script execution result to an MCP tool response.
 * On success: returns output only.
 * On failure: preserves both stderr and stdout for full diagnostic context.
 *
 * @param {object} result
 * @param {boolean} result.success - whether the script succeeded
 * @param {string} result.output - stdout content
 * @param {string|null} result.error - stderr content or error message
 * @returns {object} MCP-formatted tool response
 */
function buildFullContract(result) {
  return {
    status: 'Full',
    selectedRoute: 'local-runtime-script',
    capability: result.parsed?.capability ?? { local_only: true, worker_backed: false },
    schema_ids: result.parsed?.schemaIds ?? [],
    data: result.parsed?.data ?? {},
    diagnostics: result.output
      ? { raw_output: result.output }
      : undefined,
  };
}

function buildDegradedContract(textBody, result) {
  return {
    status: 'Degraded',
    missingCapabilities: [
      'local-runtime-script-execution',
    ],
    selectedRoute: 'manual-input-correction',
    requiredUserInput: [
      'Inspect the error details and confirm whether to retry or run the equivalent route manually.',
    ],
    guidanceEquivalentRoute:
      'Run the corresponding runtime script directly in a shell and capture both stdout and stderr.',
    guidanceFullWorkflowHigherCapabilityEnvironment:
      'Re-run this action in an environment with local runtime script execution enabled.',
    capability: result.parsed?.capability ?? { local_only: true, worker_backed: false },
    schema_ids: result.parsed?.schemaIds ?? [],
    data: result.parsed?.data ?? {},
    diagnostics: { raw_output: textBody },
  };
}

export function toToolResponse(result, effectiveOutcomeContract = null, capabilityProfile = null) {
  const contractPrefix = effectiveOutcomeContract
    ? `EffectiveOutcomeContract:
${JSON.stringify(effectiveOutcomeContract, null, 2)}

`
    : '';

  if (result.success) {
    const summary = result.parsed?.summary || 'Tool execution succeeded.';
    return attachCapabilityProfile({
      content: [{ type: 'text', text: `${contractPrefix}${summary}` }],
      structuredContent: buildFullContract(result),
    }, capabilityProfile);
  }

  // On failure: combine stderr and stdout to preserve diagnostic context.
  const parts = [];
  if (result.error) parts.push(result.error);
  if (result.output) parts.push(result.output);

  const textBody = parts.length > 0 ? parts.join('\n\n') : 'Unknown error';
  const summary = result.parsed?.summary || 'Tool execution failed.';
  const text = `${contractPrefix}${summary}`;

  return attachCapabilityProfile(
    {
      content: [{ type: 'text', text }],
      structuredContent: buildDegradedContract(textBody, result),
      isError: true,
    },
    capabilityProfile
  );
}

/**
 * Create an MCP error response for a validation or runtime error.
 *
 * @param {string} message - error message
 * @returns {object} MCP-formatted error response
 */
export function toolError(message, capabilityProfile = null) {
  const text = String(message || 'Unknown error');

  return attachCapabilityProfile(
    {
      content: [{ type: 'text', text }],
      structuredContent: {
        status: 'Degraded',
        missingCapabilities: [
          'valid-tool-input',
        ],
        selectedRoute: 'manual-input-correction',
        requiredUserInput: [
          'Update the tool arguments and retry the request.',
        ],
        guidanceEquivalentRoute:
          'Use the same tool with corrected arguments matching the declared schema.',
        guidanceFullWorkflowHigherCapabilityEnvironment:
          'After correcting the input, run the full MCP workflow in a higher-capability environment if additional execution permissions are required.',
        output: text,
      },
      isError: true,
    },
    capabilityProfile
  );
}

