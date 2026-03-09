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
export function toToolResponse(result, effectiveOutcomeContract = null) {
  const contractPrefix = effectiveOutcomeContract
    ? `EffectiveOutcomeContract:
${JSON.stringify(effectiveOutcomeContract, null, 2)}

`
    : '';

  if (result.success) {
    return { content: [{ type: 'text', text: `${contractPrefix}${result.output ?? ''}` }] };
  }

  // On failure: combine stderr and stdout to preserve diagnostic context.
  const parts = [];
  if (result.error) parts.push(result.error);
  if (result.output) parts.push(result.output);

  const textBody = parts.length > 0 ? parts.join('\n\n') : 'Unknown error';
  const text = `${contractPrefix}${textBody}`;

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
  const text = String(message || 'Unknown error');

  return {
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
  }, capabilityProfile);
}

