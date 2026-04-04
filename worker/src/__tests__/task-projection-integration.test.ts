import { describe, it, expect } from "vitest";
import {
  computeTaskProjectionMetrics,
  attachProjectionMetrics,
  extractProjectionMetrics,
  isTaskProjectionLagging,
  hasProjectionDivergence,
  getProjectionHealthSummary,
} from "../task-projection-integration";
import { buildTaskCommand } from "../task-command";
import type { ActionCommit } from "../task-command";
import type { Principal, Boundary, Authority } from "../task-command";

describe("Task Projection Integration", () => {
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

  describe("computeTaskProjectionMetrics", () => {
    it("should return no-commits metrics when commits array is empty", () => {
      const metrics = computeTaskProjectionMetrics({}, 1, []);
      expect(metrics.has_commits).toBe(false);
      expect(metrics.authoritative_version).toBeNull();
      expect(metrics.projection_lag).toBeNull();
      expect(metrics.divergence).toBeNull();
    });

    it("should compute metrics when task is synced", () => {
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

      const taskState = { current_route: "local_repo", version: 1 };
      const metrics = computeTaskProjectionMetrics(taskState, 1, [commit]);

      expect(metrics.has_commits).toBe(true);
      expect(metrics.authoritative_version).toBe(1);
      expect(metrics.projected_version).toBe(1);
      expect(metrics.projection_lag?.amount).toBe(0);
      expect(metrics.projection_lag?.is_lagging).toBe(false);
    });

    it("should detect lag when projection lags behind", () => {
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
          task_state_after: { current_route: "local_repo", version: 1 },
          created_at: "2026-04-03T00:00:00Z",
        },
        {
          action_id: "action-2",
          command_envelope: command,
          task_version_before: 1,
          task_version_after: 2,
          task_state_after: { state: "in_progress", version: 2 },
          created_at: "2026-04-03T00:00:01Z",
        },
      ];

      const taskState = { current_route: "local_repo", version: 1 }; // Lagging at version 1
      const metrics = computeTaskProjectionMetrics(taskState, 1, commits);

      expect(metrics.authoritative_version).toBe(2);
      expect(metrics.projected_version).toBe(1);
      expect(metrics.projection_lag?.amount).toBe(1);
      expect(metrics.projection_lag?.is_lagging).toBe(true);
    });

    it("should detect divergence when state differs", () => {
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

      const taskState = { current_route: "github_pr", version: 1 }; // Different route
      const metrics = computeTaskProjectionMetrics(taskState, 1, [commit]);

      expect(metrics.divergence?.detected).toBe(true);
      if (metrics.divergence?.fields) {
        expect(metrics.divergence.fields).toContain("current_route");
      }
    });
  });

  describe("attachProjectionMetrics", () => {
    it("should attach metrics to task response", () => {
      const task = { task_id: "task-1", version: 1 };
      const metrics = {
        has_commits: true,
        authoritative_version: 1,
        projected_version: 1,
        projection_lag: { amount: 0, is_lagging: false },
        divergence: { detected: false },
      };

      const result = attachProjectionMetrics(task, metrics);
      expect(result._projection_metrics).toBeDefined();
      expect(result._projection_metrics).toEqual(metrics);
      expect(result.task_id).toBe("task-1"); // Original fields preserved
    });
  });

  describe("extractProjectionMetrics", () => {
    it("should extract metrics from task response", () => {
      const metrics = {
        has_commits: true,
        authoritative_version: 2,
        projected_version: 1,
        projection_lag: { amount: 1, is_lagging: true },
        divergence: { detected: false },
      };

      const task = {
        task_id: "task-1",
        _projection_metrics: metrics,
      };

      const extracted = extractProjectionMetrics(task);
      expect(extracted).toEqual(metrics);
    });

    it("should return null when no metrics attached", () => {
      const task = { task_id: "task-1" };
      const extracted = extractProjectionMetrics(task);
      expect(extracted).toBeNull();
    });
  });

  describe("isTaskProjectionLagging", () => {
    it("should return true when lagging", () => {
      const metrics = {
        has_commits: true,
        authoritative_version: 2,
        projected_version: 1,
        projection_lag: { amount: 1, is_lagging: true },
        divergence: { detected: false },
      };

      expect(isTaskProjectionLagging(metrics)).toBe(true);
    });

    it("should return false when synced", () => {
      const metrics = {
        has_commits: true,
        authoritative_version: 1,
        projected_version: 1,
        projection_lag: { amount: 0, is_lagging: false },
        divergence: { detected: false },
      };

      expect(isTaskProjectionLagging(metrics)).toBe(false);
    });

    it("should return false when no lag info", () => {
      const metrics = {
        has_commits: false,
        authoritative_version: null,
        projected_version: null,
        projection_lag: null,
        divergence: null,
      };

      expect(isTaskProjectionLagging(metrics)).toBe(false);
    });
  });

  describe("hasProjectionDivergence", () => {
    it("should return true when divergence detected", () => {
      const metrics = {
        has_commits: true,
        authoritative_version: 1,
        projected_version: 1,
        projection_lag: { amount: 0, is_lagging: false },
        divergence: { detected: true, fields: ["current_route"] },
      };

      expect(hasProjectionDivergence(metrics)).toBe(true);
    });

    it("should return false when synced", () => {
      const metrics = {
        has_commits: true,
        authoritative_version: 1,
        projected_version: 1,
        projection_lag: { amount: 0, is_lagging: false },
        divergence: { detected: false },
      };

      expect(hasProjectionDivergence(metrics)).toBe(false);
    });
  });

  describe("getProjectionHealthSummary", () => {
    it("should generate summary for synced task", () => {
      const metrics = {
        has_commits: true,
        authoritative_version: 2,
        projected_version: 2,
        projection_lag: { amount: 0, is_lagging: false },
        divergence: { detected: false },
      };

      const summary = getProjectionHealthSummary("task-1", metrics);
      expect(summary).toContain("task-1");
      expect(summary).toContain("auth_v2");
      expect(summary).toContain("proj_v2");
      expect(summary).toContain("✓ synced");
    });

    it("should generate summary for lagging task", () => {
      const metrics = {
        has_commits: true,
        authoritative_version: 3,
        projected_version: 1,
        projection_lag: { amount: 2, is_lagging: true },
        divergence: { detected: false },
      };

      const summary = getProjectionHealthSummary("task-2", metrics);
      expect(summary).toContain("task-2");
      expect(summary).toContain("lag=2");
    });

    it("should highlight divergence in summary", () => {
      const metrics = {
        has_commits: true,
        authoritative_version: 2,
        projected_version: 2,
        projection_lag: { amount: 0, is_lagging: false },
        divergence: { detected: true, fields: ["state", "route"] },
      };

      const summary = getProjectionHealthSummary("task-3", metrics);
      expect(summary).toContain("⚠️ DIVERGENCE");
      expect(summary).toContain("state");
      expect(summary).toContain("route");
    });

    it("should indicate no commits", () => {
      const metrics = {
        has_commits: false,
        authoritative_version: null,
        projected_version: null,
        projection_lag: null,
        divergence: null,
      };

      const summary = getProjectionHealthSummary("task-4", metrics);
      expect(summary).toContain("No commits");
    });
  });
});
