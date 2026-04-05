/**
 * Task Projection Reconciliation -- Helpers for projection repair and divergence detection
 *
 * Step 3: Shadow mode requires proving that:
 * 1. Authoritative state can be reconstructed from commit log
 * 2. Projection (KV) can be repaired from authoritative commits
 * 3. Divergence can be detected before cutover
 *
 * After cutover (Step 4):
 * - KV becomes projection-only
 * - Commits become authoritative
 * - These helpers detect and repair lag
 */

import type { ActionCommit } from "./task-command";

/**
 * Projection lag metadata
 * Attached to task reads to show authoritative vs served state difference
 */
export interface ProjectionLag {
  authoritative_version: number; // Latest version from commit log
  projected_version: number; // Current KV version
  projection_lag: number; // Difference (commits to catch up)
  is_lagging: boolean; // true if projected < authoritative
}

/**
 * Reconstruct authoritative task state from commit log
 * Replays all commits in sequence to produce current state
 *
 * Used for shadow mode verification and divergence detection
 */
export function reconstructAuthoritativeState(commits: ActionCommit[]): {
  state: Record<string, unknown>;
  version: number;
} {
  if (commits.length === 0) {
    return {
      state: {},
      version: 0,
    };
  }

  const orderedCommits = [...commits].sort(
    (a, b) => a.task_version_after - b.task_version_after,
  );
  const latest = orderedCommits[orderedCommits.length - 1];
  return { state: latest.task_state_after, version: latest.task_version_after };
}

/**
 * Detect projection divergence
 * Compares authoritative reconstruction against served state
 *
 * Returns null if states match, otherwise returns divergence info
 */
export function detectProjectionDivergence(
  authoritativeState: Record<string, unknown>,
  authoritativeVersion: number,
  projectedState: Record<string, unknown>,
  projectedVersion: number,
): {
  diverged: boolean;
  authoritative_version: number;
  projected_version: number;
  divergent_fields?: string[];
} | null {
  // Simple version-based divergence detection
  if (authoritativeVersion === projectedVersion) {
    // Versions match, but check if actual state matches
    const authKeys = Object.keys(authoritativeState).sort();
    const projKeys = Object.keys(projectedState).sort();

    if (
      authKeys.length === projKeys.length &&
      authKeys.every((k, i) => k === projKeys[i])
    ) {
      // Same keys, check values
      const divergentFields: string[] = [];
      for (const key of authKeys) {
        if (
          JSON.stringify(authoritativeState[key]) !==
          JSON.stringify(projectedState[key])
        ) {
          divergentFields.push(key);
        }
      }

      if (divergentFields.length === 0) {
        return null; // No divergence
      }

      return {
        diverged: true,
        authoritative_version: authoritativeVersion,
        projected_version: projectedVersion,
        divergent_fields: divergentFields,
      };
    }

    // Different key sets
    return {
      diverged: true,
      authoritative_version: authoritativeVersion,
      projected_version: projectedVersion,
    };
  }

  // Different versions = divergence
  return {
    diverged: true,
    authoritative_version: authoritativeVersion,
    projected_version: projectedVersion,
  };
}

/**
 * Compute projection lag metadata
 * Shows how many commits KV is behind authoritative
 */
export function computeProjectionLag(
  authoritativeVersion: number,
  projectedVersion: number,
): ProjectionLag {
  const lag = authoritativeVersion - projectedVersion;

  return {
    authoritative_version: authoritativeVersion,
    projected_version: projectedVersion,
    projection_lag: Math.max(0, lag),
    is_lagging: lag > 0,
  };
}

/**
 * Strategy for projection repair after cutover
 * Defines how to catch KV up to authoritative version
 */
export interface ProjectionRepairPlan {
  task_id: string;
  authoritative_version: number;
  projected_version: number;
  commits_to_apply: ActionCommit[];
  estimated_duration_ms?: number;
}

/**
 * Plan projection repair
 * Identifies commits needed to catch KV up to authoritative
 */
export function planProjectionRepair(
  taskId: string,
  authoritativeVersion: number,
  projectedVersion: number,
  allCommits: ActionCommit[],
): ProjectionRepairPlan {
  // Commits to apply are those between projected and authoritative versions
  const commitsToApply = allCommits.filter(
    (c) =>
      c.task_version_before >= projectedVersion &&
      c.task_version_after <= authoritativeVersion,
  );

  return {
    task_id: taskId,
    authoritative_version: authoritativeVersion,
    projected_version: projectedVersion,
    commits_to_apply: commitsToApply,
    estimated_duration_ms: commitsToApply.length * 10, // Rough estimate: 10ms per commit
  };
}

/**
 * Validate projection repair plan completeness
 * Ensures no gaps in version sequence
 */
export function validateRepairPlan(plan: ProjectionRepairPlan): {
  valid: boolean;
  gaps?: Array<{ missing_version: number }>;
  error?: string;
} {
  if (plan.commits_to_apply.length === 0) {
    return {
      valid: plan.authoritative_version === plan.projected_version,
      error:
        plan.authoritative_version !== plan.projected_version
          ? `No commits to apply but versions differ: ${plan.projected_version} vs ${plan.authoritative_version}`
          : undefined,
    };
  }

  // Check for gaps in version sequence
  const gaps: Array<{ missing_version: number }> = [];
  let expectedVersion = plan.projected_version;

  for (const commit of plan.commits_to_apply) {
    if (commit.task_version_before !== expectedVersion) {
      gaps.push({ missing_version: commit.task_version_before });
    }
    expectedVersion = commit.task_version_after;
  }

  if (expectedVersion !== plan.authoritative_version) {
    gaps.push({ missing_version: plan.authoritative_version });
  }

  return {
    valid: gaps.length === 0,
    gaps: gaps.length > 0 ? gaps : undefined,
  };
}
