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

import crypto from "node:crypto";

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
  return crypto.createHash("sha256").update(sorted).digest("hex");
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
  const resolvedContext = opts.resolved_context ?? opts.request_context;
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
    resolved_context: resolvedContext,
    semantic_digest: semanticDigest,
  };
}
