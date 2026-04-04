import { validateContract } from "../../shared/contracts/validate.mjs";

export const TRANSITIONS = Object.freeze({
  pending: Object.freeze(["active", "failed"]),
  active: Object.freeze(["blocked", "completed", "failed"]),
  blocked: Object.freeze(["active", "failed"]),
  completed: Object.freeze([]),
  failed: Object.freeze([]),
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertNonEmptyString(name, value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
}

function assertTransitionAllowed(currentState, nextState) {
  const allowed = TRANSITIONS[currentState];
  if (!Array.isArray(allowed)) {
    throw new Error(`Unknown task state '${currentState}'`);
  }
  if (!allowed.includes(nextState)) {
    throw new Error(
      `Invalid task state transition '${currentState}' -> '${nextState}'`,
    );
  }
}

function assertMonotonicProgress(currentProgress, nextProgress) {
  if (nextProgress.completed_steps < currentProgress.completed_steps) {
    throw new Error("Task lifecycle update cannot reduce completed_steps");
  }
  if (nextProgress.total_steps < nextProgress.completed_steps) {
    throw new Error(
      "Task lifecycle update requires total_steps >= completed_steps",
    );
  }
}

export function createPortableTask({
  taskId,
  taskType,
  goal,
  routeId,
  nextAction,
  totalSteps,
  now = new Date().toISOString(),
} = {}) {
  assertNonEmptyString("taskId", taskId);
  assertNonEmptyString("taskType", taskType);
  assertNonEmptyString("goal", goal);
  assertNonEmptyString("routeId", routeId);
  assertNonEmptyString("nextAction", nextAction);

  if (!Number.isInteger(totalSteps) || totalSteps < 0) {
    throw new Error("totalSteps must be an integer >= 0");
  }

  return validateContract("portableTaskObject", {
    schema_version: "1.0.0",
    task_id: taskId,
    task_type: taskType,
    goal,
    current_route: routeId,
    state: "pending",
    progress: { completed_steps: 0, total_steps: totalSteps },
    findings: [],
    unresolved_questions: [],
    approvals: [],
    route_history: [{ route: routeId, selected_at: now }],
    execution_selections: [],
    next_action: nextAction,
    version: 1,
    updated_at: now,
  });
}

export function appendRouteSelection({
  task,
  routeId,
  expectedVersion,
  selectedAt = new Date().toISOString(),
} = {}) {
  if (!task || typeof task !== "object") {
    throw new Error("appendRouteSelection requires task object");
  }
  assertNonEmptyString("routeId", routeId);
  assertNonEmptyString("selectedAt", selectedAt);

  if (!Number.isInteger(expectedVersion)) {
    throw new Error("expectedVersion must be an integer");
  }
  if (task.version !== expectedVersion) {
    throw new Error(
      `Task lifecycle expectedVersion ${expectedVersion} does not match task version ${task.version}`,
    );
  }

  const next = {
    ...clone(task),
    current_route: routeId,
    route_history: [
      ...task.route_history,
      { route: routeId, selected_at: selectedAt },
    ],
    version: task.version + 1,
    updated_at: selectedAt,
  };

  return validateContract("portableTaskObject", next);
}

export function transitionPortableTaskState({
  task,
  nextState,
  expectedVersion,
  updatedAt,
  nextAction,
  progress,
} = {}) {
  if (!task || typeof task !== "object") {
    throw new Error("transitionPortableTaskState requires task object");
  }
  assertNonEmptyString("nextState", nextState);
  assertNonEmptyString("updatedAt", updatedAt);
  assertNonEmptyString("nextAction", nextAction);

  if (!Number.isInteger(expectedVersion)) {
    throw new Error("expectedVersion must be an integer");
  }
  if (task.version !== expectedVersion) {
    throw new Error(
      `Task lifecycle expectedVersion ${expectedVersion} does not match task version ${task.version}`,
    );
  }

  assertTransitionAllowed(task.state, nextState);

  const nextProgress = progress ? clone(progress) : clone(task.progress);
  assertMonotonicProgress(task.progress, nextProgress);

  const next = {
    ...clone(task),
    state: nextState,
    progress: nextProgress,
    next_action: nextAction,
    version: task.version + 1,
    updated_at: updatedAt,
  };

  return validateContract("portableTaskObject", next);
}
