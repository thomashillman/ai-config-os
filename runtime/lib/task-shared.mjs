// Shared task primitives: error classes, findings utilities, readiness view.
// Imported by task-store-core.mjs and task-store-kv.mjs to eliminate duplication.

export class TaskConflictError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'TaskConflictError';
    this.code = 'task_version_conflict';
    this.details = details;
  }
}

export class TaskNotFoundError extends Error {
  constructor(taskId) {
    super(`Task not found: ${taskId}`);
    this.name = 'TaskNotFoundError';
    this.code = 'task_not_found';
    this.details = { taskId };
  }
}

export function summariseFindingsProvenance(findings = []) {
  return findings.reduce((summary, finding) => {
    const status = typeof finding?.provenance?.status === 'string'
      ? finding.provenance.status
      : 'unknown';
    summary[status] = (summary[status] ?? 0) + 1;
    return summary;
  }, {});
}

export function createReadinessView(task, progressEvents = []) {
  const totalSteps = task.progress?.total_steps ?? 0;
  const completedSteps = task.progress?.completed_steps ?? 0;
  return {
    task_id: task.task_id,
    task_type: task.task_type,
    current_route: task.current_route,
    state: task.state,
    next_action: task.next_action,
    route_history: task.route_history,
    readiness: {
      is_ready: task.state === 'active' && completedSteps < totalSteps,
      stronger_route_available: task.task_type === 'review_repository' && task.current_route !== 'local_repo',
      progress_ratio: totalSteps === 0 ? 1 : Number((completedSteps / totalSteps).toFixed(4)),
    },
    findings_provenance: summariseFindingsProvenance(Array.isArray(task.findings) ? task.findings : []),
    progress_event_count: progressEvents.length,
  };
}
