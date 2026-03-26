import { jsonResponse } from './http';
import type { ContractCapability, ContractEnvelope, SuggestedAction } from './types/contracts';

export const CONTRACT_VERSION = '1.0.0';

export const WORKER_CAPABILITY: ContractCapability = {
  worker_backed: true,
  local_only: false,
  remote_safe: true,
  tunnel_required: false,
  unavailable_on_surface: false,
};

type EnvelopeOptions = {
  resource: string;
  summary: string;
  data: unknown;
  suggestedActions?: SuggestedAction[];
  capability?: Partial<ContractCapability>;
  meta?: Record<string, unknown>;
};

type ErrorOptions = EnvelopeOptions & {
  error: { code: string; message: string; hint: string };
};

function capabilityFor(overrides?: Partial<ContractCapability>): ContractCapability {
  return {
    ...WORKER_CAPABILITY,
    ...overrides,
  };
}

export function successEnvelope(options: EnvelopeOptions): ContractEnvelope {
  const meta = options.meta && Object.keys(options.meta).length > 0 ? options.meta : undefined;
  return {
    contract_version: CONTRACT_VERSION,
    resource: options.resource,
    data: options.data,
    summary: options.summary,
    capability: capabilityFor(options.capability),
    suggested_actions: options.suggestedActions ?? [],
    ...(meta ? { meta } : {}),
  };
}

export function errorEnvelope(options: ErrorOptions): ContractEnvelope {
  return {
    ...successEnvelope(options),
    error: options.error,
  };
}

export function contractSuccessResponse(options: EnvelopeOptions, status = 200): Response {
  return jsonResponse(successEnvelope(options), status);
}

export function contractErrorResponse(options: ErrorOptions, status = 400): Response {
  return jsonResponse(errorEnvelope(options), status);
}
