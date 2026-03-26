import { attachCapabilityProfile } from '../lib/capability-profile.mjs';
import { createCapability, createErrorEnvelope, createSuccessEnvelope } from '../lib/contracts/envelope.mjs';

function mcpCapability() {
  return createCapability({
    worker_backed: false,
    local_only: true,
    remote_safe: false,
    tunnel_required: false,
    unavailable_on_surface: false,
  });
}

export function toToolResponse(result, effectiveOutcomeContract = null, capabilityProfile = null, resource = 'mcp.tool') {
  const outcomeMeta = effectiveOutcomeContract
    ? { effective_outcome_contract: effectiveOutcomeContract }
    : undefined;

  if (result.success) {
    const output = result.output ?? '';
    const envelope = createSuccessEnvelope({
      resource,
      data: { output, success: true },
      summary: 'Tool execution completed successfully.',
      capability: mcpCapability(),
      meta: outcomeMeta,
    });

    return attachCapabilityProfile({
      content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }],
      structuredContent: envelope,
    }, capabilityProfile);
  }

  const parts = [];
  if (result.error) parts.push(result.error);
  if (result.output) parts.push(result.output);
  const textBody = parts.length > 0 ? parts.join('\n\n') : 'Unknown error';

  const envelope = createErrorEnvelope({
    resource,
    data: { output: textBody, success: false },
    summary: 'Tool execution failed.',
    capability: mcpCapability(),
    error: {
      code: 'tool_execution_failed',
      message: textBody,
      hint: 'Inspect the tool output, correct inputs, and retry.',
    },
    meta: outcomeMeta,
  });

  return attachCapabilityProfile({
    content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }],
    structuredContent: envelope,
    isError: true,
  }, capabilityProfile);
}

export function toolError(message, capabilityProfile = null, options = {}) {
  const text = String(message || 'Unknown error');
  const envelope = createErrorEnvelope({
    resource: options.resource || 'mcp.tool',
    data: options.data ?? null,
    summary: options.summary || 'Tool request failed.',
    capability: mcpCapability(),
    error: {
      code: options.code || 'invalid_request',
      message: text,
      hint: options.hint || 'Review tool arguments and retry the request.',
    },
    suggestedActions: options.suggestedActions || [],
    meta: options.meta,
  });

  return attachCapabilityProfile({
    content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }],
    structuredContent: envelope,
    isError: true,
  }, capabilityProfile);
}
