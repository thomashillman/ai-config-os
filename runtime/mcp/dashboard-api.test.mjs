import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDashboardApi } from './dashboard-api.mjs';
import { createTunnelPolicy } from './tunnel-security.mjs';

function createFakeApp() {
  const middlewares = [];
  const gets = [];
  const posts = [];
  let listenArgs = null;
  return {
    use(fn) {
      middlewares.push(fn);
    },
    get(path, handler) {
      gets.push({ path, handler });
    },
    post(path, handler) {
      posts.push({ path, handler });
    },
    listen(...args) {
      listenArgs = args;
      const callback = args[2];
      if (typeof callback === 'function') {
        callback();
      }
      return { close() {} };
    },
    _middlewares: middlewares,
    _gets: gets,
    _posts: posts,
    _listenArgs: () => listenArgs,
  };
}

function createApi(app) {
  return createDashboardApi({
    app,
    corsMiddleware: () => () => {},
    jsonMiddleware: () => {},
    tunnelPolicy: { host: '127.0.0.1', isOriginAllowed: () => true },
    tunnelGuardFactory: () => () => {},
    runScript: () => ({ success: true, output: '' }),
    resolveEffectiveOutcomeContract: ({ toolName }) => ({ outcomeId: `runtime.${toolName}` }),
    validateNumber: (_value, fallback) => fallback,
    capabilityProfileResolver: { getCachedProfile: () => null },
    taskService: {
      startReviewRepositoryTask: () => ({ task: { task_id: 'task_1' }, upgraded: false }),
      resumeReviewRepositoryTask: () => ({ task: { task_id: 'task_1' }, upgraded: true }),
      getReadiness: () => ({ task_id: 'task_1', readiness: { is_ready: true } }),
    },
    repoRoot: '/repo',
    port: 4242,
  });
}

test('dashboard API binds to tunnel policy host and installs tunnel guard middleware', () => {
  const app = createFakeApp();
  const tunnelPolicy = { host: '127.0.0.1', isOriginAllowed: () => true };
  const markerMiddleware = () => {};

  const api = createDashboardApi({
    app,
    corsMiddleware: () => () => {},
    jsonMiddleware: () => {},
    tunnelPolicy,
    tunnelGuardFactory: (policy) => {
      assert.equal(policy, tunnelPolicy);
      return markerMiddleware;
    },
    runScript: () => ({ success: true, output: '' }),
    resolveEffectiveOutcomeContract: () => ({ outcomeId: 'runtime.list-tools' }),
    validateNumber: (value, fallback) => fallback,
    capabilityProfileResolver: { getCachedProfile: () => null },
    taskService: null,
    repoRoot: 'C:/repo',
    port: 4242,
  });

  assert.equal(api.host, '127.0.0.1');
  assert.equal(app._middlewares.includes(markerMiddleware), true);

  api.start();
  const [port, host] = app._listenArgs();
  assert.equal(port, 4242);
  assert.equal(host, '127.0.0.1');
});

test('dashboard API registers task and outcome contract routes', () => {
  const app = createFakeApp();
  createApi(app);

  const getPaths = app._gets.map((route) => route.path);
  const postPaths = app._posts.map((route) => route.path);

  assert.ok(getPaths.includes('/api/outcome-contract'));
  assert.ok(getPaths.includes('/api/tasks/:taskId/readiness'));
  assert.ok(postPaths.includes('/api/tasks/review/start'));
  assert.ok(postPaths.includes('/api/tasks/:taskId/review/resume'));
});

test('dashboard task endpoints fail gracefully when task service is unavailable', () => {
  const app = createFakeApp();
  createDashboardApi({
    app,
    corsMiddleware: () => () => {},
    jsonMiddleware: () => {},
    tunnelPolicy: { host: '127.0.0.1', isOriginAllowed: () => true },
    tunnelGuardFactory: () => () => {},
    runScript: () => ({ success: true, output: '' }),
    resolveEffectiveOutcomeContract: ({ toolName }) => ({ outcomeId: `runtime.${toolName}` }),
    validateNumber: (_value, fallback) => fallback,
    capabilityProfileResolver: { getCachedProfile: () => null },
    taskService: null,
    repoRoot: '/repo',
    port: 4242,
  });

  const startRoute = app._posts.find((route) => route.path === '/api/tasks/review/start');
  let statusCode = 200;
  let jsonPayload = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonPayload = payload;
      return this;
    },
  };

  startRoute.handler({ body: {} }, res);
  assert.equal(statusCode, 503);
  assert.equal(jsonPayload.error.code, 'task_service_unavailable');
  assert.match(jsonPayload.error.message, /task service unavailable/);
});

test('dashboard script-wrapper routes use shared dispatcher mapping', () => {
  const app = createFakeApp();
  const calls = [];
  createDashboardApi({
    app,
    corsMiddleware: () => () => {},
    jsonMiddleware: () => {},
    tunnelPolicy: { host: '127.0.0.1' },
    tunnelGuardFactory: () => () => {},
    runScript: (command, args = []) => {
      calls.push({ command, args });
      return { success: true, output: 'ok' };
    },
    resolveEffectiveOutcomeContract: ({ toolName }) => ({ outcomeId: `runtime.${toolName}` }),
    validateNumber: (value, fallback) => value ?? fallback,
    capabilityProfileResolver: { getCachedProfile: () => null },
    taskService: null,
    repoRoot: '/repo',
    port: 4242,
  });

  const contextCostRoute = app._gets.find((route) => route.path === '/api/context-cost');
  let payload = null;
  contextCostRoute.handler({ query: { threshold: 3001 } }, { json(value) { payload = value; } });

  assert.equal(payload.data.success, true);
  assert.deepEqual(calls, [{ command: 'ops/context-cost.sh', args: ['--threshold', '3001'] }]);
});

test('dashboard context-cost returns 400 for invalid threshold', () => {
  const app = createFakeApp();
  createDashboardApi({
    app,
    corsMiddleware: () => () => {},
    jsonMiddleware: () => {},
    tunnelPolicy: { host: '127.0.0.1' },
    tunnelGuardFactory: () => () => {},
    runScript: () => ({ success: true, output: 'ok' }),
    resolveEffectiveOutcomeContract: ({ toolName }) => ({ outcomeId: `runtime.${toolName}` }),
    validateNumber: () => {
      throw new Error('threshold must be numeric');
    },
    capabilityProfileResolver: { getCachedProfile: () => null },
    taskService: null,
    repoRoot: '/repo',
    port: 4242,
  });

  const contextCostRoute = app._gets.find((route) => route.path === '/api/context-cost');
  let statusCode = 200;
  let payload = null;
  contextCostRoute.handler(
    { query: { threshold: 'oops' } },
    {
      status(code) {
        statusCode = code;
        return this;
      },
      json(value) {
        payload = value;
        return this;
      },
    }
  );

  assert.equal(statusCode, 400);
  assert.equal(payload.error.code, 'invalid_arguments');
  assert.match(payload.error.message, /threshold must be numeric/);
});

test('/api/analytics returns tool_usage events from observation snapshot', async () => {
  const repoRoot = join(tmpdir(), `dash-api-analytics-test-${process.pid}`);
  const claudeDir = join(repoRoot, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(
    join(claudeDir, 'metrics.jsonl'),
    [
      JSON.stringify({ type: 'tool_usage', tool_name: 'Read', status: 'success', duration_ms: 10 }),
      JSON.stringify({ type: 'tool_usage', tool_name: 'Edit', status: 'error', duration_ms: 5 }),
    ].join('\n') + '\n'
  );

  const app = createFakeApp();
  createDashboardApi({
    app,
    corsMiddleware: () => () => {},
    jsonMiddleware: () => {},
    tunnelPolicy: { host: '127.0.0.1', isOriginAllowed: () => true },
    tunnelGuardFactory: () => () => {},
    runScript: () => ({ success: true, output: '' }),
    resolveEffectiveOutcomeContract: ({ toolName }) => ({ outcomeId: `runtime.${toolName}` }),
    validateNumber: (_value, fallback) => fallback,
    capabilityProfileResolver: { getCachedProfile: () => null },
    taskService: null,
    repoRoot,
    port: 4242,
  });

  const analyticsRoute = app._gets.find((r) => r.path === '/api/analytics');
  let payload = null;
  await analyticsRoute.handler({}, { json(value) { payload = value; } });

  rmSync(repoRoot, { recursive: true, force: true });

  assert.equal(payload.data.success, true);
  assert.ok(Array.isArray(payload.data.metrics));
  assert.ok(payload.data.metrics.every((m) => m.type === 'tool_usage'));
  assert.equal(payload.data.metrics.length, 2);
});

test('/api/skill-analytics aggregates skill_outcome events via observation snapshot', async () => {
  const tempHome = join(tmpdir(), `dash-api-skill-analytics-test-${process.pid}`);
  const analyticsDir = join(tempHome, '.claude', 'skill-analytics');
  mkdirSync(analyticsDir, { recursive: true });
  writeFileSync(
    join(analyticsDir, 'skill-outcomes.jsonl'),
    [
      JSON.stringify({ skill: 'commit-conventions', outcome: 'output_used', timestamp: '2026-01-01T00:00:00Z' }),
      JSON.stringify({ skill: 'commit-conventions', outcome: 'output_used', timestamp: '2026-01-01T00:01:00Z' }),
      JSON.stringify({ skill: 'commit-conventions', outcome: 'output_replaced', timestamp: '2026-01-01T00:02:00Z' }),
      JSON.stringify({ skill: 'debug', outcome: 'output_used', timestamp: '2026-01-01T00:03:00Z' }),
    ].join('\n') + '\n'
  );

  const origHome = process.env.HOME;
  process.env.HOME = tempHome;

  const app = createFakeApp();
  createDashboardApi({
    app,
    corsMiddleware: () => () => {},
    jsonMiddleware: () => {},
    tunnelPolicy: { host: '127.0.0.1', isOriginAllowed: () => true },
    tunnelGuardFactory: () => () => {},
    runScript: () => ({ success: true, output: '' }),
    resolveEffectiveOutcomeContract: ({ toolName }) => ({ outcomeId: `runtime.${toolName}` }),
    validateNumber: (_value, fallback) => fallback,
    capabilityProfileResolver: { getCachedProfile: () => null },
    taskService: null,
    repoRoot: tempHome,
    port: 4242,
  });

  const skillRoute = app._gets.find((r) => r.path === '/api/skill-analytics');
  let payload = null;
  await skillRoute.handler({}, { json(value) { payload = value; } });

  process.env.HOME = origHome;
  rmSync(tempHome, { recursive: true, force: true });

  assert.equal(payload.data.success, true);
  assert.ok(Array.isArray(payload.data.skills));
  const cc = payload.data.skills.find((s) => s.skill === 'commit-conventions');
  assert.ok(cc, 'commit-conventions skill should be present');
  assert.equal(cc.used, 2);
  assert.equal(cc.replaced, 1);
  assert.equal(cc.total, 3);
  assert.equal(cc.use_rate, 67);
  const dbg = payload.data.skills.find((s) => s.skill === 'debug');
  assert.ok(dbg);
  assert.equal(dbg.use_rate, 100);
});

test('/api/retrospectives-summary returns parsed cache when file exists', async () => {
  const tempHome = join(tmpdir(), `dash-api-retro-test-${process.pid}`);
  const cacheDir = join(tempHome, '.ai-config-os', 'cache', 'claude-code');
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(join(cacheDir, 'retrospectives-aggregate.json'), JSON.stringify({
    period_days: 60,
    artifact_count: 3,
    signal_breakdown: { loop: 4, error: 2 },
    top_recommendations: [{ name: 'git-ops', category: 'code-quality', occurrences: 2, priority_distribution: { high: 1 } }],
  }));

  const origHome = process.env.HOME;
  process.env.HOME = tempHome;

  const app = createFakeApp();
  createDashboardApi({
    app,
    corsMiddleware: () => () => {},
    jsonMiddleware: () => {},
    tunnelPolicy: { host: '127.0.0.1', isOriginAllowed: () => true },
    tunnelGuardFactory: () => () => {},
    runScript: () => ({ success: true, output: '' }),
    resolveEffectiveOutcomeContract: ({ toolName }) => ({ outcomeId: `runtime.${toolName}` }),
    validateNumber: (_value, fallback) => fallback,
    capabilityProfileResolver: { getCachedProfile: () => null },
    taskService: null,
    repoRoot: tempHome,
    port: 4242,
  });

  const route = app._gets.find((r) => r.path === '/api/retrospectives-summary');
  let payload = null;
  route.handler({}, { json(value) { payload = value; } });

  process.env.HOME = origHome;
  rmSync(tempHome, { recursive: true, force: true });

  assert.equal(payload.data.success, true);
  assert.equal(payload.data.artifact_count, 3);
  assert.deepEqual(payload.data.signal_breakdown, { loop: 4, error: 2 });
  assert.equal(payload.data.top_recommendations[0].name, 'git-ops');
});

test('/api/retrospectives-summary returns empty fallback when cache file is absent', () => {
  const tempHome = join(tmpdir(), `dash-api-retro-missing-${process.pid}`);
  mkdirSync(tempHome, { recursive: true });

  const origHome = process.env.HOME;
  process.env.HOME = tempHome;

  const app = createFakeApp();
  createDashboardApi({
    app,
    corsMiddleware: () => () => {},
    jsonMiddleware: () => {},
    tunnelPolicy: { host: '127.0.0.1', isOriginAllowed: () => true },
    tunnelGuardFactory: () => () => {},
    runScript: () => ({ success: true, output: '' }),
    resolveEffectiveOutcomeContract: ({ toolName }) => ({ outcomeId: `runtime.${toolName}` }),
    validateNumber: (_value, fallback) => fallback,
    capabilityProfileResolver: { getCachedProfile: () => null },
    taskService: null,
    repoRoot: tempHome,
    port: 4242,
  });

  const route = app._gets.find((r) => r.path === '/api/retrospectives-summary');
  let payload = null;
  route.handler({}, { json(value) { payload = value; } });

  process.env.HOME = origHome;
  rmSync(tempHome, { recursive: true, force: true });

  assert.equal(payload.data.success, true);
  assert.equal(payload.data.artifact_count, 0);
  assert.deepEqual(payload.data.signal_breakdown, {});
  assert.deepEqual(payload.data.top_recommendations, []);
});

test('dashboard API CORS uses tunnel policy origin allowlisting for local and configured tunnel origins', async () => {
  const app = createFakeApp();
  let corsOptions = null;

  createDashboardApi({
    app,
    corsMiddleware: (options) => {
      corsOptions = options;
      return () => {};
    },
    jsonMiddleware: () => {},
    tunnelPolicy: createTunnelPolicy({
      DASHBOARD_HOST: '127.0.0.1',
      DASHBOARD_PUBLIC_ORIGINS: 'https://dashboard.example.com',
    }),
    tunnelGuardFactory: () => () => {},
    runScript: () => ({ success: true, output: '' }),
    resolveEffectiveOutcomeContract: ({ toolName }) => ({ outcomeId: `runtime.${toolName}` }),
    validateNumber: (_value, fallback) => fallback,
    capabilityProfileResolver: { getCachedProfile: () => null },
    taskService: null,
    repoRoot: '/repo',
    port: 4242,
  });

  assert.equal(typeof corsOptions?.origin, 'function');

  const isOriginAllowed = (origin) =>
    new Promise((resolve, reject) => {
      corsOptions.origin(origin, (error, allowed) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(allowed);
      });
    });

  assert.equal(await isOriginAllowed('https://dashboard.example.com'), true);
  assert.equal(await isOriginAllowed('https://evil.example.com'), false);
  assert.equal(await isOriginAllowed('http://localhost:5173'), true);
});
