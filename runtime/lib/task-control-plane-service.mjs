import { TaskStore } from "./task-store.mjs";
import {
  startReviewRepositoryTask as journeyStart,
  resumeReviewRepositoryTask as journeyResume,
} from "./review-repository-journey.mjs";
import { createTaskControlPlaneServiceCore } from "./task-control-plane-service-core.mjs";

export function createTaskControlPlaneService({
  taskStore = new TaskStore(),
} = {}) {
  return createTaskControlPlaneServiceCore({
    taskStore,
    startReviewRepositoryTask: journeyStart,
    resumeReviewRepositoryTask: journeyResume,
  });
}
