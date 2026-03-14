import { validateContract } from '../../shared/contracts/validate.mjs';
import { transitionPortableTaskState, appendRouteSelection } from './portable-task-lifecycle.mjs';
import { appendFindingToTask, transitionFindingsForRouteUpgrade } from './findings-ledger.mjs';
import { ProgressEventStore, ProgressEventConflictError } from './progress-event-pipeline.mjs';
import { createHandoffTokenService } from './handoff-token-service.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}


function summariseFindingsProvenance(findings = []) {
  return findings.reduce((summary, finding) => {
    const status = typeof finding?.provenance?.status === 'string' ? finding.provenance.status : 'unknown';
    summary[status] = (summary[status] ?? 0) + 1;
    return summary;
  }, {});
}

function toTaskReadinessView(task, progressEvents = []) {
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
  constructor({ handoffTokenService } = {}) {
    this.tasks = new Map();
    this.snapshots = new Map();
    this.progressEvents = new ProgressEventStore();
    this.handoffTokenService = handoffTokenService
      || (process.env.AIOS_HANDOFF_TOKEN_SECRET
        ? createHandoffTokenService({ secret: process.env.AIOS_HANDOFF_TOKEN_SECRET })
        : null);
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


  listProgressEvents(taskId) {
    if (!this.tasks.has(taskId)) {
      throw new TaskNotFoundError(taskId);
    }

    return this.progressEvents.listByTaskId(taskId);
  }


  getReadinessView(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    const progressEvents = this.progressEvents.listByTaskId(taskId);
    return clone(toTaskReadinessView(task, progressEvents));
  }

  createContinuationPackage(taskId, {
    handoffToken,
    effectiveExecutionContract,
    createdAt = new Date().toISOString(),
  }) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    const validatedHandoffToken = validateContract('handoffToken', clone(handoffToken));
    if (validatedHandoffToken.task_id !== taskId) {
      throw new Error(`handoffToken.task_id must match taskId '${taskId}'`);
    }

    const validatedExecutionContract = validateContract(
      'effectiveExecutionContract',
      clone(effectiveExecutionContract),
    );
    if (validatedExecutionContract.task_id !== taskId) {
      throw new Error(`effectiveExecutionContract.task_id must match taskId '${taskId}'`);
    }

    if (validatedExecutionContract.task_type !== task.task_type) {
      throw new Error(`effectiveExecutionContract.task_type must match task task_type '${task.task_type}'`);
    }

    const existingContinuationEvent = this.progressEvents
      .listByTaskId(taskId)
      .find((event) => (
        event.type === 'continuation_created'
        && event.metadata?.handoff_token_id === validatedHandoffToken.token_id
      ));

    const canonicalCreatedAt = existingContinuationEvent?.metadata?.continuation_package_created_at
      || existingContinuationEvent?.created_at
      || createdAt;

    if (existingContinuationEvent) {
      return clone(validateContract('continuationPackage', {
        schema_version: '1.0.0',
        task: clone(task),
        effective_execution_contract: validatedExecutionContract,
        handoff_token_id: validatedHandoffToken.token_id,
        created_at: canonicalCreatedAt,
      }));
    }

    if (!this.handoffTokenService) {
      throw new Error('handoffTokenService is not configured');
    }

    this.handoffTokenService.verifyToken({
      token: validatedHandoffToken,
      expectedTaskId: taskId,
      now: createdAt,
    });

    this.handoffTokenService.consumeToken({
      tokenId: validatedHandoffToken.token_id,
      nonce: validatedHandoffToken.replay_nonce,
      now: createdAt,
      expiresAt: validatedHandoffToken.expires_at,
    });

    const eventId = `evt_continuation_created_${validatedHandoffToken.token_id}`;

    const continuationPackage = validateContract('continuationPackage', {
      schema_version: '1.0.0',
      task: clone(task),
      effective_execution_contract: validatedExecutionContract,
      handoff_token_id: validatedHandoffToken.token_id,
      created_at: canonicalCreatedAt,
    });

    const eventPayload = {
      taskId,
      eventId,
      type: 'continuation_created',
      message: `Created continuation package for token ${validatedHandoffToken.token_id}.`,
      createdAt,
      metadata: {
        handoff_token_id: validatedHandoffToken.token_id,
        continuation_package_created_at: canonicalCreatedAt,
      },
    };

    try {
      this.progressEvents.append(eventPayload);
    } catch (error) {
      if (!(error instanceof ProgressEventConflictError)) {
        throw error;
      }

      const equivalentEvent = this.progressEvents
        .listByTaskId(taskId)
        .find((event) => (
          event.type === 'continuation_created'
          && event.metadata?.handoff_token_id === validatedHandoffToken.token_id
        ));

      if (!equivalentEvent) {
        throw error;
      }

      const replayPackage = validateContract('continuationPackage', {
        schema_version: '1.0.0',
        task: clone(task),
        effective_execution_contract: validatedExecutionContract,
        handoff_token_id: validatedHandoffToken.token_id,
        created_at: equivalentEvent.metadata?.continuation_package_created_at || equivalentEvent.created_at,
      });

      return clone(replayPackage);
    }

    return clone(continuationPackage);
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
