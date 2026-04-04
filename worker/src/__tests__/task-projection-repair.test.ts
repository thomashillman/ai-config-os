/**
 * task-projection-repair.test.ts
 * 
 * Tests for projection repair from authoritative history
 * Backlog Item 2: Verify projection can be rebuilt from authoritative commits
 */

import { describe, it, expect } from "vitest";
import {
  planProjectionRepair,
  validateRepairPlan,
  reconstructAuthoritativeState,
} from "../task-projection-reconcile";
import type { ActionCommit } from "../task-command";

describe("Projection repair from authoritative history", () => {
  describe("repair plan generation", () => {
    it("should identify no commits needed when versions match", () => {
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

      const plan = planProjectionRepair("task-1", 1, 1, mockCommits);

      expect(plan.task_id).toBe("task-1");
      expect(plan.authoritative_version).toBe(1);
      expect(plan.projected_version).toBe(1);
      // When versions are equal, no commits need to be applied
      expect(plan.commits_to_apply.length).toBe(0);
    });

    it("should identify commits needed to catch up lagging projection", () => {
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
        },
        {
          action_id: "act-3",
          task_id: "task-1",
          command_type: "task.append_finding",
          command_digest: "digest-3",
          principal_id: "user-1",
          authority: {
            authority_mode: "direct_owner",
            allowed_actions: [],
            stamped_at: "2026-04-04T00:00:02Z"
          },
          created_at: "2026-04-04T00:00:02Z",
          task_version_before: 2,
          task_version_after: 3,
          result: { success: true },
          result_summary: "Finding appended",
          task_state_after: {
            state: "ready",
            current_route: "local_repo",
            findings: [{ findingId: "f-1", summary: "test" }]
          },
          command_envelope: {} as any
        }
      ];

      // Projection is at version 1, authoritative at version 3
      const plan = planProjectionRepair("task-1", 3, 1, mockCommits);

      expect(plan.task_id).toBe("task-1");
      expect(plan.authoritative_version).toBe(3);
      expect(plan.projected_version).toBe(1);
      expect(plan.commits_to_apply.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("repair plan validation", () => {
    it("should validate complete repair plan", () => {
      const mockCommit: ActionCommit = {
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
      };

      const plan = {
        task_id: "task-1",
        authoritative_version: 1,
        projected_version: 0,
        commits_to_apply: [mockCommit]
      };

      const result = validateRepairPlan(plan);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should flag invalid repair plan when versions don't match", () => {
      const plan = {
        task_id: "task-1",
        authoritative_version: 5,
        projected_version: 0,
        commits_to_apply: [] // No commits to apply but versions differ
      };

      const result = validateRepairPlan(plan);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should validate when versions are already equal", () => {
      const plan = {
        task_id: "task-1",
        authoritative_version: 3,
        projected_version: 3,
        commits_to_apply: []
      };

      const result = validateRepairPlan(plan);

      expect(result.valid).toBe(true);
    });
  });

  describe("scenario: rebuild task from authoritative history", () => {
    it("should reconstruct task state from sequence of commits", () => {
      const commits: ActionCommit[] = [
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

      const { state, version } = reconstructAuthoritativeState(commits);

      expect(version).toBe(2);
      expect(state).toBeDefined();
      expect(state.current_route).toBe("local_repo");
      expect(state.state).toBe("ready");
    });

    it("should return empty state for no commits", () => {
      const { state, version } = reconstructAuthoritativeState([]);

      expect(version).toBe(0);
      expect(Object.keys(state).length).toBe(0);
    });

    it("should produce consistent state from same commit sequence", () => {
      const commits: ActionCommit[] = [
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
          task_state_after: { current_route: "local_repo", version: 1 },
          command_envelope: {} as any
        }
      ];

      const result1 = reconstructAuthoritativeState(commits);
      const result2 = reconstructAuthoritativeState(commits);

      expect(result1.version).toBe(result2.version);
      expect(JSON.stringify(result1.state)).toBe(JSON.stringify(result2.state));
    });
  });

  describe("end-to-end repair scenario", () => {
    it("should repair lagging projection to match authoritative", () => {
      // Setup: 3 commits have been applied authoritative,
      // but projection only has first commit
      const allCommits: ActionCommit[] = [
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
        },
        {
          action_id: "act-3",
          task_id: "task-1",
          command_type: "task.append_finding",
          command_digest: "digest-3",
          principal_id: "user-1",
          authority: {
            authority_mode: "direct_owner",
            allowed_actions: [],
            stamped_at: "2026-04-04T00:00:02Z"
          },
          created_at: "2026-04-04T00:00:02Z",
          task_version_before: 2,
          task_version_after: 3,
          result: { success: true },
          result_summary: "Finding appended",
          task_state_after: {
            state: "ready",
            current_route: "local_repo",
            findings: [{ findingId: "f-1", summary: "test" }]
          },
          command_envelope: {} as any
        }
      ];

      // Step 1: Detect lag
      const authoritative = reconstructAuthoritativeState(allCommits);
      expect(authoritative.version).toBe(3);

      // Projection is only at v1
      const projectedVersion = 1;

      // Step 2: Plan repair
      const repairPlan = planProjectionRepair("task-1", 3, projectedVersion, allCommits);
      expect(repairPlan.authoritative_version).toBe(3);
      expect(repairPlan.projected_version).toBe(1);

      // Step 3: Validate repair plan is viable
      const planValid = validateRepairPlan(repairPlan);
      expect(planValid.valid).toBe(true);

      // Step 4: After repair applied, projection catches up
      const repairedProjection = reconstructAuthoritativeState(
        allCommits.slice(projectedVersion) // Apply missing commits
      );
      expect(repairedProjection.version).toBeGreaterThanOrEqual(2);
    });
  });
});
