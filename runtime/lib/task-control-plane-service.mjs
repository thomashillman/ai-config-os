import { TaskStore } from './task-store.mjs';
import { startReviewRepositoryTask, resumeReviewRepositoryTask } from './review-repository-journey.mjs';

function assertObject(name, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function assertString(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

function assertTaskStore(taskStore) {
  const requiredMethods = [
    'create',
    'load',
    'transitionState',
    'selectRoute',
    'createContinuationPackage',
    'listProgressEvents',
    'getReadinessView',
    'listSnapshots',
    'getSnapshot',
  ];

  for (const methodName of requiredMethods) {
    if (typeof taskStore?.[methodName] !== 'function') {
      throw new Error(`taskStore must implement method '${methodName}'`);
    }
  }
}

export function createTaskControlPlaneService({ taskStore = new TaskStore() } = {}) {
  assertTaskStore(taskStore);

  return {
    createTask(task) {
      return taskStore.create(task);
    },
    getTask(taskId) {
      assertString('taskId', taskId);
      return taskStore.load(taskId);
    },
    transitionState(taskId, transition) {
      assertString('taskId', taskId);
      assertObject('transition', transition);
      return taskStore.transitionState(taskId, {
        expectedVersion: transition.expected_version,
        nextState: transition.next_state,
        nextAction: transition.next_action,
        updatedAt: transition.updated_at,
        progress: transition.progress,
      });
    },
    selectRoute(taskId, payload) {
      assertString('taskId', taskId);
      assertObject('payload', payload);
      return taskStore.selectRoute(taskId, {
        expectedVersion: payload.expected_version,
        routeId: payload.route_id,
        selectedAt: payload.selected_at,
      });
    },
    createContinuation(taskId, payload) {
      assertString('taskId', taskId);
      assertObject('payload', payload);
      return taskStore.createContinuationPackage(taskId, {
        handoffToken: payload.handoff_token,
        effectiveExecutionContract: payload.effective_execution_contract,
        createdAt: payload.created_at,
      });
    },
    listProgressEvents(taskId) {
      assertString('taskId', taskId);
      return taskStore.listProgressEvents(taskId);
    },
    getReadiness(taskId) {
      assertString('taskId', taskId);
      return taskStore.getReadinessView(taskId);
    },
    listSnapshots(taskId) {
      assertString('taskId', taskId);
      return taskStore.listSnapshots(taskId);
    },
    getSnapshot(taskId, version) {
      assertString('taskId', taskId);
      return taskStore.getSnapshot(taskId, version);
    },
    startReviewRepositoryTask(args) {
      assertObject('args', args);
      return startReviewRepositoryTask({ taskStore, ...args });
    },
    resumeReviewRepositoryTask(args) {
      assertObject('args', args);
      return resumeReviewRepositoryTask({ taskStore, ...args });
    },
  };
}
