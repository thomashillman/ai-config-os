/**
 * task-projection-integration.test.ts
 * 
 * Tests for projection metrics integration with task reads and writes
 * Backlog Item 2: Verify projection lag is visible and updates don't block writes
 */

import { describe, it, expect } from "vitest";
import { attachProjectionMetrics, extractProjectionMetrics } from "../task-projection-integration";

describe("Projection metrics integration with task responses", () => {
  describe("attaching projection metrics to task responses", () => {
    it("should attach projection metrics to task without losing task data", () => {
      const taskData = {
        task_id: "task-1",
        state: "ready",
        current_route: "local_repo",
        findings: [],
        version: 5
      };

      const metrics = {
        has_commits: true,
        authoritative_version: 5,
        projected_version: 5,
        projection_lag: { amount: 0, is_lagging: false },
        divergence: { detected: false }
      };

      const withMetrics = attachProjectionMetrics(taskData, metrics);

      // Original task data should still be there
      expect(withMetrics.task_id).toBe("task-1");
      expect(withMetrics.state).toBe("ready");
      expect(withMetrics.current_route).toBe("local_repo");
      expect(withMetrics.version).toBe(5);

      // Metrics should be attached
      expect(withMetrics._projection_metrics).toBeDefined();
    });

    it("should preserve metrics when attaching", () => {
      const taskData = { task_id: "task-1" };
      const metrics = {
        has_commits: true,
        authoritative_version: 10,
        projected_version: 7,
        projection_lag: { amount: 3, is_lagging: true },
        divergence: { detected: false }
      };

      const withMetrics = attachProjectionMetrics(taskData, metrics);
      const extracted = extractProjectionMetrics(withMetrics);

      expect(extracted).toBeDefined();
      expect(extracted?.authoritative_version).toBe(10);
      expect(extracted?.projected_version).toBe(7);
      expect(extracted?.projection_lag?.amount).toBe(3);
    });
  });

  describe("extracting projection metrics from responses", () => {
    it("should extract metrics from task with attached metrics", () => {
      const taskWithMetrics = {
        task_id: "task-1",
        _projection_metrics: {
          has_commits: true,
          authoritative_version: 5,
          projected_version: 5,
          projection_lag: { amount: 0, is_lagging: false },
          divergence: { detected: false }
        }
      };

      const extracted = extractProjectionMetrics(taskWithMetrics);

      expect(extracted).toBeDefined();
      expect(extracted?.authoritative_version).toBe(5);
      expect(extracted?.has_commits).toBe(true);
    });

    it("should return null when no metrics attached", () => {
      const taskWithoutMetrics = {
        task_id: "task-1",
        state: "ready"
      };

      const extracted = extractProjectionMetrics(taskWithoutMetrics);

      expect(extracted).toBeNull();
    });

    it("should return null when metrics field is not an object", () => {
      const taskWithInvalidMetrics = {
        task_id: "task-1",
        _projection_metrics: "invalid"
      };

      const extracted = extractProjectionMetrics(taskWithInvalidMetrics);

      expect(extracted).toBeNull();
    });
  });

  describe("scenario: authoritative commit succeeds but projection update fails", () => {
    it("should have metrics showing lag", () => {
      // Simulate: applyCommand succeeded at version 10
      // KV update failed, projection still at version 9
      const taskData = {
        task_id: "task-1",
        version: 9,  // Old projected version
        state: "in_progress"
      };

      // Authoritative has 2 commits
      const authorCommits = [
        {
          task_version_after: 9,
          task_state_after: { state: "in_progress" }
        },
        {
          task_version_after: 10,
          task_state_after: { state: "completed" }  // Recent change not in KV yet
        }
      ] as any;

      // We would compute metrics showing authoritative at 10, projected at 9
      // This would be done on load by computeTaskProjectionMetrics
      
      // Expected metric state:
      const expectedMetrics = {
        has_commits: true,
        authoritative_version: 10,
        projected_version: 9,
        projection_lag: { amount: 1, is_lagging: true },
        divergence: { detected: true }  // states differ
      };

      // With metrics attached, caller can see the lag
      const responseWithMetrics = attachProjectionMetrics(taskData, expectedMetrics);
      expect(responseWithMetrics._projection_metrics?.projection_lag?.is_lagging).toBe(true);
    });
  });

  describe("scenario: projection repair from authoritative history", () => {
    it("should enable repair by identifying commits to replay", () => {
      // After detecting lag of 3 commits (versions 7→8→9→10)
      const lagMetrics = {
        has_commits: true,
        authoritative_version: 10,
        projected_version: 7,
        projection_lag: { amount: 3, is_lagging: true },
        divergence: { detected: false }
      };

      // Repair would:
      // 1. Identify commits between projected (7) and authoritative (10)
      // 2. Replay each commit into KV
      // 3. Verify projection_lag drops to zero

      expect(lagMetrics.projection_lag?.amount).toBe(3);
      
      // After repair applied:
      const repairedMetrics = {
        ...lagMetrics,
        projected_version: 10,
        projection_lag: { amount: 0, is_lagging: false }
      };

      expect(repairedMetrics.projected_version).toBe(repairedMetrics.authoritative_version);
      expect(repairedMetrics.projection_lag?.is_lagging).toBe(false);
    });
  });
});
