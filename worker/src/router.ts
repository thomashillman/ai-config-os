import { isAuthorized, unauthorizedResponse } from './auth';
import { jsonResponse, notFound, corsPreflightResponse } from './http';
import {
  handleClientLatest,
  handleClientPackage,
  handleEffectiveContractPreview,
  handleHealth,
  handleLatestArtifact,
  handleManifestLatest,
  handleSkill,
  handleVersionedArtifact,
  type RegistryLike,
} from './handlers/artifacts';
import {
  handleCapabilitiesForPlatform,
  handleSkillsCompatible,
  type RegistryWithPlatforms,
} from './handlers/capabilities';
import { handleExecute } from './handlers/executor';
import {
  handleHubLatest,
  handleTaskAppendFinding,
  handleTaskByCode,
  handleTaskByName,
  handleTaskContinuation,
  handleTaskCreate,
  handleTaskGet,
  handleTaskList,
  handleTaskProgressEvents,
  handleTaskReadiness,
  handleTaskRouteSelection,
  handleTaskSnapshots,
  handleTaskTransitionFindings,
  handleTaskTransitionState,
} from './handlers/tasks';
import type { Env } from './types';

export function createWorkerHandler(registry: RegistryLike, pluginJson: unknown): ExportedHandler<Env> {
  // Cast once — capability handlers need the extended registry type
  const registryWithPlatforms = registry as RegistryWithPlatforms;

  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      // CORS preflight — no auth required
      if (request.method === 'OPTIONS') {
        return corsPreflightResponse();
      }

      const url = new URL(request.url);
      const path = url.pathname;

      if (!isAuthorized(request, env)) {
        return unauthorizedResponse();
      }

      if (request.method === 'GET') {
        // ── Health & manifests ──────────────────────────────────────────────
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

        // ── Versioned artifacts ─────────────────────────────────────────────
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

        // ── Effective contract ──────────────────────────────────────────────
        if (path === '/v1/effective-contract/preview') {
          return handleEffectiveContractPreview(env, registry);
        }

        // ── Client & skills ─────────────────────────────────────────────────
        const clientMatch = path.match(/^\/v1\/client\/([^/]+)\/latest$/);
        if (clientMatch) {
          return handleClientLatest(clientMatch[1], registry, pluginJson);
        }

        const clientPackageMatch = path.match(/^\/v1\/client\/([^/]+)\/package$/);
        if (clientPackageMatch) {
          return handleClientPackage(clientPackageMatch[1], env);
        }

        const skillMatch = path.match(/^\/v1\/skill\/([^/]+)$/);
        if (skillMatch) {
          return handleSkill(skillMatch[1], registry);
        }

        // ── Capability discovery (web/mobile-safe, CORS-enabled) ────────────
        const capabilitiesMatch = path.match(/^\/v1\/capabilities\/platform\/([^/]+)$/);
        if (capabilitiesMatch) {
          return handleCapabilitiesForPlatform(capabilitiesMatch[1], registryWithPlatforms);
        }

        if (path === '/v1/skills/compatible') {
          const capsParam = url.searchParams.get('caps');
          return handleSkillsCompatible(registryWithPlatforms, capsParam);
        }

        // ── Tasks ───────────────────────────────────────────────────────────
        if (path === '/v1/tasks') {
          return handleTaskList(env, url);
        }
        if (path === '/v1/hub/latest') {
          return handleHubLatest(env);
        }

        const taskByCodeMatch = path.match(/^\/v1\/t\/([^/]+)$/);
        if (taskByCodeMatch) {
          return handleTaskByCode(env, taskByCodeMatch[1]);
        }
        const taskByNameMatch = path.match(/^\/v1\/tasks\/by-name\/([^/]+)$/);
        if (taskByNameMatch) {
          return handleTaskByName(env, decodeURIComponent(taskByNameMatch[1]));
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

      // ── Mutations ─────────────────────────────────────────────────────────
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
      const taskFindingsMatch = path.match(/^\/v1\/tasks\/([^/]+)\/findings$/);
      if (request.method === 'POST' && taskFindingsMatch) {
        return handleTaskAppendFinding(request, env, taskFindingsMatch[1]);
      }
      const taskFindingsTransitionMatch = path.match(/^\/v1\/tasks\/([^/]+)\/findings\/transition$/);
      if (request.method === 'POST' && taskFindingsTransitionMatch) {
        return handleTaskTransitionFindings(request, env, taskFindingsTransitionMatch[1]);
      }

      if (request.method !== 'GET' && request.method !== 'POST' && request.method !== 'PATCH') {
        return jsonResponse({ error: 'Method Not Allowed' }, 405);
      }

      return notFound(`Unknown route: ${path}`);
    },
  };
}
