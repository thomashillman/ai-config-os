/**
 * task-projection-lag.test.ts
 * 
 * Tests for projection lag visibility and repairability
 * Backlog Item 2: Ensure KV is a projection with visible lag and repairable state
 */

import { describe, it, expect } from "vitest";
import { computeProjectionLag } from "../task-projection-reconcile";
import { 
  computeTaskProjectionMetrics,
  isTaskProjectionLagging,
  getProjectionHealthSummary 
} from "../task-projection-integration";
import type { ActionCommit } from "../task-command";

describe("Projection lag visibility and repairability", () => {
  describe("projection lag computation", () => {
    it("should compute zero lag when versions match", () => {
      const lag = computeProjectionLag(5, 5);
      
      expect(lag.authoritative_version).toBe(5);
      expect(lag.projected_version).toBe(5);
      expect(lag.projection_lag).toBe(0);
      expect(lag.is_lagging).toBe(false);
    });

    it("should compute positive lag when projected is behind", () => {
      const lag = computeProjectionLag(10, 7);
      
      expect(lag.authoritative_version).toBe(10);
      expect(lag.projected_version).toBe(7);
      expect(lag.projection_lag).toBe(3);
      expect(lag.is_lagging).toBe(true);
    });

    it("should show zero lag when projected is ahead (should not happen)", () => {
      const lag = computeProjectionLag(5, 10);
      
      expect(lag.projection_lag).toBe(0);
      expect(lag.is_lagging).toBe(false);
    });
  });

  describe("projection metrics from task state and commits", () => {
    it("should report no commits when commit list is empty", () => {
      const metrics = computeTaskProjectionMetrics(
        { state: "ready" },
        1,
        []
      );

      expect(metrics.has_commits).toBe(false);
      expect(metrics.authoritative_version).toBeNull();
      expect(metrics.projected_version).toBe(1);
      expect(metrics.projection_lag).toBeNull();
    });

    it("should detect lag between authoritative and projected versions", () => {
      // Create mock commits
      const mockCommits: ActionCommit[] = [
        {
          action_id: "act-1",
          task_id: "task-1",
          command_type: "task.select_route",
          command_digest: "digest-1",
          principal_id: "user-1",
          authority: {
            authority_mode: "direct_owner",
            allowed_actions: [],
            stamped_at: "2026-04-04T00:00:00Z"
          },
          created_at: "2026-04-04T00:00:00Z",
          task_version_before: 0,
          task_version_after: 1,
          result: { success: true },
          result_summary: "Route selected",
          task_state_after: { current_route: "local_repo" },
          command_envelope: {} as any
        },
        {
          action_id: "act-2",
          task_id: "task-1",
          command_type: "task.transition_state",
          command_digest: "digest-2",
          principal_id: "user-1",
          authority: {
            authority_mode: "direct_owner",
            allowed_actions: [],
            stamped_at: "2026-04-04T00:00:01Z"
          },
          created_at: "2026-04-04T00:00:01Z",
          task_version_before: 1,
          task_version_after: 2,
          result: { success: true },
          result_summary: "State transitioned",
          task_state_after: { state: "ready", current_route: "local_repo" },
          command_envelope: {} as any
        }
      ];

      // Projected is only at version 1 (behind authoritative version 2)
      const metrics = computeTaskProjectionMetrics(
        { current_route: "local_repo" },  // Old projected state
        1,
        mockCommits
      );

      expect(metrics.has_commits).toBe(true);
      expect(metrics.authoritative_version).toBe(2);
      expect(metrics.projected_version).toBe(1);
      expect(metrics.projection_lag?.amount).toBe(1);
      expect(metrics.projection_lag?.is_lagging).toBe(true);
    });

    it("should detect no lag when versions match", () => {
      const mockCommits: ActionCommit[] = [
        {
          action_id: "act-1",
          task_id: "task-1",
          command_type: "task.select_route",
          command_digest: "digest-1",
          principal_id: "user-1",
          authority: {
            authority_mode: "direct_owner",
            allowed_actions: [],
            stamped_at: "2026-04-04T00:00:00Z"
          },
          created_at: "2026-04-04T00:00:00Z",
          task_version_before: 0,
          task_version_after: 1,
          result: { success: true },
          result_summary: "Route selected",
          task_state_after: { current_route: "local_repo" },
          command_envelope: {} as any
        }
      ];

      const metrics = computeTaskProjectionMetrics(
        { current_route: "local_repo" },
        1,
        mockCommits
      );

      expect(metrics.has_commits).toBe(true);
      expect(metrics.authoritative_version).toBe(1);
      expect(metrics.projected_version).toBe(1);
      expect(metrics.projection_lag?.amount).toBe(0);
      expect(metrics.projection_lag?.is_lagging).toBe(false);
    });
  });

  describe("projection health monitoring", () => {
    it("should report healthy summary when no lag and no divergence", () => {
      const metrics = {
        has_commits: true,
        authoritative_version: 5,
        projected_version: 5,
        projection_lag: { amount: 0, is_lagging: false },
        divergence: { detected: false }
      };

      const summary = getProjectionHealthSummary("task-1", metrics);
      
      expect(summary).toContain("task-1");
      expect(summary).toContain("auth_v5");
      expect(summary).toContain("proj_v5");
      expect(summary).toContain("synced");
      expect(summary).not.toContain("DIVERGENCE");
    });

    it("should report lag in health summary", () => {
      const metrics = {
        has_commits: true,
        authoritative_version: 10,
        projected_version: 7,
        projection_lag: { amount: 3, is_lagging: true },
        divergence: { detected: false }
      };

      const summary = getProjectionHealthSummary("task-1", metrics);
      
      expect(summary).toContain("lag=3");
    });

    it("should report divergence in health summary", () => {
      const metrics = {
        has_commits: true,
        authoritative_version: 5,
        projected_version: 5,
        projection_lag: { amount: 0, is_lagging: false },
        divergence: { detected: true, fields: ["current_route", "state"] }
      };

      const summary = getProjectionHealthSummary("task-1", metrics);
      
      expect(summary).toContain("DIVERGENCE");
      expect(summary).toContain("current_route");
    });
  });

  describe("projection lag detection utility", () => {
    it("should detect lagging projection", () => {
      const metrics = {
        has_commits: true,
        authoritative_version: 10,
        projected_version: 7,
        projection_lag: { amount: 3, is_lagging: true },
        divergence: { detected: false }
      };

      expect(isTaskProjectionLagging(metrics)).toBe(true);
    });

    it("should detect non-lagging projection", () => {
      const metrics = {
        has_commits: true,
        authoritative_version: 5,
        projected_version: 5,
        projection_lag: { amount: 0, is_lagging: false },
        divergence: { detected: false }
      };

      expect(isTaskProjectionLagging(metrics)).toBe(false);
    });
  });
});
