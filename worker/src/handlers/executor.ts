import { jsonResponse } from '../http';
import type { Env, ExecutePayload } from '../types';

function asObject(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return null;
  }
  return payload as Record<string, unknown>;
}

function parseTimeoutMs(raw: string | undefined): number {
  const parsed = Number(raw ?? '10000');
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10000;
  }
  // Parse timeout; final clamping happens in invokeExecutorServiceBinding or invokeExecutorProxy
  return Math.min(parsed, 120000);
}

function validateExecutePayload(payload: unknown): { ok: true; value: ExecutePayload } | { ok: false; error: string } {
  const data = asObject(payload);
  if (!data) {
    return { ok: false, error: 'Payload must be a JSON object' };
  }

  if (typeof data.tool !== 'string' || data.tool.trim().length === 0) {
    return { ok: false, error: "Field 'tool' must be a non-empty string" };
  }

  if (
    data.args !== undefined
    && (!Array.isArray(data.args) || data.args.some((arg) => typeof arg !== 'string'))
  ) {
    return { ok: false, error: "Field 'args' must be an array of strings" };
  }

  if (
    data.timeout_ms !== undefined
    && (!Number.isInteger(data.timeout_ms) || Number(data.timeout_ms) <= 0)
  ) {
    return { ok: false, error: "Field 'timeout_ms' must be a positive integer" };
  }

  if (data.request_id !== undefined && typeof data.request_id !== 'string') {
    return { ok: false, error: "Field 'request_id' must be a string" };
  }

  if (
    data.metadata !== undefined
    && (typeof data.metadata !== 'object' || data.metadata === null || Array.isArray(data.metadata))
  ) {
    return { ok: false, error: "Field 'metadata' must be an object" };
  }

  return {
    ok: true,
    value: {
      request_id: data.request_id as string | undefined,
      tool: data.tool,
      args: data.args as string[] | undefined,
      timeout_ms: data.timeout_ms as number | undefined,
      metadata: data.metadata as Record<string, unknown> | undefined,
    },
  };
}

/**
 * Invoke executor via service binding (Phase 1 primary path)
 */
async function invokeExecutorServiceBinding(
  env: Env,
  payload: ExecutePayload,
  forwardedSignature: string,
): Promise<Response> {
  // Phase 1: Clamp to 15s max
  const timeoutMs = Math.min(payload.timeout_ms ?? 10000, 15000);

  try {
    const response = await env.EXECUTOR!.fetch(
      new Request('https://executor.internal/v1/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Executor-Shared-Secret': env.EXECUTOR_SHARED_SECRET,
          'X-Request-Signature': forwardedSignature,
        },
        body: JSON.stringify(payload),
      }),
    );

    const responseBody: Record<string, unknown> = await response
      .json()
      .then((body) => (typeof body === 'object' && body !== null ? body as Record<string, unknown> : {}))
      .catch(() => ({}));

    return jsonResponse({
      ok: response.ok,
      status: response.status,
      result: responseBody.result ?? null,
      error: response.ok
        ? null
        : (responseBody.error ?? { code: 'UPSTREAM_ERROR', message: 'Executor returned an error' }),
      request_id: payload.request_id ?? null,
    }, response.ok ? 200 : response.status);
  } catch {
    return jsonResponse({
      ok: false,
      status: 504,
      error: { code: 'UPSTREAM_TIMEOUT', message: 'Executor request timed out or failed' },
      request_id: payload.request_id ?? null,
    }, 504);
  }
}

/**
 * Invoke executor via HTTP proxy (Phase 0 fallback)
 */
async function invokeExecutorProxy(
  env: Env,
  payload: ExecutePayload,
  forwardedSignature: string,
): Promise<Response> {
  const timeoutMs = parseTimeoutMs(env.EXECUTOR_TIMEOUT_MS);

  try {
    const response = await fetch(`${env.EXECUTOR_PROXY_URL!.replace(/\/$/, '')}/v1/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Executor-Shared-Secret': env.EXECUTOR_SHARED_SECRET,
        'X-Request-Signature': forwardedSignature,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const responseBody: Record<string, unknown> = await response
      .json()
      .then((body) => (typeof body === 'object' && body !== null ? body as Record<string, unknown> : {}))
      .catch(() => ({}));

    return jsonResponse({
      ok: response.ok,
      status: response.status,
      result: responseBody.result ?? null,
      error: response.ok
        ? null
        : (responseBody.error ?? { code: 'UPSTREAM_ERROR', message: 'Executor returned an error' }),
      request_id: payload.request_id ?? null,
    }, response.ok ? 200 : response.status);
  } catch {
    return jsonResponse({
      ok: false,
      status: 504,
      error: { code: 'UPSTREAM_TIMEOUT', message: 'Executor request timed out or failed' },
      request_id: payload.request_id ?? null,
    }, 504);
  }
}

export async function handleExecute(request: Request, env: Env): Promise<Response> {
  // Validate that we have shared secret
  if (!env.EXECUTOR_SHARED_SECRET) {
    return jsonResponse({ error: 'Executor shared secret is not configured' }, 500);
  }

  // Parse request body
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  // Validate payload
  const validation = validateExecutePayload(payload);
  if (!validation.ok) {
    return jsonResponse({ error: validation.error }, 400);
  }

  const forwardedSignature = request.headers.get('X-Request-Signature') ?? '';

  // --- PHASE 1 PRIMARY PATH: Service binding (Cloudflare-first) ---
  // Invoke executor Worker via service binding. This is the default and only
  // recommended path for Phase 1. No external executor host required.
  // All execution is contained within Cloudflare Workers.
  if (env.EXECUTOR) {
    return invokeExecutorServiceBinding(env, validation.value, forwardedSignature);
  }

  // --- PHASE 0 COMPATIBILITY / PHASE 2 FUTURE: External executor via HTTP proxy ---
  // Fallback path only when service binding is unavailable.
  // Used for: (1) backward compatibility with Phase 0 architecture,
  // or (2) future Phase 2 with a VPS-backed executor.
  // Phase 1 does NOT require this; service binding is the default.
  if (env.EXECUTOR_PROXY_URL) {
    return invokeExecutorProxy(env, validation.value, forwardedSignature);
  }

  // Neither path configured - Phase 1 requires service binding
  return jsonResponse({
    error: 'Executor is not configured. Phase 1 requires service binding (EXECUTOR) in wrangler.toml. ' +
           'EXECUTOR_PROXY_URL is optional for backward compatibility or future Phase 2.',
  }, 500);
}
