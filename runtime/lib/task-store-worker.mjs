// Worker-safe task store adapter.
// Shares all task-state logic with Node runtime while keeping schema validation
// boundaries explicit: Worker runtime skips Ajv contract validation.

import { transitionPortableTaskState, appendRouteSelection } from './portable-task-lifecycle-worker.mjs';
import { appendFindingToTask, transitionFindingsForRouteUpgrade } from './findings-ledger-worker.mjs';
import { ProgressEventStore, ProgressEventConflictError } from './progress-event-pipeline-worker.mjs';
import { createHandoffTokenService } from './handoff-token-service-worker.mjs';
import { createTaskStoreClass, TaskConflictError, TaskNotFoundError } from './task-store-core.mjs';

export { TaskConflictError, TaskNotFoundError };

export const TaskStore = createTaskStoreClass({
  transitionPortableTaskState,
  appendRouteSelection,
  appendFindingToTask,
  transitionFindingsForRouteUpgrade,
  ProgressEventStore,
  ProgressEventConflictError,
  createHandoffTokenService,
  setInitialRouteOnCreate: true,
});
