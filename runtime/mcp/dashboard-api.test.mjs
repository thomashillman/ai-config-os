import test from 'node:test';
import assert from 'node:assert/strict';
import { createDashboardApi } from './dashboard-api.mjs';

function createFakeApp() {
  const middlewares = [];
  let listenArgs = null;
  return {
    use(fn) {
      middlewares.push(fn);
    },
    get() {},
    post() {},
    listen(...args) {
      listenArgs = args;
      const callback = args[2];
      if (typeof callback === 'function') {
        callback();
      }
      return { close() {} };
    },
    _middlewares: middlewares,
    _listenArgs: () => listenArgs,
  };
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
