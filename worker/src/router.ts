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
import { handleRuntimeCapabilities } from './handlers/runtime';
import {
  handleObservabilityRunCreate,
  handleObservabilityRunGet,
  handleObservabilityRunList,
  handleObservabilitySettingsGet,
  handleObservabilitySettingsPut,
} from './handlers/observability';
import {
  handleRetrospectiveAggregate,
  handleRetrospectiveCreate,
  handleRetrospectiveGet,
  handleRetrospectiveList,
} from './handlers/retrospectives';
import {
  handleHubLatest,
  handleTaskAppendFinding,
  handleTaskAnswerQuestion,
  handleTaskAvailableRoutes,
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
  handleTaskDismissQuestion,
} from './handlers/tasks';
import type { Env } from './types';

type RouteContext = {
  request: Request;
  env: Env;
  url: URL;
  params: string[];
};

type RouteHandler = (ctx: RouteContext) => Response | Promise<Response>;

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH';

type RouteEntry = {
  method: HttpMethod;
  pattern: string | RegExp;
  handler: RouteHandler;
};

export function createWorkerHandler(registry: RegistryLike, pluginJson: unknown): ExportedHandler<Env> {
  const rp = registry as RegistryWithPlatforms;

  const ROUTES: RouteEntry[] = [
    // ── Health & manifests ──────────────────────────────────────────────
    { method: 'GET',   pattern: '/v1/health',                                        handler: ({ env }) => handleHealth(env, registry) },
    { method: 'GET',   pattern: '/v1/manifest/latest',                               handler: ({ env }) => handleManifestLatest(env, registry) },
    { method: 'GET',   pattern: '/v1/outcomes/latest',                               handler: ({ env }) => handleLatestArtifact(env, registry, 'outcomes.json') },
    { method: 'GET',   pattern: '/v1/routes/latest',                                 handler: ({ env }) => handleLatestArtifact(env, registry, 'routes.json') },
    { method: 'GET',   pattern: '/v1/tools/latest',                                  handler: ({ env }) => handleLatestArtifact(env, registry, 'tools.json') },

    // ── Versioned artifacts ─────────────────────────────────────────────
    { method: 'GET',   pattern: /^\/v1\/outcomes\/([^/]+)$/,                         handler: ({ env, params }) => handleVersionedArtifact(env, params[0], 'outcomes.json') },
    { method: 'GET',   pattern: /^\/v1\/routes\/([^/]+)$/,                           handler: ({ env, params }) => handleVersionedArtifact(env, params[0], 'routes.json') },
    { method: 'GET',   pattern: /^\/v1\/tools\/([^/]+)$/,                            handler: ({ env, params }) => handleVersionedArtifact(env, params[0], 'tools.json') },

    // ── Effective contract ──────────────────────────────────────────────
    { method: 'GET',   pattern: '/v1/effective-contract/preview',                    handler: ({ env }) => handleEffectiveContractPreview(env, registry) },

    // ── Client & skills ─────────────────────────────────────────────────
    { method: 'GET',   pattern: /^\/v1\/client\/([^/]+)\/latest$/,                   handler: ({ params }) => handleClientLatest(params[0], registry, pluginJson) },
    { method: 'GET',   pattern: /^\/v1\/client\/([^/]+)\/package$/,                  handler: ({ env, params }) => handleClientPackage(params[0], env) },
    { method: 'GET',   pattern: /^\/v1\/skill\/([^/]+)$/,                            handler: ({ params }) => handleSkill(params[0], registry) },

    // ── Capability discovery (web/mobile-safe, CORS-enabled) ────────────
    { method: 'GET',   pattern: /^\/v1\/capabilities\/platform\/([^/]+)$/,           handler: ({ params }) => handleCapabilitiesForPlatform(params[0], rp) },
    { method: 'GET',   pattern: '/v1/skills/compatible',                             handler: ({ url }) => handleSkillsCompatible(rp, url.searchParams.get('caps')) },

    // ── Runtime ─────────────────────────────────────────────────────────
    { method: 'GET',   pattern: '/v1/runtime/capabilities',                            handler: ({ env }) => handleRuntimeCapabilities(env) },

    // ── Observability reads ─────────────────────────────────────────────
    { method: 'GET',   pattern: '/v1/observability/runs',                            handler: ({ request, env }) => handleObservabilityRunList(request, env) },
    { method: 'GET',   pattern: /^\/v1\/observability\/runs\/([^/]+)$/,              handler: ({ env, params }) => handleObservabilityRunGet(params[0], env) },
    { method: 'GET',   pattern: '/v1/observability/settings',                        handler: ({ env }) => handleObservabilitySettingsGet(env) },

    // ── Observability mutations ─────────────────────────────────────────
    { method: 'POST',  pattern: '/v1/observability/runs',                            handler: ({ request, env }) => handleObservabilityRunCreate(request, env) },
    { method: 'PUT',   pattern: '/v1/observability/settings',                        handler: ({ request, env }) => handleObservabilitySettingsPut(request, env) },

    // ── Retrospective reads ─────────────────────────────────────────────
    { method: 'GET',   pattern: '/v1/retrospectives',                                handler: ({ request, env }) => handleRetrospectiveList(request, env) },
    { method: 'GET',   pattern: '/v1/retrospectives/aggregate',                      handler: ({ request, env }) => handleRetrospectiveAggregate(request, env) },
    { method: 'GET',   pattern: /^\/v1\/retrospectives\/([^/]+)$/,                   handler: ({ env, params }) => handleRetrospectiveGet(params[0], env) },

    // ── Retrospective mutations ─────────────────────────────────────────
    { method: 'POST',  pattern: '/v1/retrospectives',                                handler: ({ request, env }) => handleRetrospectiveCreate(request, env) },

    // ── Execute ─────────────────────────────────────────────────────────
    { method: 'POST',  pattern: '/v1/execute',                                       handler: ({ request, env }) => handleExecute(request, env) },

    // ── Task reads ──────────────────────────────────────────────────────
    { method: 'GET',   pattern: '/v1/tasks',                                         handler: ({ env, url }) => handleTaskList(env, url) },
    { method: 'GET',   pattern: '/v1/hub/latest',                                    handler: ({ env }) => handleHubLatest(env) },
    { method: 'GET',   pattern: /^\/v1\/t\/([^/]+)$/,                               handler: ({ env, params }) => handleTaskByCode(env, params[0]) },
    { method: 'GET',   pattern: /^\/v1\/tasks\/by-name\/([^/]+)$/,                  handler: ({ env, params }) => handleTaskByName(env, decodeURIComponent(params[0])) },
    { method: 'GET',   pattern: /^\/v1\/tasks\/([^/]+)\/progress-events$/,           handler: ({ env, params }) => handleTaskProgressEvents(env, params[0]) },
    { method: 'GET',   pattern: /^\/v1\/tasks\/([^/]+)\/available-routes$/,           handler: ({ env, params }) => handleTaskAvailableRoutes(env, params[0]) },
    { method: 'GET',   pattern: /^\/v1\/tasks\/([^/]+)\/readiness$/,                 handler: ({ env, params }) => handleTaskReadiness(env, params[0]) },
    { method: 'GET',   pattern: /^\/v1\/tasks\/([^/]+)\/snapshots\/([^/]+)$/,        handler: ({ env, params }) => handleTaskSnapshots(env, params[0], params[1]) },
    { method: 'GET',   pattern: /^\/v1\/tasks\/([^/]+)\/snapshots$/,                 handler: ({ env, params }) => handleTaskSnapshots(env, params[0], null) },
    { method: 'GET',   pattern: /^\/v1\/tasks\/([^/]+)$/,                            handler: ({ env, params }) => handleTaskGet(env, params[0]) },

    // ── Task mutations ──────────────────────────────────────────────────
    { method: 'POST',  pattern: '/v1/tasks',                                         handler: ({ request, env }) => handleTaskCreate(request, env) },
    { method: 'POST',  pattern: /^\/v1\/tasks\/([^/]+)\/route-selection$/,           handler: ({ request, env, params }) => handleTaskRouteSelection(request, env, params[0]) },
    { method: 'POST',  pattern: /^\/v1\/tasks\/([^/]+)\/continuation$/,              handler: ({ request, env, params }) => handleTaskContinuation(request, env, params[0]) },
    { method: 'POST',  pattern: /^\/v1\/tasks\/([^/]+)\/questions\/([^/]+)\/answer$/, handler: ({ request, env, params }) => handleTaskAnswerQuestion(request, env, params[0], params[1]) },
    { method: 'POST',  pattern: /^\/v1\/tasks\/([^/]+)\/questions\/([^/]+)\/dismiss$/, handler: ({ request, env, params }) => handleTaskDismissQuestion(request, env, params[0], params[1]) },
    { method: 'PATCH', pattern: /^\/v1\/tasks\/([^/]+)\/state$/,                     handler: ({ request, env, params }) => handleTaskTransitionState(request, env, params[0]) },
    { method: 'POST',  pattern: /^\/v1\/tasks\/([^/]+)\/findings\/transition$/,      handler: ({ request, env, params }) => handleTaskTransitionFindings(request, env, params[0]) },
    { method: 'POST',  pattern: /^\/v1\/tasks\/([^/]+)\/findings$/,                  handler: ({ request, env, params }) => handleTaskAppendFinding(request, env, params[0]) },
  ];

  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      // CORS preflight — no auth required
      if (request.method === 'OPTIONS') {
        return corsPreflightResponse();
      }

      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method as HttpMethod;

      if (!isAuthorized(request, env)) {
        return unauthorizedResponse();
      }

      for (const route of ROUTES) {
        if (route.method !== method) continue;
        if (typeof route.pattern === 'string') {
          if (path !== route.pattern) continue;
          return route.handler({ request, env, url, params: [] });
        }
        const m = path.match(route.pattern);
        if (!m) continue;
        return route.handler({ request, env, url, params: m.slice(1) as string[] });
      }

      const knownMethods: HttpMethod[] = ['GET', 'POST', 'PATCH', 'PUT'];
      if (!knownMethods.includes(method)) {
        return jsonResponse({ error: 'Method Not Allowed' }, 405);
      }

      return notFound(`Unknown route: ${path}`);
    },
  };
}
