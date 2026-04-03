/**
 * TaskMutationContext -- Server-side resolution of principal, boundary, and authority
 *
 * Source of truth resolver that derives authoritative actor identity and action scope
 * from authenticated requests and task state. Never accepts client-supplied principal,
 * boundary, or authority values.
 *
 * Design principle: These are stamped on the server, not the caller.
 */

import type {
  Principal,
  Boundary,
  Authority,
  TaskCommand,
  TaskCommandType,
  ResolvedContext,
  RequestContext,
} from "./task-command";

/**
 * MutationContext -- Resolved execution context for a task mutation
 * Contains all authoritative information needed to execute a command
 */
export interface MutationContext {
  readonly principal: Principal;
  readonly boundary: Boundary;
  readonly authority: Authority;
  readonly request_context: RequestContext;
}

/**
 * TaskContextLookup -- Minimal task context needed to resolve boundary
 * When creating a task, this may be synthesized; when updating, loaded from store
 */
export interface TaskContextLookup {
  readonly task_id: string;
  readonly owner_principal_id: string;
  readonly workspace_id: string;
  readonly repo_id?: string;
  readonly version?: number;
}

/**
 * AuthenticatedRequest -- Minimal authenticated request interface
 * Extracts principal from whatever authentication mechanism is in place
 */
export interface AuthenticatedRequest {
  readonly principal_id: string;
  readonly principal_type: "user" | "system";
  readonly workspace_id?: string;
  readonly repo_id?: string;
}

/**
 * Resolve principal from authenticated request
 * Single source of truth: derived from request auth headers, never client-supplied
 */
export function resolvePrincipal(request: AuthenticatedRequest): Principal {
  return {
    principal_type: request.principal_type,
    principal_id: request.principal_id,
    workspace_id: request.workspace_id,
    repo_id: request.repo_id,
  };
}

/**
 * Resolve boundary from task context and server defaults
 * Derives workspace and repo context from authoritative task record or server config
 * Never accepts caller-supplied boundary identifiers alone
 */
export function resolveBoundary(taskContext: TaskContextLookup): Boundary {
  return {
    owner_principal_id: taskContext.owner_principal_id,
    workspace_id: taskContext.workspace_id,
    repo_id: taskContext.repo_id,
  };
}

/**
 * Resolve authority from principal against boundary and action scope
 * Stamps current point-in-time authorization decision
 * In single-user deployment, most operations resolve to `direct_owner` mode
 */
export function resolveAuthority(
  principal: Principal,
  boundary: Boundary,
  allowedActions: TaskCommandType[],
): Authority {
  // Single-user: if principal matches boundary owner, grant all allowed actions
  // Multi-user: would check delegations, approval workflows, etc.
  const isOwner = principal.principal_id === boundary.owner_principal_id;

  return {
    authority_mode: isOwner ? "direct_owner" : "delegated",
    allowed_actions: isOwner ? allowedActions : [],
    stamped_at: new Date().toISOString(),
  };
}

/**
 * Validate that principal is authorized for the requested command type
 * Returns true if the action is in the allowed set, false otherwise
 */
export function isAuthorizedFor(
  authority: Authority,
  commandType: TaskCommandType,
): boolean {
  return authority.allowed_actions.includes(commandType);
}

/**
 * Validate boundary integrity
 * Ensures principal's request context matches the authoritative task boundary
 * Prevents boundary escape attacks where principal tries to mutate tasks in wrong workspace/repo
 */
export function validateBoundaryIntegrity(
  principal: Principal,
  boundary: Boundary,
  requestedBoundary: Partial<Boundary>,
): {
  ok: boolean;
  error?: string;
} {
  // Workspace must match if principal has a workspace context
  if (
    principal.workspace_id &&
    requestedBoundary.workspace_id &&
    principal.workspace_id !== boundary.workspace_id
  ) {
    return {
      ok: false,
      error: "workspace_mismatch",
    };
  }

  // Repo must match if both are specified
  if (
    principal.repo_id &&
    requestedBoundary.repo_id &&
    principal.repo_id !== boundary.repo_id
  ) {
    return {
      ok: false,
      error: "repo_mismatch",
    };
  }

  return { ok: true };
}

/**
 * Resolver function type for looking up task context during mutation
 * Async because it may require KV or DO lookup
 */
export type TaskContextResolver = (
  taskId: string,
) => Promise<TaskContextLookup | null>;

/**
 * Build complete MutationContext for a task command
 * Centralizes all authority derivation in one place
 *
 * For task.create: taskLookup should be null, boundary synthesized from request defaults
 * For other commands: taskLookup must be loaded from authoritative store
 */
export async function resolveMutationContext(
  request: AuthenticatedRequest,
  taskId: string,
  commandType: TaskCommandType,
  requestContext: RequestContext,
  taskLookup: TaskContextResolver,
  allowedActions: TaskCommandType[],
): Promise<{
  ok: boolean;
  context?: MutationContext;
  error?: string;
}> {
  const principal = resolvePrincipal(request);

  // For task.create, synthesize boundary from request principal
  let boundary: Boundary;
  if (commandType === "task.create") {
    boundary = {
      owner_principal_id: principal.principal_id,
      workspace_id: principal.workspace_id || "default",
      repo_id: principal.repo_id,
    };
  } else {
    // For other commands, load boundary from authoritative task record
    const taskContext = await taskLookup(taskId);
    if (!taskContext) {
      return {
        ok: false,
        error: "task_not_found",
      };
    }
    boundary = resolveBoundary(taskContext);
  }

  // Validate that principal is not trying to escape their boundary
  const boundaryCheck = validateBoundaryIntegrity(principal, boundary, {
    workspace_id: principal.workspace_id,
    repo_id: principal.repo_id,
  });
  if (!boundaryCheck.ok) {
    return {
      ok: false,
      error: boundaryCheck.error,
    };
  }

  // Resolve authority from principal and boundary
  const authority = resolveAuthority(principal, boundary, allowedActions);

  // Check if principal is authorized for this command type
  if (!isAuthorizedFor(authority, commandType)) {
    return {
      ok: false,
      error: "unauthorized",
    };
  }

  return {
    ok: true,
    context: {
      principal,
      boundary,
      authority,
      request_context: requestContext,
    },
  };
}
