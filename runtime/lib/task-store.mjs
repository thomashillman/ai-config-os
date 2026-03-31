import { validateContract } from "../../shared/contracts/validate.mjs";
import {
  transitionPortableTaskState,
  appendRouteSelection,
} from "./portable-task-lifecycle.mjs";
import {
  appendFindingToTask,
  transitionFindingsForRouteUpgrade,
} from "./findings-ledger.mjs";
import {
  ProgressEventStore,
  ProgressEventConflictError,
} from "./progress-event-pipeline.mjs";
import { createHandoffTokenService } from "./handoff-token-service.mjs";
import {
  createTaskStoreClass,
  TaskConflictError,
  TaskNotFoundError,
} from "./task-store-core.mjs";

export { TaskConflictError, TaskNotFoundError };

export const TaskStore = createTaskStoreClass({
  validateContract,
  transitionPortableTaskState,
  appendRouteSelection,
  appendFindingToTask,
  transitionFindingsForRouteUpgrade,
  ProgressEventStore,
  ProgressEventConflictError,
  createHandoffTokenService,
  maxSnapshots: 50,
});
