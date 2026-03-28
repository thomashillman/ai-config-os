import { attachCapabilityProfile } from '../lib/capability-profile.mjs';
import { createCapability, createErrorEnvelope, createSuccessEnvelope } from '../lib/contracts/envelope.mjs';

function mcpCapability(overrides = {}) {
  return createCapability({
    worker_backed: false,
    local_only: true,
    remote_safe: false,
    tunnel_required: false,
    unavailable_on_surface: false,
    ...overrides,
  });
}

function outcomeMeta(effectiveOutcomeContract) {
  return effectiveOutcomeContract
    ? { effective_outcome_contract: effectiveOutcomeContract }
    : undefined;
}

export function toToolResponse(result, effectiveOutcomeContract = null, capabilityProfile = null, resource = 'mcp.tool') {
  const parsed = result?.parsed ?? null;

  if (result.success) {
    const envelope = createSuccessEnvelope({
      resource,
      data: {
        success: true,
        data: parsed?.data ?? {},
        schema_ids: parsed?.schemaIds ?? [],
        capability: parsed?.capability ?? { local_only: true, worker_backed: false },
        capability_by_schema: parsed?.capabilityBySchema ?? {},
        diagnostics: result.output ? { raw_output: result.output } : undefined,
      },
      summary: parsed?.summary || 'Tool execution completed successfully.',
      capability: mcpCapability(),
      meta: outcomeMeta(effectiveOutcomeContract),
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
    data: {
      success: false,
      data: parsed?.data ?? {},
      schema_ids: parsed?.schemaIds ?? [],
      capability: parsed?.capability ?? { local_only: true, worker_backed: false },
      capability_by_schema: parsed?.capabilityBySchema ?? {},
      diagnostics: { raw_output: textBody },
    },
    summary: parsed?.summary || 'Tool execution failed.',
    capability: mcpCapability(),
    error: {
      code: 'tool_execution_failed',
      message: textBody,
      hint: 'Inspect diagnostics.raw_output, correct inputs if needed, and retry.',
    },
    meta: outcomeMeta(effectiveOutcomeContract),
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
