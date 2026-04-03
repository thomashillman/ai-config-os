import { describe, it, expect } from "vitest";
import {
  resolvePrincipal,
  resolveBoundary,
  resolveAuthority,
  isAuthorizedFor,
  validateBoundaryIntegrity,
  resolveMutationContext,
  type AuthenticatedRequest,
  type TaskContextLookup,
} from "../task-mutation-context";
import type { TaskCommandType } from "../task-command";

describe("resolvePrincipal", () => {
  it("derives principal from authenticated request", () => {
    const request: AuthenticatedRequest = {
      principal_id: "user-123",
      principal_type: "user",
      workspace_id: "ws-456",
      repo_id: "repo-789",
    };

    const principal = resolvePrincipal(request);

    expect(principal.principal_id).toBe("user-123");
    expect(principal.principal_type).toBe("user");
    expect(principal.workspace_id).toBe("ws-456");
    expect(principal.repo_id).toBe("repo-789");
  });

  it("handles missing optional fields", () => {
    const request: AuthenticatedRequest = {
      principal_id: "user-123",
      principal_type: "system",
    };

    const principal = resolvePrincipal(request);

    expect(principal.principal_id).toBe("user-123");
    expect(principal.principal_type).toBe("system");
    expect(principal.workspace_id).toBeUndefined();
    expect(principal.repo_id).toBeUndefined();
  });
});

describe("resolveBoundary", () => {
  it("derives boundary from task context", () => {
    const taskContext: TaskContextLookup = {
      task_id: "task-1",
      owner_principal_id: "user-123",
      workspace_id: "ws-456",
      repo_id: "repo-789",
      version: 5,
    };

    const boundary = resolveBoundary(taskContext);

    expect(boundary.owner_principal_id).toBe("user-123");
    expect(boundary.workspace_id).toBe("ws-456");
    expect(boundary.repo_id).toBe("repo-789");
  });

  it("handles missing repo_id", () => {
    const taskContext: TaskContextLookup = {
      task_id: "task-1",
      owner_principal_id: "user-123",
      workspace_id: "ws-456",
    };

    const boundary = resolveBoundary(taskContext);

    expect(boundary.owner_principal_id).toBe("user-123");
    expect(boundary.workspace_id).toBe("ws-456");
    expect(boundary.repo_id).toBeUndefined();
  });
});

describe("resolveAuthority", () => {
  const allowedActions: TaskCommandType[] = [
    "task.select_route",
    "task.transition_state",
    "task.append_finding",
  ];

  it("grants direct_owner authority when principal matches boundary owner", () => {
    const principal = {
      principal_type: "user" as const,
      principal_id: "user-123",
      workspace_id: "ws-456",
    };
    const boundary = {
      owner_principal_id: "user-123",
      workspace_id: "ws-456",
      repo_id: "repo-789",
    };

    const authority = resolveAuthority(principal, boundary, allowedActions);

    expect(authority.authority_mode).toBe("direct_owner");
    expect(authority.allowed_actions).toEqual(allowedActions);
  });

  it("grants delegated authority when principal does not match owner", () => {
    const principal = {
      principal_type: "user" as const,
      principal_id: "user-999",
      workspace_id: "ws-456",
    };
    const boundary = {
      owner_principal_id: "user-123",
      workspace_id: "ws-456",
      repo_id: "repo-789",
    };

    const authority = resolveAuthority(principal, boundary, allowedActions);

    expect(authority.authority_mode).toBe("delegated");
    expect(authority.allowed_actions).toEqual([]);
  });

  it("stamps current timestamp in authority", () => {
    const principal = {
      principal_type: "user" as const,
      principal_id: "user-123",
    };
    const boundary = {
      owner_principal_id: "user-123",
      workspace_id: "ws-456",
    };

    const before = new Date();
    const authority = resolveAuthority(principal, boundary, allowedActions);
    const after = new Date();

    const stampedTime = new Date(authority.stamped_at);
    expect(stampedTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(stampedTime.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

describe("isAuthorizedFor", () => {
  it("returns true if action is in allowed_actions", () => {
    const authority = {
      authority_mode: "direct_owner" as const,
      allowed_actions: [
        "task.select_route",
        "task.transition_state",
      ] as const,
      stamped_at: "2026-04-03T00:00:00Z",
    };

    expect(isAuthorizedFor(authority, "task.select_route")).toBe(true);
    expect(isAuthorizedFor(authority, "task.transition_state")).toBe(true);
  });

  it("returns false if action is not in allowed_actions", () => {
    const authority = {
      authority_mode: "direct_owner" as const,
      allowed_actions: ["task.select_route"] as const,
      stamped_at: "2026-04-03T00:00:00Z",
    };

    expect(isAuthorizedFor(authority, "task.append_finding")).toBe(false);
  });

  it("returns false for empty allowed_actions", () => {
    const authority = {
      authority_mode: "delegated" as const,
      allowed_actions: [] as const,
      stamped_at: "2026-04-03T00:00:00Z",
    };

    expect(isAuthorizedFor(authority, "task.select_route")).toBe(false);
  });
});

describe("validateBoundaryIntegrity", () => {
  it("validates workspace match when both are specified", () => {
    const principal = {
      principal_type: "user" as const,
      principal_id: "user-123",
      workspace_id: "ws-456",
    };
    const boundary = {
      owner_principal_id: "user-123",
      workspace_id: "ws-456",
      repo_id: "repo-789",
    };
    const requestedBoundary = {
      workspace_id: "ws-456",
    };

    const result = validateBoundaryIntegrity(
      principal,
      boundary,
      requestedBoundary,
    );

    expect(result.ok).toBe(true);
  });

  it("rejects workspace mismatch", () => {
    const principal = {
      principal_type: "user" as const,
      principal_id: "user-123",
      workspace_id: "ws-456",
    };
    const boundary = {
      owner_principal_id: "user-123",
      workspace_id: "ws-999",
      repo_id: "repo-789",
    };
    const requestedBoundary = {
      workspace_id: "ws-999",
    };

    const result = validateBoundaryIntegrity(
      principal,
      boundary,
      requestedBoundary,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe("workspace_mismatch");
  });

  it("rejects repo mismatch", () => {
    const principal = {
      principal_type: "user" as const,
      principal_id: "user-123",
      repo_id: "repo-123",
    };
    const boundary = {
      owner_principal_id: "user-123",
      workspace_id: "ws-456",
      repo_id: "repo-999",
    };
    const requestedBoundary = {
      repo_id: "repo-999",
    };

    const result = validateBoundaryIntegrity(
      principal,
      boundary,
      requestedBoundary,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe("repo_mismatch");
  });
});

describe("resolveMutationContext", () => {
  const mockRequest: AuthenticatedRequest = {
    principal_id: "user-123",
    principal_type: "user",
    workspace_id: "ws-456",
  };

  const mockTaskContext: TaskContextLookup = {
    task_id: "task-1",
    owner_principal_id: "user-123",
    workspace_id: "ws-456",
    repo_id: "repo-789",
    version: 5,
  };

  const mockTaskLookup = async (taskId: string) => {
    if (taskId === "task-1") {
      return mockTaskContext;
    }
    return null;
  };

  const allowedActions: TaskCommandType[] = [
    "task.select_route",
    "task.transition_state",
    "task.append_finding",
    "task.create",
  ];

  it("resolves context for task.create (task_lookup can be null)", async () => {
    const result = await resolveMutationContext(
      mockRequest,
      "task-new",
      "task.create",
      { initial_route: "local_repo" },
      mockTaskLookup,
      allowedActions,
    );

    expect(result.ok).toBe(true);
    expect(result.context?.principal.principal_id).toBe("user-123");
    expect(result.context?.boundary.owner_principal_id).toBe("user-123");
    expect(result.context?.authority.authority_mode).toBe("direct_owner");
  });

  it("resolves context for other commands", async () => {
    const result = await resolveMutationContext(
      mockRequest,
      "task-1",
      "task.select_route",
      { route_id: "local_repo" },
      mockTaskLookup,
      allowedActions,
    );

    expect(result.ok).toBe(true);
    expect(result.context?.principal.principal_id).toBe("user-123");
    expect(result.context?.boundary.owner_principal_id).toBe("user-123");
  });

  it("returns error when task not found for non-create commands", async () => {
    const result = await resolveMutationContext(
      mockRequest,
      "task-not-found",
      "task.select_route",
      { route_id: "local_repo" },
      mockTaskLookup,
      allowedActions,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe("task_not_found");
  });

  it("returns error when boundary validation fails", async () => {
    const request: AuthenticatedRequest = {
      principal_id: "user-123",
      principal_type: "user",
      workspace_id: "ws-different", // Different workspace
    };

    const result = await resolveMutationContext(
      request,
      "task-1",
      "task.select_route",
      { route_id: "local_repo" },
      mockTaskLookup,
      allowedActions,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe("workspace_mismatch");
  });

  it("returns error when principal is not authorized", async () => {
    const request: AuthenticatedRequest = {
      principal_id: "user-999", // Different user
      principal_type: "user",
      workspace_id: "ws-456",
    };

    const result = await resolveMutationContext(
      request,
      "task-1",
      "task.select_route",
      { route_id: "local_repo" },
      mockTaskLookup,
      allowedActions,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe("unauthorized");
  });

  it("returns error when command type is not allowed", async () => {
    const result = await resolveMutationContext(
      mockRequest,
      "task-1",
      "task.dismiss_question", // Not in allowedActions
      { finding_id: "f-1" },
      mockTaskLookup,
      allowedActions,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe("unauthorized");
  });
});
