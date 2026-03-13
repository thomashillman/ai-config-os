import { validateContract } from '../../shared/contracts/validate.mjs';
import { transitionPortableTaskState, appendRouteSelection } from './portable-task-lifecycle.mjs';
import { appendFindingToTask, transitionFindingsForRouteUpgrade } from './findings-ledger.mjs';

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

    return clone(next);
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
