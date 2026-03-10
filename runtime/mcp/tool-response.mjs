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
 */
export function toToolResponse(result, effectiveOutcomeContract = null, capabilityProfile = null) {
  const contractPrefix = effectiveOutcomeContract
    ? `EffectiveOutcomeContract:\n${JSON.stringify(effectiveOutcomeContract, null, 2)}\n\n`
    : '';

  if (result.success) {
    const output = result.output ?? '';
    return attachCapabilityProfile({
      content: [{ type: 'text', text: `${contractPrefix}${output}` }],
      structuredContent: {
        status: 'Full',
        selectedRoute: 'local-runtime-script',
        output,
      },
    }, capabilityProfile);
  }

  const parts = [];
  if (result.error) parts.push(result.error);
  if (result.output) parts.push(result.output);

  const textBody = parts.length > 0 ? parts.join('\n\n') : 'Unknown error';
  const text = `${contractPrefix}${textBody}`;

  return attachCapabilityProfile({
    content: [{ type: 'text', text }],
    structuredContent: {
      status: 'Degraded',
      missingCapabilities: ['runtime-execution'],
      selectedRoute: 'manual-investigation',
      output: textBody,
    },
    isError: true,
  }, capabilityProfile);
}

/**
 * Create an MCP error response for a validation or runtime error.
 */
export function toolError(message, capabilityProfile = null) {
  const text = String(message || 'Unknown error');

  return attachCapabilityProfile({
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
