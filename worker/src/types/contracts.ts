export interface ContractCapability {
  worker_backed: boolean;
  local_only: boolean;
  remote_safe: boolean;
  tunnel_required: boolean;
  unavailable_on_surface: boolean;
}

export interface SuggestedAction {
  id: string;
  label: string;
  reason: string;
  runnable_target: string;
}

export interface ContractError {
  code: string;
  message: string;
  hint: string;
}

export interface ContractEnvelope<TData = unknown> {
  contract_version: string;
  resource: string;
  data: TData;
  summary: string;
  capability: ContractCapability;
  suggested_actions: SuggestedAction[];
  meta?: Record<string, unknown>;
  error?: ContractError;
}
