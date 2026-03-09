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
export function toToolResponse(result, capabilityProfile = null) {
  if (result.success) {
    return attachCapabilityProfile({ content: [{ type: 'text', text: result.output ?? '' }] }, capabilityProfile);
  }

  // On failure: combine stderr and stdout to preserve diagnostic context.
  const parts = [];
  if (result.error) parts.push(result.error);
  if (result.output) parts.push(result.output);

  const text = parts.length > 0 ? parts.join('\n\n') : 'Unknown error';

  return attachCapabilityProfile({
    content: [{ type: 'text', text }],
    isError: true,
  }, capabilityProfile);
}

/**
 * Create an MCP error response for a validation or runtime error.
 *
 * @param {string} message - error message
 * @returns {object} MCP-formatted error response
 */
export function toolError(message, capabilityProfile = null) {
  return attachCapabilityProfile({
    content: [{ type: 'text', text: String(message || 'Unknown error') }],
    isError: true,
  }, capabilityProfile);
}

