import { createPortableTask } from './portable-task-lifecycle.mjs';
import { buildEffectiveExecutionContract } from './effective-execution-contract.mjs';
import { validateReviewRepositoryRouteInputs } from './review-repository-route-runtime.mjs';

const REVIEW_REPOSITORY_TASK_TYPE = 'review_repository';
const MAX_INPUT_LENGTH = 200_000;

function assertObject(name, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function assertNonEmptyString(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
}

function assertSafeSingleLinePath(name, value) {
  assertNonEmptyString(name, value);
  if (/[\0\r\n]/.test(value)) {
    throw new Error(`${name} contains unsupported control characters`);
  }
}

function assertSafeText(name, value) {
  assertNonEmptyString(name, value);
  if (/\0/.test(value)) {
    throw new Error(`${name} contains unsupported null bytes`);
  }
  if (value.length > MAX_INPUT_LENGTH) {
    throw new Error(`${name} exceeds max length ${MAX_INPUT_LENGTH}`);
  }
}

function validateRouteSpecificInputs({ routeId, inputs }) {
  validateReviewRepositoryRouteInputs({ routeId, inputs });

  if (routeId === 'github_pr') {
    assertSafeText('repository_slug', inputs.repository_slug);
    assertSafeText('pull_request_number', String(inputs.pull_request_number));
  }

  if (routeId === 'local_repo') {
    assertSafeSingleLinePath('repository_path', inputs.repository_path);
  }

  if (routeId === 'uploaded_bundle') {
    assertSafeSingleLinePath('bundle_path', inputs.bundle_path);
  }

  if (routeId === 'pasted_diff') {
    assertSafeText('diff_text', inputs.diff_text);
  }
}

function summariseFindings(findings) {
  return findings.reduce((summary, finding) => {
    const status = finding?.provenance?.status || 'unknown';
    summary[status] = (summary[status] || 0) + 1;
    return summary;
  }, {});
}

export function startReviewRepositoryTask({
  taskStore,
  taskId,
  goal,
  routeInputs,
  capabilityProfile,
  now = new Date().toISOString(),
  totalSteps = 6,
  taskType = REVIEW_REPOSITORY_TASK_TYPE,
  narrator = null,
  observer = null,
} = {}) {
  assertObject('taskStore', taskStore);
  assertObject('routeInputs', routeInputs);
  assertNonEmptyString('taskId', taskId);
  assertNonEmptyString('goal', goal);

  const effectiveExecutionContract = buildEffectiveExecutionContract({
    taskId,
    taskType,
    capabilityProfile,
    computedAt: now,
  });

  const routeId = effectiveExecutionContract.selected_route.route_id;
  validateRouteSpecificInputs({ routeId, inputs: routeInputs });

  const task = createPortableTask({
    taskId,
    taskType,
    goal,
    routeId,
    nextAction: `Collect route inputs for '${routeId}' and begin repository review.`,
    totalSteps,
    now,
  });

  const createdTask = taskStore.create(task);
  const activeTask = taskStore.transitionState(taskId, {
    expectedVersion: createdTask.version,
    nextState: 'active',
    nextAction: `Execute '${routeId}' route and collect first findings.`,
    updatedAt: now,
    progress: { completed_steps: 1, total_steps: totalSteps },
  });

  taskStore.progressEvents.append({
    taskId,
    eventId: `evt_${activeTask.version}_state_change_start`,
    type: 'state_change',
    message: `Started review_repository task in '${routeId}' route.`,
    createdAt: now,
    metadata: {
      route_id: routeId,
      equivalence_level: effectiveExecutionContract.equivalence_level,
      required_inputs: effectiveExecutionContract.required_inputs,
      phase: 'start',
    },
  });

  const narration = narrator
    ? narrator.onStart(activeTask, effectiveExecutionContract)
    : null;

  if (narration && observer) {
    observer.recordNarration({
      taskId,
      narrationPoint: 'onStart',
      templateVersion: narrator.templateVersion || '1.0.0',
      narratorOutput: narration,
      taskSnapshot: activeTask,
    });
  }

  return {
    task: activeTask,
    effective_execution_contract: effectiveExecutionContract,
    narration,
  };
}

export function resumeReviewRepositoryTask({
  taskStore,
  taskId,
  capabilityProfile,
  now = new Date().toISOString(),
  taskType = REVIEW_REPOSITORY_TASK_TYPE,
  narrator = null,
  observer = null,
  previousContract = null,
} = {}) {
  assertObject('taskStore', taskStore);
  assertNonEmptyString('taskId', taskId);

  const loadedTask = taskStore.load(taskId);

  const effectiveExecutionContract = buildEffectiveExecutionContract({
    taskId,
    taskType,
    capabilityProfile,
    computedAt: now,
  });

  const selectedRouteId = effectiveExecutionContract.selected_route.route_id;
  const upgraded = loadedTask.current_route !== selectedRouteId;

  let task = loadedTask;

  if (upgraded) {
    const routedTask = taskStore.selectRoute(taskId, {
      routeId: selectedRouteId,
      expectedVersion: task.version,
      selectedAt: now,
    });

    task = taskStore.transitionFindingsForRouteUpgrade(taskId, {
      expectedVersion: routedTask.version,
      toRouteId: selectedRouteId,
      upgradedAt: now,
      toEquivalenceLevel: effectiveExecutionContract.equivalence_level,
    });

    taskStore.progressEvents.append({
      taskId,
      eventId: `evt_${task.version}_route_selected_resume`,
      type: 'route_selected',
      message: `Resumed task in stronger '${selectedRouteId}' route.`,
      createdAt: now,
      metadata: {
        from_route: loadedTask.current_route,
        to_route: selectedRouteId,
        equivalence_level: effectiveExecutionContract.equivalence_level,
        phase: 'resume',
      },
    });
  }

  const narration = narrator
    ? narrator.onResume(task, effectiveExecutionContract, previousContract)
    : null;

  if (narration && observer) {
    observer.recordNarration({
      taskId,
      narrationPoint: 'onResume',
      templateVersion: narrator.templateVersion || '1.0.0',
      narratorOutput: narration,
      taskSnapshot: task,
    });
  }

  return {
    task,
    effective_execution_contract: effectiveExecutionContract,
    upgraded,
    narration,
  };
}

export function buildTaskReadinessView({ task, effectiveExecutionContract, progressEvents = [], narrator = null } = {}) {
  assertObject('task', task);
  if (effectiveExecutionContract !== undefined) {
    assertObject('effectiveExecutionContract', effectiveExecutionContract);
  }
  if (!Array.isArray(progressEvents)) {
    throw new Error('progressEvents must be an array');
  }

  const totalSteps = task.progress?.total_steps || 0;
  const completedSteps = task.progress?.completed_steps || 0;

  const strongerRouteAvailable = Boolean(
    effectiveExecutionContract?.stronger_host_guidance
    || (task.task_type === REVIEW_REPOSITORY_TASK_TYPE && task.current_route !== 'local_repo')
  );

  const narration = narrator && strongerRouteAvailable
    ? narrator.onUpgradeAvailable(task, effectiveExecutionContract, null)
    : undefined;

  const view = {
    task_id: task.task_id,
    task_type: task.task_type,
    current_route: task.current_route,
    state: task.state,
    next_action: task.next_action,
    route_history: task.route_history,
    readiness: {
      is_ready: task.state === 'active' && completedSteps < totalSteps,
      stronger_route_available: strongerRouteAvailable,
      progress_ratio: totalSteps === 0 ? 1 : Number((completedSteps / totalSteps).toFixed(4)),
    },
    findings_provenance: summariseFindings(task.findings || []),
    progress_event_count: progressEvents.length,
  };

  if (narration !== undefined) {
    view.narration = narration;
  }

  return view;
}
