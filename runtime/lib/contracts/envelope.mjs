export const CONTRACT_VERSION = '1.0.0';

export function createCapability(overrides = {}) {
  return {
    worker_backed: Boolean(overrides.worker_backed),
    local_only: Boolean(overrides.local_only),
    remote_safe: Boolean(overrides.remote_safe),
    tunnel_required: Boolean(overrides.tunnel_required),
    unavailable_on_surface: Boolean(overrides.unavailable_on_surface),
  };
}

function normalizeSuggestedActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      id: String(entry.id || 'action'),
      label: String(entry.label || 'Run action'),
      reason: String(entry.reason || ''),
      runnable_target: String(entry.runnable_target || ''),
    }));
}

function normalizeMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return undefined;
  if (Object.keys(meta).length === 0) return undefined;
  return meta;
}

export function createSuccessEnvelope({ resource, data, summary, capability, suggestedActions = [], meta }) {
  const normalizedMeta = normalizeMeta(meta);
  return {
    contract_version: CONTRACT_VERSION,
    resource: String(resource || 'unknown.resource'),
    data,
    summary: String(summary || 'Request completed successfully.'),
    capability: createCapability(capability),
    suggested_actions: normalizeSuggestedActions(suggestedActions),
    ...(normalizedMeta ? { meta: normalizedMeta } : {}),
  };
}

export function createErrorEnvelope({ resource, data = null, summary, capability, suggestedActions = [], error, meta }) {
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' ? error.message : 'Unexpected error';
  const hint = typeof error?.hint === 'string' ? error.hint : 'Retry the request or inspect server logs.';
  const normalizedMeta = normalizeMeta(meta);

  return {
    contract_version: CONTRACT_VERSION,
    resource: String(resource || 'unknown.resource'),
    data,
    summary: String(summary || 'Request failed.'),
    capability: createCapability(capability),
    suggested_actions: normalizeSuggestedActions(suggestedActions),
    ...(normalizedMeta ? { meta: normalizedMeta } : {}),
    error: { code, message, hint },
  };
}
