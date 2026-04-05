/**
 * TaskCommand -- Canonical authoritative command envelope
 *
 * Every state-changing task operation flows through a normalized command structure:
 * - Principal, boundary, and authority are server-stamped, never client-supplied
 * - Idempotency key ensures deterministic retry semantics
 * - Expected task version for optimistic locking
 * - Semantic digest is computed on payload, excluding volatile fields
 *
 * This is the source of truth for command structure and idempotency.
 */

function stableHexDigest(input: string): string {
  const rightRotate = (value: number, amount: number) =>
    (value >>> amount) | (value << (32 - amount));
  const toHex = (value: number) => value.toString(16).padStart(8, "0");

  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;

  const messageLength = (((bytes.length + 9 + 63) >> 6) << 6) - 8;
  const message = new Uint8Array(messageLength + 8);
  message.set(bytes);
  message[bytes.length] = 0x80;

  const bitLengthHigh = Math.floor(bitLength / 2 ** 32);
  const bitLengthLow = bitLength >>> 0;
  const view = new DataView(message.buffer);
  view.setUint32(message.length - 8, bitLengthHigh, false);
  view.setUint32(message.length - 4, bitLengthLow, false);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const k = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  const w = new Uint32Array(64);
  for (let offset = 0; offset < message.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 =
        rightRotate(w[i - 15], 7) ^
        rightRotate(w[i - 15], 18) ^
        (w[i - 15] >>> 3);
      const s1 =
        rightRotate(w[i - 2], 17) ^
        rightRotate(w[i - 2], 19) ^
        (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + s1 + ch + k[i] + w[i]) >>> 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  return Array.from(h, toHex).join("");
}

/**
 * Supported command types for task mutations
 */
export type TaskCommandType =
  | "task.create"
  | "task.select_route"
  | "task.transition_state"
  | "task.append_finding"
  | "task.transition_findings"
  | "task.answer_question"
  | "task.dismiss_question"
  | "task.create_continuation";

export const TASK_COMMAND_TYPES: readonly TaskCommandType[] = [
  "task.create",
  "task.select_route",
  "task.transition_state",
  "task.append_finding",
  "task.transition_findings",
  "task.answer_question",
  "task.dismiss_question",
  "task.create_continuation",
] as const;

/**
 * Principal -- Canonical authenticated actor identity
 * Derived from authenticated request on the server
 */
export interface Principal {
  readonly principal_type: "user" | "system";
  readonly principal_id: string;
  readonly workspace_id?: string;
  readonly repo_id?: string;
}

/**
 * Authority -- Server-stamped action authorization context
 * Derived from server-side evaluation of principal against task boundary and action scope
 */
export interface Authority {
  readonly authority_mode: "direct_owner" | "delegated" | "approval_backed";
  readonly allowed_actions: readonly TaskCommandType[];
  readonly stamped_at: string; // ISO 8601
}

/**
 * Boundary -- Scope and ownership context for a task
 * Derived from authoritative task record plus server-side defaults
 */
export interface Boundary {
  readonly owner_principal_id: string;
  readonly workspace_id: string;
  readonly repo_id?: string;
}

/**
 * RequestContext -- Execution context from the inbound request
 * Includes route selection, model path, and other validated execution details
 */
export interface RequestContext {
  readonly [key: string]: unknown;
}

/**
 * ResolvedContext -- Validated execution context stamped by server
 * Subset of RequestContext that passes server-side validation
 */
export interface ResolvedContext {
  readonly [key: string]: unknown;
}

/**
 * TaskCommand -- Internal authoritative command envelope
 * Single source of truth for every state-changing task mutation
 */
export interface TaskCommand<T = Record<string, unknown>> {
  readonly task_id: string;
  readonly idempotency_key: string;
  readonly expected_task_version: number | null;
  readonly command_type: TaskCommandType;
  readonly payload: T;

  // Server-stamped authority context
  readonly principal: Principal;
  readonly boundary: Boundary;
  readonly authority: Authority;

  // Request and resolved execution context
  readonly request_context: RequestContext;
  readonly resolved_context: ResolvedContext;

  // Semantic digest for idempotency and replay semantics
  readonly semantic_digest: string;
}

/**
 * Compute semantic digest for a command payload
 * Includes only non-volatile fields that define the semantic intent of the command
 * Excludes timestamps, request IDs, and other ephemeral context
 *
 * Digest is stable across valid retries and changes only when semantic intent changes
 */
export function computeSemanticDigest(
  commandType: TaskCommandType,
  payload: Record<string, unknown>,
): string {
  // Define which fields are semantic (non-volatile) for each command type
  const semanticFields: Record<TaskCommandType, readonly string[]> = {
    "task.create": [
      "initial_route",
      "task_type",
      "name",
      "description",
      "parameters",
    ],
    "task.select_route": ["route_id", "route_index"],
    "task.transition_state": ["next_state", "next_action"],
    "task.append_finding": ["finding"],
    "task.transition_findings": ["findings"],
    "task.answer_question": ["finding_id", "answer"],
    "task.dismiss_question": ["finding_id", "dismissal_reason"],
    "task.create_continuation": [
      "handoff_token",
      "effective_execution_contract",
    ],
  };

  const fields = semanticFields[commandType] ?? Object.keys(payload);
  const semanticPayload: Record<string, unknown> = {};

  for (const field of fields) {
    if (field in payload) {
      semanticPayload[field] = payload[field];
    }
  }

  // Sort keys for stable digests across implementations
  const sorted = JSON.stringify(
    semanticPayload,
    Object.keys(semanticPayload).sort(),
  );
  return stableHexDigest(sorted);
}

/**
 * ActionCommit -- Immutable receipt for authoritative task mutation
 * Written once, read many times. Forms the authoritative audit log.
 *
 * Contains:
 * - Top-level authoritative receipt fields (for audit, replay, and attribution)
 * - command_envelope (unchanged, canonical mutation input)
 */
export interface ActionCommit {
  // Authoritative receipt fields (top-level summary for audit and routing)
  readonly action_id: string; // UUID, generated on server
  readonly task_id: string; // from command.task_id
  readonly command_type: string; // from command.command_type
  readonly command_digest: string; // canonical semantic digest (excludes volatile fields)
  readonly principal_id: string; // from command.principal.principal_id
  readonly authority: Authority; // from command.authority
  readonly request_id?: string; // optional, from command.request_context
  readonly trace_id?: string; // optional, from command.request_context
  readonly route_id?: string; // optional, from validated execution context
  readonly model_path?: unknown; // optional, from validated execution context
  readonly created_at: string; // ISO 8601, when mutation was committed
  readonly task_version_before: number; // version before mutation
  readonly task_version_after: number; // version after mutation
  readonly result: {
    readonly success: true; // only commits on success
    readonly code?: string; // optional contextual code
  };
  readonly result_summary: string; // brief human-readable outcome

  // Task state snapshot (needed by projection reconciliation)
  readonly task_state_after: Record<string, unknown>; // the resulting task state after mutation

  // Canonical mutation input (KEEP UNCHANGED)
  readonly command_envelope: TaskCommand; // complete, unmodified command
}

/**
 * ApplyCommandRequest -- Client request to apply a command
 * Sent by handlers after resolving mutation context
 */
export interface ApplyCommandRequest {
  readonly command: TaskCommand;
}

/**
 * ApplyCommandResponse -- Result of applying a command
 * Includes replayed flag for idempotency, projection status for migration
 */
export interface ApplyCommandResponse {
  readonly ok: boolean;
  readonly action_id: string;
  readonly task_version: number;
  readonly replayed: boolean; // true if idempotency replay
  readonly projection_status?: "pending" | "complete"; // for migration
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
}

/**
 * Builder for creating canonical TaskCommand instances
 * Ensures all commands follow the authoritative structure
 */
export function buildTaskCommand<T extends Record<string, unknown>>(opts: {
  task_id: string;
  idempotency_key: string;
  expected_task_version: number | null;
  command_type: TaskCommandType;
  payload: T;
  principal: Principal;
  boundary: Boundary;
  authority: Authority;
  request_context: RequestContext;
  resolved_context?: ResolvedContext;
}): TaskCommand<T> {
  const semanticDigest = computeSemanticDigest(opts.command_type, opts.payload);

  return {
    task_id: opts.task_id,
    idempotency_key: opts.idempotency_key,
    expected_task_version: opts.expected_task_version,
    command_type: opts.command_type,
    payload: opts.payload,
    principal: opts.principal,
    boundary: opts.boundary,
    authority: opts.authority,
    request_context: opts.request_context,
    resolved_context: opts.resolved_context ?? {},
    semantic_digest: semanticDigest,
  };
}

export function deriveDeterministicIdempotencyKey(input: {
  command_type: TaskCommandType;
  task_id: string;
  expected_task_version: number | null;
  payload: Record<string, unknown>;
  caller_key?: string;
}): string {
  if (
    typeof input.caller_key === "string" &&
    input.caller_key.trim().length > 0
  ) {
    return input.caller_key.trim();
  }

  const payloadDigest = computeSemanticDigest(
    input.command_type,
    input.payload,
  );
  const versionPart =
    input.expected_task_version === null
      ? "null"
      : String(input.expected_task_version);
  return `${input.command_type}:${input.task_id}:v${versionPart}:${payloadDigest}`;
}
