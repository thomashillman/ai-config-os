import type { ExecutorEnv } from "./index";
import {
  healthCheck,
  listPhase1Tools,
  getSkillMetadata,
  getArtifact,
  skillStatsCached,
} from "./phase1-tools";

/**
 * Execute Request Payload
 */
export interface ExecutePayload {
  request_id?: string;
  tool: string;
  args?: string[];
  timeout_ms?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Execute Response
 */
export interface ExecuteResponse {
  ok: boolean;
  status: number;
  result?: unknown;
  error?: { code: string; message: string };
  request_id?: string;
}

/**
 * Phase 1 tools (whitelist)
 */
const PHASE1_TOOLS = new Set([
  "health_check",
  "list_phase1_tools",
  "get_skill_metadata",
  "get_artifact",
  "skill_stats_cached",
]);

/**
 * Phase 0 tools (explicitly rejected)
 */
const PHASE0_TOOLS = new Set([
  "sync_tools",
  "list_tools",
  "get_config",
  "context_cost",
  "validate_all",
]);

/**
 * Parse timeout in milliseconds
 */
function parseTimeoutMs(raw: string | undefined): number {
  const parsed = Number(raw ?? "10000");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10000;
  }
  // Phase 1: Clamp to 15s (15000ms)
  return Math.min(parsed, 15000);
}

/**
 * Validate execute request payload
 */
function validateExecutePayload(
  payload: unknown,
): { ok: true; value: ExecutePayload } | { ok: false; error: string } {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return { ok: false, error: "Payload must be a JSON object" };
  }

  const data = payload as Record<string, unknown>;

  if (typeof data.tool !== "string" || data.tool.trim().length === 0) {
    return { ok: false, error: "Field 'tool' must be a non-empty string" };
  }

  if (
    data.args !== undefined &&
    (!Array.isArray(data.args) ||
      data.args.some((arg) => typeof arg !== "string"))
  ) {
    return { ok: false, error: "Field 'args' must be an array of strings" };
  }

  if (
    data.timeout_ms !== undefined &&
    (!Number.isInteger(data.timeout_ms) || Number(data.timeout_ms) <= 0)
  ) {
    return {
      ok: false,
      error: "Field 'timeout_ms' must be a positive integer",
    };
  }

  if (data.request_id !== undefined && typeof data.request_id !== "string") {
    return { ok: false, error: "Field 'request_id' must be a string" };
  }

  if (
    data.metadata !== undefined &&
    (typeof data.metadata !== "object" ||
      data.metadata === null ||
      Array.isArray(data.metadata))
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
 * Dispatch to Phase 1 tool handler
 */
async function dispatchPhase1Tool(
  tool: string,
  args: string[] | undefined,
  env: ExecutorEnv,
): Promise<ExecuteResponse> {
  const requestId = undefined; // Will be set by caller

  if (tool === "health_check") {
    return healthCheck();
  }

  if (tool === "list_phase1_tools") {
    return listPhase1Tools();
  }

  if (tool === "get_skill_metadata") {
    const skillId = args?.[0];
    if (!skillId) {
      return {
        ok: false,
        status: 400,
        error: {
          code: "INVALID_REQUEST",
          message: "get_skill_metadata requires skill_id argument",
        },
      };
    }
    return getSkillMetadata(skillId, env);
  }

  if (tool === "get_artifact") {
    const [version, name] = args || [];
    if (!version || !name) {
      return {
        ok: false,
        status: 400,
        error: {
          code: "INVALID_REQUEST",
          message: "get_artifact requires version and name arguments",
        },
      };
    }
    return getArtifact(version, name, env);
  }

  if (tool === "skill_stats_cached") {
    return skillStatsCached(env);
  }

  // Should not reach here (checked before call)
  return {
    ok: false,
    status: 403,
    error: {
      code: "TOOL_NOT_SUPPORTED",
      message: `Tool '${tool}' is not supported in Phase 1`,
    },
  };
}

/**
 * Main executor handler
 */
export async function handleExecutePhase1(
  request: Request,
  env: ExecutorEnv,
): Promise<Response> {
  // Verify shared secret
  const sharedSecret = request.headers.get("X-Executor-Shared-Secret");
  if (!sharedSecret || sharedSecret !== env.EXECUTOR_SHARED_SECRET) {
    const response: ExecuteResponse = {
      ok: false,
      status: 401,
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid or missing shared secret",
      },
    };
    return new Response(JSON.stringify(response), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse request body
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    const response: ExecuteResponse = {
      ok: false,
      status: 400,
      error: { code: "INVALID_REQUEST", message: "Invalid JSON body" },
    };
    return new Response(JSON.stringify(response), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Validate payload
  const validation = validateExecutePayload(payload);
  if (!validation.ok) {
    const response: ExecuteResponse = {
      ok: false,
      status: 400,
      error: { code: "INVALID_REQUEST", message: validation.error },
    };
    return new Response(JSON.stringify(response), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const payloadValue = validation.value;
  const { tool, args, request_id } = payloadValue;

  // Check if tool is Phase 0 (rejected)
  if (PHASE0_TOOLS.has(tool)) {
    const response: ExecuteResponse = {
      ok: false,
      status: 403,
      error: {
        code: "TOOL_NOT_SUPPORTED",
        message: `Tool '${tool}' is not supported in Phase 1. Currently supported: ${Array.from(PHASE1_TOOLS).join(", ")}`,
      },
      request_id,
    };
    return new Response(JSON.stringify(response), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check if tool is Phase 1 (allowed)
  if (!PHASE1_TOOLS.has(tool)) {
    const response: ExecuteResponse = {
      ok: false,
      status: 403,
      error: {
        code: "TOOL_NOT_SUPPORTED",
        message: `Tool '${tool}' is not supported in Phase 1. Currently supported: ${Array.from(PHASE1_TOOLS).join(", ")}`,
      },
      request_id,
    };
    return new Response(JSON.stringify(response), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Dispatch to tool handler
  try {
    const result = await dispatchPhase1Tool(tool, args, env);
    const response: ExecuteResponse = {
      ...result,
      request_id,
    };
    return new Response(JSON.stringify(response), {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const response: ExecuteResponse = {
      ok: false,
      status: 500,
      error: { code: "INTERNAL_ERROR", message: "Executor error" },
      request_id,
    };
    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
