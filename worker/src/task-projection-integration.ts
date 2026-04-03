/**
 * Task Projection Integration -- Wire projection metrics into task reads
 *
 * Step 3.6-3.7: Surface divergence and lag detection
 * Integrates projection reconciliation helpers into the task store layer.
 *
 * Adds projection_lag metadata to task reads so divergence can be detected
 * and monitored before cutover to authoritative store.
 */

import type { ActionCommit } from "./task-command";
import {
  computeProjectionLag,
  reconstructAuthoritativeState,
  detectProjectionDivergence,
} from "./task-projection-reconcile";

/**
 * Extract projection metrics from task state
 * Called on task reads to compute divergence info
 */
export interface TaskProjectionMetrics {
  has_commits: boolean;
  authoritative_version: number | null;
  projected_version: number | null;
  projection_lag: {
    amount: number;
    is_lagging: boolean;
  } | null;
  divergence: {
    detected: boolean;
    fields?: string[];
  } | null;
}

/**
 * Compute projection metrics for a task
 * Compares authoritative state (from commits) with current task state
 *
 * Returns metrics suitable for diagnostic output and divergence detection
 */
export function computeTaskProjectionMetrics(
  taskState: Record<string, unknown>,
  taskVersion: number | null,
  commits: ActionCommit[],
): TaskProjectionMetrics {
  if (!commits || commits.length === 0) {
    return {
      has_commits: false,
      authoritative_version: null,
      projected_version: taskVersion ?? null,
      projection_lag: null,
      divergence: null,
    };
  }

  // Reconstruct authoritative state from commits
  const { state: authState, version: authVersion } =
    reconstructAuthoritativeState(commits);

  const projVersion = taskVersion ?? 0;

  // Compute lag
  const lag = computeProjectionLag(authVersion, projVersion);

  // Detect divergence
  const divergence = detectProjectionDivergence(
    authState,
    authVersion,
    taskState,
    projVersion,
  );

  return {
    has_commits: true,
    authoritative_version: authVersion,
    projected_version: projVersion,
    projection_lag: {
      amount: lag.projection_lag,
      is_lagging: lag.is_lagging,
    },
    divergence: divergence ? { detected: true, fields: divergence.divergent_fields } : { detected: false },
  };
}

/**
 * Attach projection metrics to task response
 * Used in shadow mode to track divergence before cutover
 */
export function attachProjectionMetrics(
  task: Record<string, unknown>,
  metrics: TaskProjectionMetrics,
): Record<string, unknown> {
  return {
    ...task,
    _projection_metrics: metrics,
  };
}

/**
 * Extract projection metrics from task response (for testing)
 */
export function extractProjectionMetrics(
  task: Record<string, unknown>,
): TaskProjectionMetrics | null {
  const metrics = task._projection_metrics;
  if (metrics && typeof metrics === "object") {
    return metrics as TaskProjectionMetrics;
  }
  return null;
}

/**
 * Detect if task is lagging behind authoritative commits
 * Used to identify tasks that need projection repair before cutover
 */
export function isTaskProjectionLagging(
  metrics: TaskProjectionMetrics,
): boolean {
  return metrics.projection_lag?.is_lagging ?? false;
}

/**
 * Detect if task has unexplained divergence
 * Used to identify corruption or bugs before cutover
 */
export function hasProjectionDivergence(
  metrics: TaskProjectionMetrics,
): boolean {
  return metrics.divergence?.detected ?? false;
}

/**
 * Summary of projection health for monitoring
 * Returns human-readable status for logging and alerts
 */
export function getProjectionHealthSummary(
  taskId: string,
  metrics: TaskProjectionMetrics,
): string {
  if (!metrics.has_commits) {
    return `[${taskId}] No commits found`;
  }

  const parts: string[] = [
    `[${taskId}]`,
    `auth_v${metrics.authoritative_version}`,
    `proj_v${metrics.projected_version}`,
  ];

  if (metrics.projection_lag?.is_lagging) {
    parts.push(`lag=${metrics.projection_lag.amount}`);
  }

  if (metrics.divergence?.detected) {
    parts.push("⚠️ DIVERGENCE");
    if (metrics.divergence.fields) {
      parts.push(`fields=[${metrics.divergence.fields.join(",")}]`);
    }
  } else {
    parts.push("✓ synced");
  }

  return parts.join(" ");
}
