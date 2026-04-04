import { describe, it, expect } from "vitest";
import {
  reconstructAuthoritativeState,
  detectProjectionDivergence,
  computeProjectionLag,
  planProjectionRepair,
  validateRepairPlan,
  type ProjectionLag,
} from "../task-projection-reconcile";
import { buildTaskCommand } from "../task-command";
import type { ActionCommit } from "../task-command";
import type { Principal, Boundary, Authority } from "../task-command";

describe("Task Projection Reconciliation", () => {
  const mockPrincipal: Principal = {
    principal_type: "user",
    principal_id: "user-123",
  };
  const mockBoundary: Boundary = {
    owner_principal_id: "user-123",
    workspace_id: "ws-456",
  };
  const mockAuthority: Authority = {
    authority_mode: "direct_owner",
    allowed_actions: ["task.select_route"],
    stamped_at: "2026-04-03T00:00:00Z",
  };

  describe("reconstructAuthoritativeState", () => {
    it("should return empty state for empty commits", () => {
      const result = reconstructAuthoritativeState([]);
      expect(result.state).toEqual({});
      expect(result.version).toBe(0);
    });

    it("should reconstruct state from single commit", () => {
      const command = buildTaskCommand({
        task_id: "task-1",
        idempotency_key: "idem-1",
        expected_task_version: 0,
        command_type: "task.select_route",
        payload: { route_id: "local_repo" },
        principal: mockPrincipal,
        boundary: mockBoundary,
        authority: mockAuthority,
        request_context: {},
      });

      const commit: ActionCommit = {
        action_id: "action-1",
        command_envelope: command,
        task_version_before: 0,
        task_version_after: 1,
        task_state_after: { current_route: "local_repo", version: 1 },
        created_at: "2026-04-03T00:00:00Z",
      };

      const result = reconstructAuthoritativeState([commit]);
      expect(result.version).toBe(1);
      expect(result.state.current_route).toBe("local_repo");
    });

    it("should replay multiple commits in sequence", () => {
      const commands = [
        buildTaskCommand({
          task_id: "task-1",
          idempotency_key: "idem-1",
          expected_task_version: 0,
          command_type: "task.select_route",
          payload: { route_id: "local_repo" },
          principal: mockPrincipal,
          boundary: mockBoundary,
          authority: mockAuthority,
          request_context: {},
        }),
        buildTaskCommand({
          task_id: "task-1",
          idempotency_key: "idem-2",
          expected_task_version: 1,
          command_type: "task.transition_state",
          payload: { next_state: "in_progress" },
          principal: mockPrincipal,
          boundary: mockBoundary,
          authority: mockAuthority,
          request_context: {},
        }),
      ];

      const commits: ActionCommit[] = [
        {
          action_id: "action-1",
          command_envelope: commands[0],
          task_version_before: 0,
          task_version_after: 1,
          task_state_after: { current_route: "local_repo", version: 1 },
          created_at: "2026-04-03T00:00:00Z",
        },
        {
          action_id: "action-2",
          command_envelope: commands[1],
          task_version_before: 1,
          task_version_after: 2,
          task_state_after: { state: "in_progress", version: 2 },
          created_at: "2026-04-03T00:00:01Z",
        },
      ];

      const result = reconstructAuthoritativeState(commits);
      expect(result.version).toBe(2);
      expect(result.state.state).toBe("in_progress");
    });
  });

  describe("detectProjectionDivergence", () => {
    it("should return null when states match", () => {
      const state = { current_route: "local_repo", version: 2 };
      const result = detectProjectionDivergence(state, 2, state, 2);
      expect(result).toBeNull();
    });

    it("should detect divergence from version mismatch", () => {
      const authState = { current_route: "local_repo", version: 3 };
      const projState = { current_route: "local_repo", version: 2 };

      const result = detectProjectionDivergence(authState, 3, projState, 2);
      expect(result).not.toBeNull();
      expect(result?.diverged).toBe(true);
      expect(result?.authoritative_version).toBe(3);
      expect(result?.projected_version).toBe(2);
    });

    it("should detect divergence from field differences", () => {
      const authState = { current_route: "github_pr", version: 2 };
      const projState = { current_route: "local_repo", version: 2 };

      const result = detectProjectionDivergence(authState, 2, projState, 2);
      expect(result).not.toBeNull();
      expect(result?.diverged).toBe(true);
      expect(result?.divergent_fields).toContain("current_route");
    });

    it("should detect key set differences", () => {
      const authState = { current_route: "local_repo", state: "ready" };
      const projState = { current_route: "local_repo" };

      const result = detectProjectionDivergence(authState, 2, projState, 2);
      expect(result).not.toBeNull();
      expect(result?.diverged).toBe(true);
    });
  });

  describe("computeProjectionLag", () => {
    it("should compute zero lag when versions match", () => {
      const lag = computeProjectionLag(5, 5);
      expect(lag.projection_lag).toBe(0);
      expect(lag.is_lagging).toBe(false);
    });

    it("should compute positive lag when projected lags", () => {
      const lag = computeProjectionLag(5, 2);
      expect(lag.projection_lag).toBe(3);
      expect(lag.is_lagging).toBe(true);
      expect(lag.authoritative_version).toBe(5);
      expect(lag.projected_version).toBe(2);
    });

    it("should compute zero lag even when projected ahead (not normal)", () => {
      // In normal operation, projected should never be ahead
      const lag = computeProjectionLag(2, 5);
      expect(lag.projection_lag).toBe(0);
      expect(lag.is_lagging).toBe(false);
    });
  });

  describe("planProjectionRepair", () => {
    it("should identify commits to apply for repair", () => {
      const command = buildTaskCommand({
        task_id: "task-1",
        idempotency_key: "idem-1",
        expected_task_version: 1,
        command_type: "task.select_route",
        payload: { route_id: "github_pr" },
        principal: mockPrincipal,
        boundary: mockBoundary,
        authority: mockAuthority,
        request_context: {},
      });

      const commits: ActionCommit[] = [
        {
          action_id: "action-1",
          command_envelope: command,
          task_version_before: 1,
          task_version_after: 2,
          task_state_after: { current_route: "github_pr", version: 2 },
          created_at: "2026-04-03T00:00:00Z",
        },
        {
          action_id: "action-2",
          command_envelope: command,
          task_version_before: 2,
          task_version_after: 3,
          task_state_after: { state: "in_progress", version: 3 },
          created_at: "2026-04-03T00:00:01Z",
        },
      ];

      const plan = planProjectionRepair("task-1", 3, 1, commits);
      expect(plan.commits_to_apply.length).toBe(2);
      expect(plan.projected_version).toBe(1);
      expect(plan.authoritative_version).toBe(3);
    });

    it("should return empty commits for already-synced projection", () => {
      const command = buildTaskCommand({
        task_id: "task-1",
        idempotency_key: "idem-1",
        expected_task_version: 0,
        command_type: "task.select_route",
        payload: { route_id: "local_repo" },
        principal: mockPrincipal,
        boundary: mockBoundary,
        authority: mockAuthority,
        request_context: {},
      });

      const commits: ActionCommit[] = [
        {
          action_id: "action-1",
          command_envelope: command,
          task_version_before: 0,
          task_version_after: 1,
          task_state_after: { version: 1 },
          created_at: "2026-04-03T00:00:00Z",
        },
      ];

      // When projected is already at version 1, no commits between 1 and 1 to apply
      const plan = planProjectionRepair("task-1", 1, 1, commits);
      expect(plan.commits_to_apply.length).toBe(0); // Already synced
    });
  });

  describe("validateRepairPlan", () => {
    it("should validate valid repair plan", () => {
      const command = buildTaskCommand({
        task_id: "task-1",
        idempotency_key: "idem-1",
        expected_task_version: 0,
        command_type: "task.select_route",
        payload: { route_id: "local_repo" },
        principal: mockPrincipal,
        boundary: mockBoundary,
        authority: mockAuthority,
        request_context: {},
      });

      const plan = {
        task_id: "task-1",
        projected_version: 0,
        authoritative_version: 2,
        commits_to_apply: [
          {
            action_id: "action-1",
            command_envelope: command,
            task_version_before: 0,
            task_version_after: 1,
            task_state_after: { version: 1 },
            created_at: "2026-04-03T00:00:00Z",
          },
          {
            action_id: "action-2",
            command_envelope: command,
            task_version_before: 1,
            task_version_after: 2,
            task_state_after: { version: 2 },
            created_at: "2026-04-03T00:00:01Z",
          },
        ],
      };

      const result = validateRepairPlan(plan);
      expect(result.valid).toBe(true);
      expect(result.gaps).toBeUndefined();
    });

    it("should detect gaps in version sequence", () => {
      const command = buildTaskCommand({
        task_id: "task-1",
        idempotency_key: "idem-1",
        expected_task_version: 0,
        command_type: "task.select_route",
        payload: { route_id: "local_repo" },
        principal: mockPrincipal,
        boundary: mockBoundary,
        authority: mockAuthority,
        request_context: {},
      });

      const plan = {
        task_id: "task-1",
        projected_version: 0,
        authoritative_version: 3,
        commits_to_apply: [
          {
            action_id: "action-1",
            command_envelope: command,
            task_version_before: 0,
            task_version_after: 1,
            task_state_after: { version: 1 },
            created_at: "2026-04-03T00:00:00Z",
          },
          {
            action_id: "action-3",
            command_envelope: command,
            task_version_before: 2, // Gap: should be 1
            task_version_after: 3,
            task_state_after: { version: 3 },
            created_at: "2026-04-03T00:00:02Z",
          },
        ],
      };

      const result = validateRepairPlan(plan);
      expect(result.valid).toBe(false);
      expect(result.gaps).toBeDefined();
      expect(result.gaps?.length).toBeGreaterThan(0);
    });
  });
});
