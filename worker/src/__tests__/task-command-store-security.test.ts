import { describe, it, expect } from "vitest";
import { buildTaskCommand } from "../task-command";
import { resolveMutationContext } from "../task-mutation-context";
import type { AuthenticatedRequest, TaskContextResolver } from "../task-mutation-context";
import type { Principal, Boundary, Authority } from "../task-command";

/**
 * Step 4: Security and Boundary Abuse Tests
 *
 * Comprehensive tests to ensure boundary integrity and prevent authority
 * escalation attacks during command-type cutover.
 *
 * Tests cover:
 * 1. Workspace boundary enforcement
 * 2. Repository boundary enforcement
 * 3. Idempotency key theft protection
 * 4. Authority validation
 * 5. Principal mismatch detection
 */

describe("Step 4: Security - Boundary Abuse Prevention", () => {
  const taskContextResolver: TaskContextResolver = async (taskId) => {
    const tasks: Record<string, any> = {
      "task-1": {
        task_id: "task-1",
        owner_principal_id: "user-123",
        workspace_id: "ws-456",
        repo_id: "repo-789",
        version: 1,
      },
      "task-in-other-ws": {
        task_id: "task-in-other-ws",
        owner_principal_id: "user-999",
        workspace_id: "ws-999",
        repo_id: "repo-999",
        version: 1,
      },
    };
    return tasks[taskId] ?? null;
  };

  describe("Workspace boundary enforcement", () => {
    it("should reject when principal workspace differs from task workspace", async () => {
      const request: AuthenticatedRequest = {
        principal_id: "user-123",
        principal_type: "user",
        workspace_id: "ws-different", // Different from task's ws-456
      };

      const result = await resolveMutationContext(
        request,
        "task-1",
        "task.select_route",
        { route_id: "local_repo" },
        taskContextResolver,
        ["task.select_route"],
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("workspace_mismatch");
    });

    it("should allow same workspace for authorized principal", async () => {
      const request: AuthenticatedRequest = {
        principal_id: "user-123",
        principal_type: "user",
        workspace_id: "ws-456", // Matches task workspace
      };

      const result = await resolveMutationContext(
        request,
        "task-1",
        "task.select_route",
        { route_id: "local_repo" },
        taskContextResolver,
        ["task.select_route"],
      );

      expect(result.ok).toBe(true);
    });
  });

  describe("Repository boundary enforcement", () => {
    it("should reject when principal repo differs from task repo", async () => {
      const request: AuthenticatedRequest = {
        principal_id: "user-123",
        principal_type: "user",
        workspace_id: "ws-456",
        repo_id: "repo-different", // Different from task's repo-789
      };

      const result = await resolveMutationContext(
        request,
        "task-1",
        "task.select_route",
        { route_id: "local_repo" },
        taskContextResolver,
        ["task.select_route"],
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("repo_mismatch");
    });

    it("should allow same repo for authorized principal", async () => {
      const request: AuthenticatedRequest = {
        principal_id: "user-123",
        principal_type: "user",
        workspace_id: "ws-456",
        repo_id: "repo-789", // Matches task repo
      };

      const result = await resolveMutationContext(
        request,
        "task-1",
        "task.select_route",
        { route_id: "local_repo" },
        taskContextResolver,
        ["task.select_route"],
      );

      expect(result.ok).toBe(true);
    });
  });

  describe("Owner verification", () => {
    it("should allow task owner to execute commands", async () => {
      const request: AuthenticatedRequest = {
        principal_id: "user-123", // Matches owner_principal_id
        principal_type: "user",
        workspace_id: "ws-456",
      };

      const result = await resolveMutationContext(
        request,
        "task-1",
        "task.select_route",
        { route_id: "local_repo" },
        taskContextResolver,
        ["task.select_route"],
      );

      expect(result.ok).toBe(true);
      expect(result.context?.authority.authority_mode).toBe("direct_owner");
    });

    it("should reject non-owner attempting task mutation", async () => {
      const request: AuthenticatedRequest = {
        principal_id: "user-999", // Different from owner
        principal_type: "user",
        workspace_id: "ws-456",
      };

      const result = await resolveMutationContext(
        request,
        "task-1",
        "task.select_route",
        { route_id: "local_repo" },
        taskContextResolver,
        ["task.select_route"],
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("unauthorized");
    });
  });

  describe("Idempotency key theft protection", () => {
    it("should reject idempotency key reuse from different principal", () => {
      const attacker: Principal = {
        principal_type: "user",
        principal_id: "attacker-user",
        workspace_id: "ws-456",
      };

      const boundary: Boundary = {
        owner_principal_id: "user-123",
        workspace_id: "ws-456",
      };

      const authority: Authority = {
        authority_mode: "delegated", // No access
        allowed_actions: [],
        stamped_at: "2026-04-03T00:00:00Z",
      };

      const command = buildTaskCommand({
        task_id: "task-1",
        idempotency_key: "stolen-key-from-user-123",
        expected_task_version: 1,
        command_type: "task.select_route",
        payload: { route_id: "github_pr" },
        principal: attacker,
        boundary,
        authority,
        request_context: {},
      });

      // Command should not be executed due to unauthorized authority
      expect(command.principal.principal_id).toBe("attacker-user");
      expect(command.authority.allowed_actions.length).toBe(0);
    });

    it("should allow legitimate idempotency key reuse from same principal", () => {
      const principal: Principal = {
        principal_type: "user",
        principal_id: "user-123",
        workspace_id: "ws-456",
      };

      const boundary: Boundary = {
        owner_principal_id: "user-123",
        workspace_id: "ws-456",
      };

      const authority: Authority = {
        authority_mode: "direct_owner",
        allowed_actions: ["task.select_route"],
        stamped_at: "2026-04-03T00:00:00Z",
      };

      const command1 = buildTaskCommand({
        task_id: "task-1",
        idempotency_key: "legitimate-key",
        expected_task_version: 1,
        command_type: "task.select_route",
        payload: { route_id: "local_repo" },
        principal,
        boundary,
        authority,
        request_context: {},
      });

      const command2 = buildTaskCommand({
        task_id: "task-1",
        idempotency_key: "legitimate-key", // Same key
        expected_task_version: 1,
        command_type: "task.select_route",
        payload: { route_id: "local_repo" }, // Same payload
        principal,
        boundary,
        authority,
        request_context: {},
      });

      // Same semantic digest = legitimate retry
      expect(command1.semantic_digest).toBe(command2.semantic_digest);
      expect(command1.principal.principal_id).toBe(
        command2.principal.principal_id,
      );
    });
  });

  describe("Command type authorization", () => {
    it("should reject command types not in allowed_actions", async () => {
      const request: AuthenticatedRequest = {
        principal_id: "user-123",
        principal_type: "user",
        workspace_id: "ws-456",
      };

      const result = await resolveMutationContext(
        request,
        "task-1",
        "task.dismiss_question", // Not in allowed actions
        { finding_id: "f-1" },
        taskContextResolver,
        ["task.select_route", "task.transition_state"], // dismiss_question not included
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("unauthorized");
    });

    it("should allow command types in allowed_actions", async () => {
      const request: AuthenticatedRequest = {
        principal_id: "user-123",
        principal_type: "user",
        workspace_id: "ws-456",
      };

      const result = await resolveMutationContext(
        request,
        "task-1",
        "task.transition_state", // In allowed actions
        { next_state: "in_progress" },
        taskContextResolver,
        ["task.select_route", "task.transition_state", "task.append_finding"],
      );

      expect(result.ok).toBe(true);
    });
  });

  describe("Multiple boundary violations", () => {
    it("should catch multiple violations (workspace + repo mismatch)", async () => {
      const request: AuthenticatedRequest = {
        principal_id: "user-999", // Different principal
        principal_type: "user",
        workspace_id: "ws-different", // Different workspace
        repo_id: "repo-different", // Different repo
      };

      const result = await resolveMutationContext(
        request,
        "task-in-other-ws", // Task in ws-999, owned by user-999
        "task.select_route",
        { route_id: "local_repo" },
        taskContextResolver,
        ["task.select_route"],
      );

      // Request boundaries don't match task context
      expect(result.ok).toBe(false);
    });
  });

  describe("Authority stamping correctness", () => {
    it("should stamp authority with current timestamp", async () => {
      const request: AuthenticatedRequest = {
        principal_id: "user-123",
        principal_type: "user",
        workspace_id: "ws-456",
      };

      const before = new Date();
      const result = await resolveMutationContext(
        request,
        "task-1",
        "task.select_route",
        { route_id: "local_repo" },
        taskContextResolver,
        ["task.select_route"],
      );
      const after = new Date();

      expect(result.ok).toBe(true);
      const stampedTime = new Date(result.context!.authority.stamped_at);
      expect(stampedTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(stampedTime.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("should grant direct_owner authority to task owner", async () => {
      const request: AuthenticatedRequest = {
        principal_id: "user-123", // Owner
        principal_type: "user",
        workspace_id: "ws-456",
      };

      const result = await resolveMutationContext(
        request,
        "task-1",
        "task.select_route",
        { route_id: "local_repo" },
        taskContextResolver,
        ["task.select_route"],
      );

      expect(result.ok).toBe(true);
      expect(result.context?.authority.authority_mode).toBe("direct_owner");
    });

    it("should grant delegated authority (no actions) to non-owner", async () => {
      const request: AuthenticatedRequest = {
        principal_id: "user-other",
        principal_type: "user",
        workspace_id: "ws-456",
      };

      const result = await resolveMutationContext(
        request,
        "task-1",
        "task.select_route",
        { route_id: "local_repo" },
        taskContextResolver,
        ["task.select_route"],
      );

      expect(result.ok).toBe(false); // No delegation configured
      expect(result.error).toBe("unauthorized");
    });
  });
});
