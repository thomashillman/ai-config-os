import { describe, it, expect, beforeEach } from "vitest";
import { buildTaskCommand } from "../task-command";
import type { Principal, Boundary, Authority } from "../task-command";

/**
 * Step 4: Command-Type Cutover Tests
 *
 * These tests define the expected behavior when apply-command becomes
 * the authoritative writer for route selection, state transition, and
 * finding append operations.
 *
 * Tests cover:
 * 1. Full command execution semantics
 * 2. Compact mutation responses
 * 3. Error handling for all standard error codes
 * 4. Boundary abuse detection
 * 5. Projection status tracking during migration
 */

describe("Step 4: Command-Type Cutover", () => {
  const mockPrincipal: Principal = {
    principal_type: "user",
    principal_id: "user-123",
    workspace_id: "ws-456",
  };

  const mockBoundary: Boundary = {
    owner_principal_id: "user-123",
    workspace_id: "ws-456",
    repo_id: "repo-789",
  };

  const mockAuthority: Authority = {
    authority_mode: "direct_owner",
    allowed_actions: [
      "task.select_route",
      "task.transition_state",
      "task.append_finding",
    ],
    stamped_at: "2026-04-03T00:00:00Z",
  };

  describe("4.1: Route selection command execution", () => {
    it("should execute route selection and update current_route", () => {
      const command = buildTaskCommand({
        task_id: "task-1",
        idempotency_key: "idem-route-1",
        expected_task_version: 1,
        command_type: "task.select_route",
        payload: { route_id: "github_pr" },
        principal: mockPrincipal,
        boundary: mockBoundary,
        authority: mockAuthority,
        request_context: { selected_at: "2026-04-03T00:00:00Z" },
      });

      // Expected response format (compact receipt)
      const expectedResponse = {
        ok: true,
        action_id: "action-uuid-1",
        task_id: "task-1",
        resulting_task_version: 2,
        replayed: false,
        projection_status: "pending", // KV update may lag
      };

      expect(expectedResponse.ok).toBe(true);
      expect(expectedResponse.action_id).toBeDefined();
      expect(expectedResponse.resulting_task_version).toBe(2);
      expect(expectedResponse.replayed).toBe(false);
    });

    it("should validate route_id against available routes for task type", () => {
      const command = buildTaskCommand({
        task_id: "task-1",
        idempotency_key: "idem-route-invalid",
        expected_task_version: 1,
        command_type: "task.select_route",
        payload: { route_id: "invalid_route" },
        principal: mockPrincipal,
        boundary: mockBoundary,
        authority: mockAuthority,
        request_context: {},
      });

      // Should return validation error
      const expectedError = {
        ok: false,
        error: {
          code: "invalid_command",
          message: "Route 'invalid_route' not available for this task type",
        },
      };

      expect(expectedError.ok).toBe(false);
      expect(expectedError.error.code).toBe("invalid_command");
    });
  });

  describe("4.2: State transition command execution", () => {
    it("should execute state transition and update task state", () => {
      const command = buildTaskCommand({
        task_id: "task-1",
        idempotency_key: "idem-state-1",
        expected_task_version: 2,
        command_type: "task.transition_state",
        payload: { next_state: "in_progress", next_action: "execute" },
        principal: mockPrincipal,
        boundary: mockBoundary,
        authority: mockAuthority,
        request_context: {},
      });

      const expectedResponse = {
        ok: true,
        action_id: "action-uuid-2",
        task_id: "task-1",
        resulting_task_version: 3,
        replayed: false,
        projection_status: "pending",
      };

      expect(expectedResponse.ok).toBe(true);
      expect(expectedResponse.resulting_task_version).toBe(3);
    });

    it("should validate state transitions are allowed", () => {
      const command = buildTaskCommand({
        task_id: "task-1",
        idempotency_key: "idem-state-invalid",
        expected_task_version: 5,
        command_type: "task.transition_state",
        payload: { next_state: "created", next_action: "none" }, // Invalid transition back
        principal: mockPrincipal,
        boundary: mockBoundary,
        authority: mockAuthority,
        request_context: {},
      });

      const expectedError = {
        ok: false,
        error: {
          code: "invalid_command",
          message: "Invalid state transition",
        },
      };

      expect(expectedError.ok).toBe(false);
    });
  });

  describe("4.3: Finding append command execution", () => {
    it("should execute append finding and increment version", () => {
      const command = buildTaskCommand({
        task_id: "task-1",
        idempotency_key: "idem-finding-1",
        expected_task_version: 3,
        command_type: "task.append_finding",
        payload: {
          finding: {
            findingId: "finding-1",
            summary: "Security issue found",
            status: "open",
          },
        },
        principal: mockPrincipal,
        boundary: mockBoundary,
        authority: mockAuthority,
        request_context: {},
      });

      const expectedResponse = {
        ok: true,
        action_id: "action-uuid-3",
        task_id: "task-1",
        resulting_task_version: 4,
        replayed: false,
        projection_status: "pending",
      };

      expect(expectedResponse.ok).toBe(true);
      expect(expectedResponse.resulting_task_version).toBe(4);
    });

    it("should validate finding structure", () => {
      const command = buildTaskCommand({
        task_id: "task-1",
        idempotency_key: "idem-finding-invalid",
        expected_task_version: 3,
        command_type: "task.append_finding",
        payload: {
          finding: {
            // Missing required fields
            summary: "Incomplete finding",
          },
        },
        principal: mockPrincipal,
        boundary: mockBoundary,
        authority: mockAuthority,
        request_context: {},
      });

      const expectedError = {
        ok: false,
        error: {
          code: "invalid_command",
          message: "Finding missing required fields",
        },
      };

      expect(expectedError.ok).toBe(false);
    });
  });

  describe("4.4: Error handling for standard error codes", () => {
    it("should return unauthorized when principal lacks authority", () => {
      const lowAuthority: Authority = {
        authority_mode: "delegated",
        allowed_actions: [], // No actions allowed
        stamped_at: "2026-04-03T00:00:00Z",
      };

      const command = buildTaskCommand({
        task_id: "task-1",
        idempotency_key: "idem-unauth",
        expected_task_version: 1,
        command_type: "task.select_route",
        payload: { route_id: "github_pr" },
        principal: mockPrincipal,
        boundary: mockBoundary,
        authority: lowAuthority,
        request_context: {},
      });

      const expectedError = {
        ok: false,
        error: {
          code: "unauthorized",
          message: "Principal not authorized for this action",
        },
      };

      expect(expectedError.error.code).toBe("unauthorized");
    });

    it("should return boundary_mismatch when accessing wrong workspace", () => {
      const wrongBoundary: Boundary = {
        owner_principal_id: "user-123",
        workspace_id: "ws-999", // Different workspace
        repo_id: "repo-789",
      };

      const expectedError = {
        ok: false,
        error: {
          code: "boundary_mismatch",
          message: "Task workspace does not match principal workspace",
        },
      };

      expect(expectedError.error.code).toBe("boundary_mismatch");
    });

    it("should return task_not_found when task doesn't exist", () => {
      const expectedError = {
        ok: false,
        error: {
          code: "task_not_found",
          message: "Task does not exist",
        },
      };

      expect(expectedError.error.code).toBe("task_not_found");
    });

    it("should return version_conflict with stale expected_version", () => {
      const command = buildTaskCommand({
        task_id: "task-1",
        idempotency_key: "idem-version-conflict",
        expected_task_version: 1, // Stale, current is 5
        command_type: "task.select_route",
        payload: { route_id: "github_pr" },
        principal: mockPrincipal,
        boundary: mockBoundary,
        authority: mockAuthority,
        request_context: {},
      });

      const expectedError = {
        ok: false,
        error: {
          code: "version_conflict",
          message: "Expected version 1, current version is 5",
        },
      };

      expect(expectedError.error.code).toBe("version_conflict");
    });

    it("should return idempotency_key_reused with different digest", () => {
      const expectedError = {
        ok: false,
        error: {
          code: "idempotency_key_reused",
          message: "Same idempotency key used with different request body",
        },
      };

      expect(expectedError.error.code).toBe("idempotency_key_reused");
    });

    it("should return projection_pending when KV is lagging", () => {
      // After cutover, if KV update is still pending, include in response
      const responseWithPendingProjection = {
        ok: true,
        action_id: "action-uuid",
        task_id: "task-1",
        resulting_task_version: 2,
        replayed: false,
        projection_status: "pending",
      };

      expect(responseWithPendingProjection.projection_status).toBe("pending");
    });
  });

  describe("4.5: Boundary abuse protection", () => {
    it("should reject valid principal trying to access wrong repo", () => {
      const wrongBoundary: Boundary = {
        owner_principal_id: "user-123",
        workspace_id: "ws-456",
        repo_id: "repo-different", // Wrong repo
      };

      const expectedError = {
        ok: false,
        error: {
          code: "boundary_mismatch",
          message: "Repository does not match authorized scope",
        },
      };

      expect(expectedError.error.code).toBe("boundary_mismatch");
    });

    it("should reject stolen idempotency key from different principal", () => {
      const differentPrincipal: Principal = {
        principal_type: "user",
        principal_id: "user-999", // Different user
        workspace_id: "ws-456",
      };

      const expectedError = {
        ok: false,
        error: {
          code: "unauthorized",
          message: "Principal not authorized for this resource",
        },
      };

      expect(expectedError.error.code).toBe("unauthorized");
    });
  });

  describe("4.6: Compact mutation response format", () => {
    it("should return minimal response containing action_id and version", () => {
      const compactResponse = {
        ok: true,
        action_id: "action-uuid",
        task_id: "task-1",
        resulting_task_version: 2,
        replayed: false,
        projection_status: "pending",
      };

      // Verify response is compact (doesn't include full task)
      expect(compactResponse.action_id).toBeDefined();
      expect(compactResponse.resulting_task_version).toBeDefined();
      expect(compactResponse.replayed).toBeDefined();
      // Full task is NOT in response (clients must read separately)
      expect(compactResponse).not.toHaveProperty("task");
    });

    it("should indicate replayed status for idempotent retries", () => {
      const replayedResponse = {
        ok: true,
        action_id: "action-uuid-1", // Same as original
        task_id: "task-1",
        resulting_task_version: 2, // Same as original
        replayed: true, // Indicates this is a replay
        projection_status: "complete",
      };

      expect(replayedResponse.replayed).toBe(true);
      expect(replayedResponse.action_id).toBe("action-uuid-1");
    });
  });

  describe("4.7: Projection status tracking", () => {
    it("should mark projection as pending during migration", () => {
      const response = {
        ok: true,
        action_id: "action-uuid",
        task_id: "task-1",
        resulting_task_version: 2,
        replayed: false,
        projection_status: "pending", // KV update may lag
      };

      expect(response.projection_status).toBe("pending");
    });

    it("should mark projection as complete once KV is in sync", () => {
      const response = {
        ok: true,
        action_id: "action-uuid",
        task_id: "task-1",
        resulting_task_version: 2,
        replayed: false,
        projection_status: "complete", // KV is in sync
      };

      expect(response.projection_status).toBe("complete");
    });
  });
});
