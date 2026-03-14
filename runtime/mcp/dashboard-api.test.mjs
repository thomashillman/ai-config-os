import test from 'node:test';
import assert from 'node:assert/strict';
import { createDashboardApi } from './dashboard-api.mjs';

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
    tunnelPolicy: { host: '127.0.0.1' },
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
  const tunnelPolicy = { host: '127.0.0.1' };
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
    tunnelPolicy: { host: '127.0.0.1' },
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
  assert.equal(jsonPayload.success, false);
  assert.match(jsonPayload.error, /task service unavailable/);
});
