/**
 * ExecutionSelection and Task System Integration
 *
 * Integrates ExecutionSelection into task state via event sourcing pattern.
 * - Maintains immutable EventSourcing semantics
 * - Preserves audit trail of execution selections
 * - Updates task route history with selection references
 */

import {
  computeSelectionDigest,
  computeSelectionRevision,
} from "./execution-selection-identity.mjs";

/**
 * Integrate ExecutionSelection into task state.
 *
 * Called when a route selection produces an ExecutionSelection.
 * Records the selection in task's progress events and route history.
 *
 * @param {Object} input
 * @param {Object} input.taskStore Reference to TaskStore instance
 * @param {string} input.taskId Task identifier
 * @param {number} input.expectedVersion Current task version for conflict detection
 * @param {Object} input.executionSelection The ExecutionSelection to integrate
 * @param {string} [input.recordedAt] Timestamp for the integration event
 *
 * @returns {Object} Integration result: {taskId, selectionDigest, selectionRevision, newTaskVersion}
 * @throws {Error} If task not found or version conflict
 */
export function integrateExecutionSelectionWithTask({
  taskStore,
  taskId,
  expectedVersion,
  executionSelection,
  recordedAt = new Date().toISOString(),
}) {
  if (!taskStore || typeof taskStore !== "object") {
    throw new Error("taskStore must be a valid TaskStore instance");
  }
  if (typeof taskId !== "string" || taskId.trim().length === 0) {
    throw new Error("taskId is required");
  }
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new Error("expectedVersion must be a positive integer");
  }
  if (!executionSelection || typeof executionSelection !== "object") {
    throw new Error("executionSelection must be a non-null object");
  }

  // Compute identity fields
  const selectionDigest = computeSelectionDigest(executionSelection);
  const selectionRevision = computeSelectionRevision(executionSelection);

  // Load current task to verify version and state
  const currentTask = taskStore.load(taskId);
  if (currentTask.version !== expectedVersion) {
    throw new Error(
      `Version conflict: expected ${expectedVersion}, got ${currentTask.version}`,
    );
  }

  // Append progress event with full ExecutionSelection
  taskStore.progressEvents.append({
    taskId,
    eventId: `evt_${currentTask.version + 1}_execution_selection_recorded`,
    type: "execution_selection_recorded",
    message: `Recorded execution selection: ${selectionRevision}`,
    createdAt: recordedAt,
    metadata: {
      execution_selection: executionSelection,
      selection_digest: selectionDigest,
      selection_revision: selectionRevision,
      selected_route_id: executionSelection.selected_route.route_id,
      reason: executionSelection.selection_reason,
    },
  });

  // Update task route_history with selection reference
  // Add selection_reference to the most recent route_history entry
  const routeHistoryEntry = {
    route: executionSelection.selected_route.route_id,
    selected_at: recordedAt,
    selection_reference: {
      digest: selectionDigest,
      revision: selectionRevision,
    },
  };

  // Append to execution_selections audit trail
  const executionSelectionEntry = {
    digest: selectionDigest,
    revision: selectionRevision,
    selected_at: recordedAt,
    route_id: executionSelection.selected_route.route_id,
  };

  const nextTask = taskStore.update(taskId, {
    expectedVersion,
    changes: {
      route_history: [
        ...(currentTask.route_history || []),
        routeHistoryEntry,
      ],
      execution_selections: [
        ...(currentTask.execution_selections || []),
        executionSelectionEntry,
      ],
      updated_at: recordedAt,
    },
  });

  return {
    taskId,
    selectionDigest,
    selectionRevision,
    newTaskVersion: nextTask.version,
  };
}

/**
 * Resolve ExecutionSelection for a task.
 *
 * Called when task needs a new route/model selection.
 * Gathers task capability profile and calls execution-selection-resolver.
 *
 * @param {Object} input
 * @param {Object} input.taskStore Reference to TaskStore instance
 * @param {string} input.taskId Task identifier
 * @param {string} input.taskType Task type (e.g., "review_repository")
 * @param {Object} input.policyContext Policy constraints and configuration
 * @param {Array} input.routeCandidates Route candidates from registry
 * @param {Array} input.modelCandidates Model candidates from evaluator
 * @param {Function} input.resolveExecutionSelection Function to resolve ExecutionSelection
 *
 * @returns {Object} {executionSelection, selectionSuccess} or {error, reason}
 */
export function resolveExecutionSelectionForTask({
  taskStore,
  taskId,
  taskType,
  policyContext,
  routeCandidates,
  modelCandidates,
  resolveExecutionSelection,
}) {
  if (!taskStore || typeof taskStore !== "object") {
    throw new Error("taskStore must be a valid TaskStore instance");
  }
  if (typeof taskId !== "string" || taskId.trim().length === 0) {
    throw new Error("taskId is required");
  }
  if (typeof taskType !== "string" || taskType.trim().length === 0) {
    throw new Error("taskType is required");
  }
  if (!policyContext || typeof policyContext !== "object") {
    throw new Error("policyContext is required");
  }
  if (!Array.isArray(routeCandidates) || routeCandidates.length === 0) {
    throw new Error("routeCandidates must be a non-empty array");
  }
  if (!Array.isArray(modelCandidates) || modelCandidates.length === 0) {
    throw new Error("modelCandidates must be a non-empty array");
  }
  if (typeof resolveExecutionSelection !== "function") {
    throw new Error("resolveExecutionSelection must be a function");
  }

  // Load task to get capability profile
  const task = taskStore.load(taskId);

  // Validate task type matches
  if (task.task_type !== taskType) {
    throw new Error(
      `Task type mismatch: expected ${taskType}, got ${task.task_type}`,
    );
  }

  // Call resolver with context
  const resolutionInput = {
    route_candidates: routeCandidates,
    model_candidates: modelCandidates,
    policy_constraints: {
      minimum_quality_floor: policyContext.minimum_quality_floor || "standard",
      minimum_reliability_floor:
        policyContext.minimum_reliability_floor || "above_floor",
    },
    fallback_policy: policyContext.fallback_policy || null,
    route_contract_version: policyContext.route_contract_version || "1.0.0",
    model_policy_version: policyContext.model_policy_version || "1.0.0",
    resolver_version: policyContext.resolver_version || "1.0.0",
    execution_selection_schema_version:
      policyContext.execution_selection_schema_version || "1.0.0",
  };

  const result = resolveExecutionSelection(resolutionInput);

  if (result.error) {
    return {
      error: result.error,
      reason: result.reason,
    };
  }

  return {
    executionSelection: result.execution_selection,
    selectionSuccess: result.selection_success,
  };
}

/**
 * Extract ExecutionSelection from task progress events.
 *
 * Reads the latest execution_selection_recorded event for a task.
 * Returns the full ExecutionSelection or null if not found.
 *
 * @param {Object} input
 * @param {Object} input.taskStore Reference to TaskStore instance
 * @param {string} input.taskId Task identifier
 * @param {string} [input.version] Optional: specific task version to search up to
 *
 * @returns {Object|null} ExecutionSelection or null if not found
 */
export function extractExecutionSelectionFromTaskSnapshot({
  taskStore,
  taskId,
  version,
}) {
  if (!taskStore || typeof taskStore !== "object") {
    throw new Error("taskStore must be a valid TaskStore instance");
  }
  if (typeof taskId !== "string" || taskId.trim().length === 0) {
    throw new Error("taskId is required");
  }

  // Fetch progress events for task
  const progressEvents = taskStore.listProgressEvents(taskId);

  // Find the most recent execution_selection_recorded event
  // Filter by version if provided
  let targetEvents = progressEvents.filter(
    (evt) => evt.type === "execution_selection_recorded",
  );

  if (Number.isInteger(version) && version > 0) {
    // Parse version from event_id pattern: evt_<version>_<type>
    targetEvents = targetEvents.filter((evt) => {
      const versionMatch = evt.event_id.match(/^evt_(\d+)_/);
      if (!versionMatch) return false;
      const eventVersion = parseInt(versionMatch[1], 10);
      return eventVersion <= version;
    });
  }

  if (targetEvents.length === 0) {
    return null;
  }

  // Return the most recent one's metadata.execution_selection
  const latestEvent = targetEvents[targetEvents.length - 1];
  if (!latestEvent.metadata || !latestEvent.metadata.execution_selection) {
    return null;
  }

  return latestEvent.metadata.execution_selection;
}
