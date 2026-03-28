import { contractSuccessResponse, WORKER_CAPABILITY } from '../contracts';
import type { Env } from '../types';

const AVAILABLE_RESOURCES = [
  'tasks.list',
  'tasks.get',
  'tasks.create',
  'tasks.state',
  'tasks.route_selection',
  'tasks.events',
  'tasks.available_routes',
  'tasks.continue',
  'tasks.answer_question',
  'tasks.dismiss_question',
  'tasks.finding_recorded',
  'tasks.findings_transitioned',
  'tasks.readiness',
  'tasks.snapshots',
  'tasks.hub_latest',
  'runtime.capabilities',
];

export function handleRuntimeCapabilities(env: Env): Response {
  return contractSuccessResponse({
    resource: 'runtime.capabilities',
    data: {
      surface: 'worker',
      worker_backed: true,
      local_only: false,
      remote_safe: true,
      tunnel_required: false,
      environment: env.ENVIRONMENT ?? 'production',
      available_resources: AVAILABLE_RESOURCES,
      unavailable_resources: [],
    },
    summary: 'This surface is Worker-backed and remote-safe. No tunnel is required. All task and runtime resources are available.',
    capability: WORKER_CAPABILITY,
    suggestedActions: [
      {
        id: 'list_tasks',
        label: 'List tasks',
        reason: 'Start here to discover active work.',
        runnable_target: 'GET /v1/tasks',
      },
    ],
  });
}
