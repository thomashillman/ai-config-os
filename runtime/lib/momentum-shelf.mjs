// Momentum Shelf — ranks continuable tasks by environment-aware continuation value.
// Pure function: no side effects.

import { validateContract } from '../../shared/contracts/validate.mjs';

function validateShelfEntry(entry) {
  return validateContract('shelfEntry', entry);
}

const ROUTE_STRENGTH_ORDER = ['pasted_diff', 'github_pr', 'uploaded_bundle', 'local_repo'];

function routeStrengthIndex(routeId) {
  const idx = ROUTE_STRENGTH_ORDER.indexOf(routeId);
  return idx >= 0 ? idx : -1;
}

function classifyEnvironmentFit(currentRoute, bestRoute) {
  const currentIdx = routeStrengthIndex(currentRoute);
  const bestIdx = routeStrengthIndex(bestRoute);
  if (bestIdx > currentIdx) return 'strong';
  if (bestIdx === currentIdx) return 'neutral';
  return 'weak';
}

function countPendingVerification(findings) {
  return (findings || []).filter(
    (f) => f?.provenance?.status === 'hypothesis' || f?.provenance?.status === 'reused',
  ).length;
}

function getLastActivityTime(task) {
  return new Date(task.updated_at || 0).getTime();
}

function getProgressRatio(task) {
  const total = task.progress?.total_steps || 0;
  const completed = task.progress?.completed_steps || 0;
  return total === 0 ? 0 : completed / total;
}

function determineBestRoute(task) {
  const currentIdx = routeStrengthIndex(task.current_route);
  // The strongest route is always local_repo for review_repository tasks
  // For other task types, we just check if there's a stronger route available
  const strongestIdx = ROUTE_STRENGTH_ORDER.length - 1;
  if (strongestIdx > currentIdx) {
    return ROUTE_STRENGTH_ORDER[strongestIdx];
  }
  return task.current_route;
}

export function buildMomentumShelf({ tasks, currentCapabilities, narrator } = {}) {
  if (!Array.isArray(tasks) || tasks.length === 0) return [];

  const activeTasks = tasks.filter(
    (t) => t.state !== 'completed' && t.state !== 'failed',
  );

  const scored = activeTasks.map((task) => {
    const bestRoute = determineBestRoute(task);
    const fit = classifyEnvironmentFit(task.current_route, bestRoute);
    const pendingVerification = countPendingVerification(task.findings);
    const recency = getLastActivityTime(task);
    const progressRatio = getProgressRatio(task);
    const routeUpgradeAvailable = bestRoute !== task.current_route;

    // Weighted scoring: environment fit (3x), pending findings (2x), recency, progress
    const fitScore = fit === 'strong' ? 3 : (fit === 'neutral' ? 1 : 0);
    const score = (fitScore * 1000) + (pendingVerification * 100) + (recency / 1e12) + progressRatio;

    return {
      task,
      bestRoute,
      fit,
      pendingVerification,
      routeUpgradeAvailable,
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  // Build shelf entries, using narrator if available for headlines
  const narratorOutputs = narrator
    ? narrator.onShelfView(scored.map((s) => s.task), currentCapabilities)
    : null;

  return scored.map((entry, index) => {
    const narratorEntry = narratorOutputs ? narratorOutputs[index] : null;
    const findingsCount = (entry.task.findings || []).length;

    return validateShelfEntry({
      task_id: entry.task.task_id,
      rank: index + 1,
      headline: narratorEntry?.headline || `${entry.task.task_type} — ${findingsCount} findings`,
      continuation_reason: narratorEntry?.continuation_reason || (
        entry.routeUpgradeAvailable
          ? 'Route upgrade available for deeper analysis'
          : 'Resume to continue'
      ),
      environment_fit: entry.fit,
      findings_pending_verification: entry.pendingVerification,
      route_upgrade_available: entry.routeUpgradeAvailable,
      current_route: entry.task.current_route,
      best_route: entry.bestRoute,
    });
  });
}
