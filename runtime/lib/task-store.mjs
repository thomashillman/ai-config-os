import { validateContract } from '../../shared/contracts/validate.mjs';
import { transitionPortableTaskState, appendRouteSelection } from './portable-task-lifecycle.mjs';
import { appendFindingToTask, transitionFindingsForRouteUpgrade } from './findings-ledger.mjs';
import { ProgressEventStore } from './progress-event-pipeline.mjs';
import { createContinuationPackage } from './continuation-package.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

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

function createSnapshot(task) {
  return validateContract('taskStateSnapshot', {
    schema_version: '1.0.0',
    task_id: task.task_id,
    snapshot_version: task.version,
    created_at: task.updated_at,
    task,
  });
}

export class TaskStore {
  constructor() {
    this.tasks = new Map();
    this.snapshots = new Map();
    this.progressEvents = new ProgressEventStore();
  }

  create(task) {
    const validated = validateContract('portableTaskObject', clone(task));
    if (this.tasks.has(validated.task_id)) {
      throw new TaskConflictError(`Task already exists: ${validated.task_id}`, { taskId: validated.task_id });
    }

    this.tasks.set(validated.task_id, validated);
    this.snapshots.set(validated.task_id, [createSnapshot(validated)]);
    return clone(validated);
  }

  load(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }
    return clone(task);
  }

  update(taskId, { expectedVersion, changes }) {
    const current = this.tasks.get(taskId);
    if (!current) {
      throw new TaskNotFoundError(taskId);
    }

    if (current.version !== expectedVersion) {
      throw new TaskConflictError(`Version conflict for ${taskId}: expected ${expectedVersion}, current ${current.version}`, {
        taskId,
        expectedVersion,
        currentVersion: current.version,
      });
    }

    const next = {
      ...current,
      ...clone(changes),
      version: current.version + 1,
    };

    const validated = validateContract('portableTaskObject', next);
    this.tasks.set(taskId, validated);

    const nextSnapshot = createSnapshot(validated);
    const snapshots = this.snapshots.get(taskId) || [];
    snapshots.push(nextSnapshot);
    this.snapshots.set(taskId, snapshots);

    return clone(validated);
  }


  transitionState(taskId, { expectedVersion, nextState, nextAction, updatedAt, progress }) {
    const current = this.tasks.get(taskId);
    if (!current) {
      throw new TaskNotFoundError(taskId);
    }

    if (current.version !== expectedVersion) {
      throw new TaskConflictError(`Version conflict for ${taskId}: expected ${expectedVersion}, current ${current.version}`, {
        taskId,
        expectedVersion,
        currentVersion: current.version,
      });
    }

    const validated = transitionPortableTaskState({
      task: current,
      expectedVersion,
      nextState,
      nextAction,
      updatedAt,
      progress,
    });

    this.tasks.set(taskId, validated);

    const nextSnapshot = createSnapshot(validated);
    const snapshots = this.snapshots.get(taskId) || [];
    snapshots.push(nextSnapshot);
    this.snapshots.set(taskId, snapshots);

    this.progressEvents.append({
      taskId,
      eventId: `evt_${validated.version}_state_change`,
      type: 'state_change',
      message: `Task transitioned to ${validated.state}.`,
      createdAt: updatedAt,
      metadata: {
        next_state: validated.state,
        completed_steps: validated.progress.completed_steps,
        total_steps: validated.progress.total_steps,
      },
    });

    return clone(validated);
  }


  appendFinding(taskId, { expectedVersion, finding, updatedAt }) {
    const current = this.tasks.get(taskId);
    if (!current) {
      throw new TaskNotFoundError(taskId);
    }

    if (current.version !== expectedVersion) {
      throw new TaskConflictError(`Version conflict for ${taskId}: expected ${expectedVersion}, current ${current.version}`, {
        taskId,
        expectedVersion,
        currentVersion: current.version,
      });
    }

    const next = appendFindingToTask({
      task: current,
      expectedVersion,
      finding,
      updatedAt,
    });

    this.tasks.set(taskId, next);

    const nextSnapshot = createSnapshot(next);
    const snapshots = this.snapshots.get(taskId) || [];
    snapshots.push(nextSnapshot);
    this.snapshots.set(taskId, snapshots);

    this.progressEvents.append({
      taskId,
      eventId: `evt_${next.version}_finding_recorded`,
      type: 'finding_recorded',
      message: `Recorded finding ${next.findings[next.findings.length - 1].finding_id}.`,
      createdAt: updatedAt,
      metadata: {
        finding_id: next.findings[next.findings.length - 1].finding_id,
        provenance_status: next.findings[next.findings.length - 1].provenance.status,
      },
    });

    return clone(next);
  }

  transitionFindingsForRouteUpgrade(taskId, { expectedVersion, toRouteId, upgradedAt, toEquivalenceLevel }) {
    const current = this.tasks.get(taskId);
    if (!current) {
      throw new TaskNotFoundError(taskId);
    }

    if (current.version !== expectedVersion) {
      throw new TaskConflictError(`Version conflict for ${taskId}: expected ${expectedVersion}, current ${current.version}`, {
        taskId,
        expectedVersion,
        currentVersion: current.version,
      });
    }

    const transitionedFindings = transitionFindingsForRouteUpgrade({
      findings: current.findings,
      toRouteId,
      upgradedAt,
      toEquivalenceLevel,
    });

    const next = validateContract('portableTaskObject', {
      ...clone(current),
      findings: transitionedFindings,
      version: current.version + 1,
      updated_at: upgradedAt,
    });

    this.tasks.set(taskId, next);

    const nextSnapshot = createSnapshot(next);
    const snapshots = this.snapshots.get(taskId) || [];
    snapshots.push(nextSnapshot);
    this.snapshots.set(taskId, snapshots);
    const reclassifiedCount = transitionedFindings.reduce((count, nextFinding, index) => {
      const previousFinding = current.findings[index];
      if (!previousFinding) {
        return count + 1;
      }

      const statusChanged = previousFinding.provenance.status !== nextFinding.provenance.status;
      const routeChanged = previousFinding.provenance.recorded_by_route !== nextFinding.provenance.recorded_by_route;
      return (statusChanged || routeChanged) ? count + 1 : count;
    }, 0);

    this.progressEvents.append({
      taskId,
      eventId: `evt_${next.version}_finding_transitioned`,
      type: 'finding_transitioned',
      message: `Updated findings provenance for route upgrade to ${toRouteId}.`,
      createdAt: upgradedAt,
      metadata: {
        route_id: toRouteId,
        reclassified_count: reclassifiedCount,
        equivalence_level: toEquivalenceLevel,
      },
    });

    return clone(next);
  }

  selectRoute(taskId, { routeId, expectedVersion, selectedAt }) {
    const current = this.tasks.get(taskId);
    if (!current) {
      throw new TaskNotFoundError(taskId);
    }

    if (current.version !== expectedVersion) {
      throw new TaskConflictError(`Version conflict for ${taskId}: expected ${expectedVersion}, current ${current.version}`, {
        taskId,
        expectedVersion,
        currentVersion: current.version,
      });
    }

    const next = appendRouteSelection({
      task: current,
      routeId,
      expectedVersion,
      selectedAt,
    });

    this.tasks.set(taskId, next);

    const nextSnapshot = createSnapshot(next);
    const snapshots = this.snapshots.get(taskId) || [];
    snapshots.push(nextSnapshot);
    this.snapshots.set(taskId, snapshots);

    this.progressEvents.append({
      taskId,
      eventId: `evt_${next.version}_route_selected`,
      type: 'route_selected',
      message: `Selected route ${routeId}.`,
      createdAt: selectedAt,
      metadata: {
        route_id: routeId,
      },
    });

    return clone(next);
  }


  createContinuationPackage(taskId, { effectiveExecutionContract, handoffTokenId, createdAt = new Date().toISOString() }) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    const continuationPackage = createContinuationPackage({
      task,
      effectiveExecutionContract,
      handoffTokenId,
      createdAt,
    });

    const continuationEventId = `evt_${task.version}_continuation_created_${handoffTokenId}`;
    const existingEvents = this.progressEvents.listByTaskId(taskId);
    const alreadyRecorded = existingEvents.some((event) => event.event_id === continuationEventId);

    if (!alreadyRecorded) {
      this.progressEvents.append({
        taskId,
        eventId: continuationEventId,
        type: 'continuation_created',
        message: `Created continuation package for handoff token ${handoffTokenId}.`,
        createdAt,
        metadata: {
          handoff_token_id: handoffTokenId,
          route_id: task.current_route,
        },
      });
    }

    return continuationPackage;
  }

  listProgressEvents(taskId) {
    if (!this.tasks.has(taskId)) {
      throw new TaskNotFoundError(taskId);
    }

    return this.progressEvents.listByTaskId(taskId);
  }

  listSnapshots(taskId) {
    const snapshots = this.snapshots.get(taskId);
    if (!snapshots) {
      throw new TaskNotFoundError(taskId);
    }
    return clone(snapshots);
  }

  getSnapshot(taskId, snapshotVersion) {
    const snapshots = this.snapshots.get(taskId);
    if (!snapshots) {
      throw new TaskNotFoundError(taskId);
    }

    const snapshot = snapshots.find(item => item.snapshot_version === snapshotVersion);
    if (!snapshot) {
      throw new TaskNotFoundError(`${taskId}@${snapshotVersion}`);
    }

    return clone(snapshot);
  }
}
