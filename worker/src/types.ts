export interface Env {
  AUTH_TOKEN: string;
  AUTH_TOKEN_NEXT?: string;
  ENVIRONMENT?: string;
  EXECUTOR_SHARED_SECRET: string;
  EXECUTOR_TIMEOUT_MS?: string;
  HANDOFF_TOKEN_SIGNING_KEY?: string;

  // PHASE 1 PRIMARY PATH: Service binding to executor Worker
  // Cloudflare-first execution. Main Worker invokes executor Worker via
  // service binding (no HTTP overhead, no external URL needed).
  // This is the default and only recommended configuration for Phase 1.
  EXECUTOR?: {
    fetch(request: Request): Promise<Response>;
  };

  // PHASE 0 COMPATIBILITY / PHASE 2 FUTURE: External executor via HTTP proxy
  // Optional fallback for backward compatibility or future VPS executor.
  // Phase 1 does NOT require this; service binding (EXECUTOR) is primary.
  // Will be used only if service binding is unavailable.
  EXECUTOR_PROXY_URL?: string;

  MANIFEST_KV?: {
    get(key: string): Promise<string | null> | string | null;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
    delete(key: string): Promise<void>;
  };
  ARTEFACTS_R2?: {
    get(key: string): Promise<{ text(): Promise<string> } | null> | { text(): Promise<string> } | null;
    put(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
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

export type AppendFindingPayload = {
  expected_version: number;
  finding: Record<string, unknown>;
  updated_at: string;
};

export type TransitionFindingsPayload = {
  expected_version: number;
  to_route_id: string;
  upgraded_at: string;
  to_equivalence_level: string;
};

export type JsonReadResult =
  | { ok: true; value: unknown }
  | { ok: false; response: Response };
