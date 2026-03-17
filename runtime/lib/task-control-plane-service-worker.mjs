// Worker-safe variant of task-control-plane-service without review-repository-journey import.
// The journey module transitively imports shared/contracts/validate.mjs which uses
// Node.js fs and import.meta.url — both unavailable in Cloudflare Workers.
// The Worker never calls startReviewRepositoryTask or resumeReviewRepositoryTask,
// so this variant omits those methods entirely.
// Node-only version with full journey support remains in task-control-plane-service.mjs.

import { TaskStore } from './task-store-worker.mjs';

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
  // Optional methods: listRecentTasks, getLatestActiveTask, loadByCode, loadByName

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
    appendFinding(taskId, payload) {
      assertString('taskId', taskId);
      assertObject('payload', payload);
      return taskStore.appendFinding(taskId, {
        expectedVersion: payload.expected_version,
        finding: payload.finding,
        updatedAt: payload.updated_at,
      });
    },
    transitionFindingsForRouteUpgrade(taskId, payload) {
      assertString('taskId', taskId);
      assertObject('payload', payload);
      return taskStore.transitionFindingsForRouteUpgrade(taskId, {
        expectedVersion: payload.expected_version,
        toRouteId: payload.to_route_id,
        upgradedAt: payload.upgraded_at,
        toEquivalenceLevel: payload.to_equivalence_level,
      });
    },
    listRecentTasks(options = {}) {
      if (typeof taskStore.listRecentTasks !== 'function') {
        return Promise.resolve([]);
      }
      return taskStore.listRecentTasks(options);
    },
    getLatestActiveTask() {
      if (typeof taskStore.getLatestActiveTask !== 'function') {
        return Promise.resolve(null);
      }
      return taskStore.getLatestActiveTask();
    },
    getTaskByCode(shortCode) {
      assertString('shortCode', shortCode);
      if (typeof taskStore.loadByCode !== 'function') {
        return Promise.reject(new Error('loadByCode not supported by current task store'));
      }
      return taskStore.loadByCode(shortCode);
    },
    getTaskByName(nameOrSlug) {
      assertString('nameOrSlug', nameOrSlug);
      if (typeof taskStore.loadByName !== 'function') {
        return Promise.reject(new Error('loadByName not supported by current task store'));
      }
      return taskStore.loadByName(nameOrSlug);
    },
    // startReviewRepositoryTask and resumeReviewRepositoryTask are intentionally
    // omitted — they require Node.js filesystem access (via review-repository-journey.mjs
    // → effective-execution-contract.mjs → shared/contracts/validate.mjs).
    // Use the Node-only task-control-plane-service.mjs for journey operations.
  };
}
