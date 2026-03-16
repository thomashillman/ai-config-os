export interface Env {
  AUTH_TOKEN: string;
  AUTH_TOKEN_NEXT?: string;
  ENVIRONMENT?: string;
  EXECUTOR_PROXY_URL?: string;
  EXECUTOR_SHARED_SECRET: string;
  EXECUTOR_TIMEOUT_MS?: string;
  HANDOFF_TOKEN_SIGNING_KEY?: string;

  // Phase 1: Service binding to executor Worker (primary path)
  EXECUTOR?: {
    fetch(request: Request): Promise<Response>;
  };

  MANIFEST_KV?: {
    get(key: string): Promise<string | null> | string | null;
  };
  ARTEFACTS_R2?: {
    get(key: string): Promise<{ text(): Promise<string> } | null> | { text(): Promise<string> } | null;
  };
}

export type ExecutePayload = {
  request_id?: string;
  tool: string;
  args?: string[];
  timeout_ms?: number;
  metadata?: Record<string, unknown>;
};

export type TransitionTaskStatePayload = {
  expected_version: number;
  next_state: string;
  next_action: string;
  updated_at: string;
  progress?: { completed_steps: number; total_steps: number };
};

export type RouteSelectionPayload = {
  expected_version: number;
  route_id: string;
  selected_at: string;
};

export type ContinuationPayload = {
  handoff_token: Record<string, unknown>;
  effective_execution_contract: Record<string, unknown>;
  created_at?: string;
};

export type JsonReadResult =
  | { ok: true; value: unknown }
  | { ok: false; response: Response };
