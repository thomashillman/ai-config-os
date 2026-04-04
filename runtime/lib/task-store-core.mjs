import {
  TaskConflictError,
  TaskNotFoundError,
  createReadinessView,
} from "./task-shared.mjs";

export { TaskConflictError, TaskNotFoundError };

function defaultClone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
    throw new Error("Unable to clone value");
  }
}

function resolveEnvSecret() {
  if (typeof process === "undefined" || !process?.env) {
    return null;
  }
  return process.env.AIOS_HANDOFF_TOKEN_SECRET || null;
}

export function createTaskStoreClass({
  validateContract = null,
  transitionPortableTaskState,
  appendRouteSelection,
  appendFindingToTask,
  transitionFindingsForRouteUpgrade,
  ProgressEventStore,
  ProgressEventConflictError,
  createHandoffTokenService,
  clone = defaultClone,
  maxSnapshots = null,
  setInitialRouteOnCreate = false,
  integrateExecutionSelectionWithTaskFn = null,
} = {}) {
  if (typeof transitionPortableTaskState !== "function") {
    throw new Error("transitionPortableTaskState must be provided");
  }
  if (typeof appendRouteSelection !== "function") {
    throw new Error("appendRouteSelection must be provided");
  }
  if (typeof appendFindingToTask !== "function") {
    throw new Error("appendFindingToTask must be provided");
  }
  if (typeof transitionFindingsForRouteUpgrade !== "function") {
    throw new Error("transitionFindingsForRouteUpgrade must be provided");
  }
  if (typeof ProgressEventStore !== "function") {
    throw new Error("ProgressEventStore must be provided");
  }
  if (typeof createHandoffTokenService !== "function") {
    throw new Error("createHandoffTokenService must be provided");
  }

  const validate =
    typeof validateContract === "function"
      ? (contractName, value) => validateContract(contractName, value)
      : (_contractName, value) => value;

  function createSnapshot(task) {
    return validate("taskStateSnapshot", {
      schema_version: "1.0.0",
      task_id: task.task_id,
      snapshot_version: task.version,
      created_at: task.updated_at,
      task,
    });
  }

  function appendSnapshot(snapshots, snapshot) {
    snapshots.push(snapshot);
    if (
      Number.isInteger(maxSnapshots) &&
      maxSnapshots > 0 &&
      snapshots.length > maxSnapshots
    ) {
      snapshots.splice(0, snapshots.length - maxSnapshots);
    }
  }

  function toConflict(taskId, expectedVersion, currentVersion) {
    return new TaskConflictError(
      `Version conflict for ${taskId}: expected ${expectedVersion}, current ${currentVersion}`,
      { taskId, expectedVersion, currentVersion },
    );
  }

  return class TaskStore {
    constructor({ handoffTokenService } = {}) {
      this.tasks = new Map();
      this.snapshots = new Map();
      this.progressEvents = new ProgressEventStore();
      const envSecret = resolveEnvSecret();
      this.handoffTokenService =
        handoffTokenService ||
        (envSecret ? createHandoffTokenService({ secret: envSecret }) : null);
    }

    create(task) {
      const nextTask = clone(task);
      if (setInitialRouteOnCreate && !nextTask.initial_route) {
        nextTask.initial_route = nextTask.current_route;
      }

      const validated = validate("portableTaskObject", nextTask);
      if (this.tasks.has(validated.task_id)) {
        throw new TaskConflictError(
          `Task already exists: ${validated.task_id}`,
          { taskId: validated.task_id },
        );
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
        throw toConflict(taskId, expectedVersion, current.version);
      }

      const next = validate("portableTaskObject", {
        ...current,
        ...clone(changes),
        version: current.version + 1,
      });
      this.tasks.set(taskId, next);

      const snapshots = this.snapshots.get(taskId) || [];
      appendSnapshot(snapshots, createSnapshot(next));
      this.snapshots.set(taskId, snapshots);

      return clone(next);
    }

    transitionState(
      taskId,
      { expectedVersion, nextState, nextAction, updatedAt, progress },
    ) {
      const current = this.tasks.get(taskId);
      if (!current) {
        throw new TaskNotFoundError(taskId);
      }
      if (current.version !== expectedVersion) {
        throw toConflict(taskId, expectedVersion, current.version);
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
      const snapshots = this.snapshots.get(taskId) || [];
      appendSnapshot(snapshots, createSnapshot(validated));
      this.snapshots.set(taskId, snapshots);

      this.progressEvents.append({
        taskId,
        eventId: `evt_${validated.version}_state_change`,
        type: "state_change",
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
        throw toConflict(taskId, expectedVersion, current.version);
      }

      const next = appendFindingToTask({
        task: current,
        expectedVersion,
        finding,
        updatedAt,
      });

      this.tasks.set(taskId, next);
      const snapshots = this.snapshots.get(taskId) || [];
      appendSnapshot(snapshots, createSnapshot(next));
      this.snapshots.set(taskId, snapshots);

      const latestFinding = next.findings[next.findings.length - 1];
      this.progressEvents.append({
        taskId,
        eventId: `evt_${next.version}_finding_recorded`,
        type: "finding_recorded",
        message: `Recorded finding ${latestFinding.finding_id}.`,
        createdAt: updatedAt,
        metadata: {
          finding_id: latestFinding.finding_id,
          provenance_status: latestFinding.provenance.status,
        },
      });

      return clone(next);
    }

    transitionFindingsForRouteUpgrade(
      taskId,
      { expectedVersion, toRouteId, upgradedAt, toEquivalenceLevel },
    ) {
      const current = this.tasks.get(taskId);
      if (!current) {
        throw new TaskNotFoundError(taskId);
      }
      if (current.version !== expectedVersion) {
        throw toConflict(taskId, expectedVersion, current.version);
      }

      const transitionedFindings = transitionFindingsForRouteUpgrade({
        findings: current.findings,
        toRouteId,
        upgradedAt,
        toEquivalenceLevel,
      });

      const next = validate("portableTaskObject", {
        ...clone(current),
        findings: transitionedFindings,
        version: current.version + 1,
        updated_at: upgradedAt,
      });

      this.tasks.set(taskId, next);
      const snapshots = this.snapshots.get(taskId) || [];
      appendSnapshot(snapshots, createSnapshot(next));
      this.snapshots.set(taskId, snapshots);

      const reclassifiedCount = transitionedFindings.reduce(
        (count, nextFinding, index) => {
          const previousFinding = current.findings[index];
          if (!previousFinding) {
            return count + 1;
          }
          const statusChanged =
            previousFinding.provenance.status !== nextFinding.provenance.status;
          const routeChanged =
            previousFinding.provenance.recorded_by_route !==
            nextFinding.provenance.recorded_by_route;
          return statusChanged || routeChanged ? count + 1 : count;
        },
        0,
      );

      this.progressEvents.append({
        taskId,
        eventId: `evt_${next.version}_finding_transitioned`,
        type: "finding_transitioned",
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

    selectRoute(
      taskId,
      { routeId, expectedVersion, selectedAt, executionSelection = null },
    ) {
      const current = this.tasks.get(taskId);
      if (!current) {
        throw new TaskNotFoundError(taskId);
      }
      if (current.version !== expectedVersion) {
        throw toConflict(taskId, expectedVersion, current.version);
      }

      const next = appendRouteSelection({
        task: current,
        routeId,
        expectedVersion,
        selectedAt,
      });

      this.tasks.set(taskId, next);
      const snapshots = this.snapshots.get(taskId) || [];
      appendSnapshot(snapshots, createSnapshot(next));
      this.snapshots.set(taskId, snapshots);

      this.progressEvents.append({
        taskId,
        eventId: `evt_${next.version}_route_selected`,
        type: "route_selected",
        message: `Selected route ${routeId}.`,
        createdAt: selectedAt,
        metadata: {
          route_id: routeId,
        },
      });

      // If ExecutionSelection is provided and integration function is available,
      // integrate it into task state
      if (
        executionSelection &&
        typeof integrateExecutionSelectionWithTaskFn === "function"
      ) {
        try {
          integrateExecutionSelectionWithTaskFn({
            taskStore: this,
            taskId,
            expectedVersion: next.version,
            executionSelection,
            recordedAt: selectedAt,
          });
          // Integration succeeded: return the latest persisted task state
          return clone(this.load(taskId));
        } catch (error) {
          // Log integration error but don't fail route selection
          // The route selection is committed even if selection integration fails
          // Return the route-selected task in this failure case
          console.warn(
            `Failed to integrate ExecutionSelection for task ${taskId}:`,
            error,
          );
          return clone(next);
        }
      }

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
      return clone(createReadinessView(task, progressEvents));
    }

    createContinuationPackage(
      taskId,
      {
        handoffToken,
        effectiveExecutionContract,
        createdAt = new Date().toISOString(),
      },
    ) {
      const task = this.tasks.get(taskId);
      if (!task) {
        throw new TaskNotFoundError(taskId);
      }

      const validatedHandoffToken = validate(
        "handoffToken",
        clone(handoffToken),
      );
      if (validatedHandoffToken.task_id !== taskId) {
        throw new Error(`handoffToken.task_id must match taskId '${taskId}'`);
      }

      const validatedExecutionContract = validate(
        "effectiveExecutionContract",
        clone(effectiveExecutionContract),
      );
      if (validatedExecutionContract.task_id !== taskId) {
        throw new Error(
          `effectiveExecutionContract.task_id must match taskId '${taskId}'`,
        );
      }
      if (validatedExecutionContract.task_type !== task.task_type) {
        throw new Error(
          `effectiveExecutionContract.task_type must match task task_type '${task.task_type}'`,
        );
      }

      const existingContinuationEvent = this.progressEvents
        .listByTaskId(taskId)
        .find(
          (event) =>
            event.type === "continuation_created" &&
            event.metadata?.handoff_token_id === validatedHandoffToken.token_id,
        );

      const canonicalCreatedAt =
        existingContinuationEvent?.metadata?.continuation_package_created_at ||
        existingContinuationEvent?.created_at ||
        createdAt;

      const createPackage = (timestamp) =>
        validate("continuationPackage", {
          schema_version: "1.0.0",
          task: clone(task),
          effective_execution_contract: validatedExecutionContract,
          handoff_token_id: validatedHandoffToken.token_id,
          created_at: timestamp,
        });

      if (existingContinuationEvent) {
        return clone(createPackage(canonicalCreatedAt));
      }

      if (!this.handoffTokenService) {
        throw new Error("handoffTokenService is not configured");
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

      const continuationPackage = createPackage(canonicalCreatedAt);
      const eventPayload = {
        taskId,
        eventId: `evt_continuation_created_${validatedHandoffToken.token_id}`,
        type: "continuation_created",
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
          .find(
            (event) =>
              event.type === "continuation_created" &&
              event.metadata?.handoff_token_id ===
                validatedHandoffToken.token_id,
          );

        if (!equivalentEvent) {
          throw error;
        }

        return clone(
          createPackage(
            equivalentEvent.metadata?.continuation_package_created_at ||
              equivalentEvent.created_at,
          ),
        );
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

      const snapshot = snapshots.find(
        (item) => item.snapshot_version === snapshotVersion,
      );
      if (!snapshot) {
        throw new TaskNotFoundError(`${taskId}@${snapshotVersion}`);
      }
      return clone(snapshot);
    }
  };
}
