// Worker-safe task control plane service.
// Journey methods remain Node-only because review-repository-journey depends on
// filesystem-backed contract loading unavailable in Cloudflare Workers.

import { TaskStore } from './task-store-worker.mjs';
import { createTaskControlPlaneServiceCore } from './task-control-plane-service-core.mjs';

export function createTaskControlPlaneService({ taskStore = new TaskStore() } = {}) {
  return createTaskControlPlaneServiceCore({ taskStore });
}
