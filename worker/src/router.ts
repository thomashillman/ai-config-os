import { isAuthorized, unauthorizedResponse } from './auth';
import { jsonResponse, notFound } from './http';
import {
  handleClientLatest,
  handleEffectiveContractPreview,
  handleHealth,
  handleLatestArtifact,
  handleManifestLatest,
  handleSkill,
  handleVersionedArtifact,
  type RegistryLike,
} from './handlers/artifacts';
import { handleExecute } from './handlers/executor';
import {
  handleTaskContinuation,
  handleTaskCreate,
  handleTaskGet,
  handleTaskProgressEvents,
  handleTaskReadiness,
  handleTaskRouteSelection,
  handleTaskSnapshots,
  handleTaskTransitionState,
} from './handlers/tasks';
import type { Env } from './types';

export function createWorkerHandler(registry: RegistryLike, pluginJson: unknown): ExportedHandler<Env> {
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Request-Signature',
          },
        });
      }

      const url = new URL(request.url);
      const path = url.pathname;

      if (!isAuthorized(request, env)) {
        return unauthorizedResponse();
      }

      if (request.method === 'GET') {
        if (path === '/v1/health') {
          return handleHealth(env, registry);
        }
        if (path === '/v1/manifest/latest') {
          return handleManifestLatest(env, registry);
        }
        if (path === '/v1/outcomes/latest') {
          return handleLatestArtifact(env, registry, 'outcomes.json');
        }
        if (path === '/v1/routes/latest') {
          return handleLatestArtifact(env, registry, 'routes.json');
        }
        if (path === '/v1/tools/latest') {
          return handleLatestArtifact(env, registry, 'tools.json');
        }

        const outcomesVersionedMatch = path.match(/^\/v1\/outcomes\/([^/]+)$/);
        if (outcomesVersionedMatch) {
          return handleVersionedArtifact(env, outcomesVersionedMatch[1], 'outcomes.json');
        }
        const routesVersionedMatch = path.match(/^\/v1\/routes\/([^/]+)$/);
        if (routesVersionedMatch) {
          return handleVersionedArtifact(env, routesVersionedMatch[1], 'routes.json');
        }
        const toolsVersionedMatch = path.match(/^\/v1\/tools\/([^/]+)$/);
        if (toolsVersionedMatch) {
          return handleVersionedArtifact(env, toolsVersionedMatch[1], 'tools.json');
        }

        if (path === '/v1/effective-contract/preview') {
          return handleEffectiveContractPreview(env, registry);
        }

        const clientMatch = path.match(/^\/v1\/client\/([^/]+)\/latest$/);
        if (clientMatch) {
          return handleClientLatest(clientMatch[1], registry, pluginJson);
        }

        const skillMatch = path.match(/^\/v1\/skill\/([^/]+)$/);
        if (skillMatch) {
          return handleSkill(skillMatch[1], registry);
        }

        const taskGetMatch = path.match(/^\/v1\/tasks\/([^/]+)$/);
        if (taskGetMatch) {
          return handleTaskGet(env, taskGetMatch[1]);
        }

        const taskProgressMatch = path.match(/^\/v1\/tasks\/([^/]+)\/progress-events$/);
        if (taskProgressMatch) {
          return handleTaskProgressEvents(env, taskProgressMatch[1]);
        }

        const taskReadinessMatch = path.match(/^\/v1\/tasks\/([^/]+)\/readiness$/);
        if (taskReadinessMatch) {
          return handleTaskReadiness(env, taskReadinessMatch[1]);
        }

        const taskSnapshotByVersionMatch = path.match(/^\/v1\/tasks\/([^/]+)\/snapshots\/([^/]+)$/);
        if (taskSnapshotByVersionMatch) {
          return handleTaskSnapshots(env, taskSnapshotByVersionMatch[1], taskSnapshotByVersionMatch[2]);
        }

        const taskSnapshotsMatch = path.match(/^\/v1\/tasks\/([^/]+)\/snapshots$/);
        if (taskSnapshotsMatch) {
          return handleTaskSnapshots(env, taskSnapshotsMatch[1], null);
        }
      }

      if (request.method === 'POST' && path === '/v1/execute') {
        return handleExecute(request, env);
      }

      if (request.method === 'POST' && path === '/v1/tasks') {
        return handleTaskCreate(request, env);
      }

      const taskRouteSelectionMatch = path.match(/^\/v1\/tasks\/([^/]+)\/route-selection$/);
      if (request.method === 'POST' && taskRouteSelectionMatch) {
        return handleTaskRouteSelection(request, env, taskRouteSelectionMatch[1]);
      }

      const taskContinuationMatch = path.match(/^\/v1\/tasks\/([^/]+)\/continuation$/);
      if (request.method === 'POST' && taskContinuationMatch) {
        return handleTaskContinuation(request, env, taskContinuationMatch[1]);
      }

      const taskStatePatchMatch = path.match(/^\/v1\/tasks\/([^/]+)\/state$/);
      if (request.method === 'PATCH' && taskStatePatchMatch) {
        return handleTaskTransitionState(request, env, taskStatePatchMatch[1]);
      }

      if (request.method !== 'GET' && request.method !== 'POST' && request.method !== 'PATCH') {
        return jsonResponse({ error: 'Method Not Allowed' }, 405);
      }

      return notFound(`Unknown route: ${path}`);
    },
  };
}
