import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getWorkerUrl,
  getWorkerToken,
  buildAuthHeader,
  buildRequest,
  formatResult
} from '../smoke-tests.mjs';

test('smoke test helpers - getWorkerUrl returns env variable', () => {
  const original = process.env.AI_CONFIG_WORKER_URL;
  try {
    process.env.AI_CONFIG_WORKER_URL = 'https://example.com/v1';
    assert.equal(getWorkerUrl(), 'https://example.com/v1');
  } finally {
    process.env.AI_CONFIG_WORKER_URL = original;
  }
});

test('smoke test helpers - getWorkerUrl throws when missing', () => {
  const original = process.env.AI_CONFIG_WORKER_URL;
  try {
    delete process.env.AI_CONFIG_WORKER_URL;
    assert.throws(() => getWorkerUrl(), /AI_CONFIG_WORKER_URL/);
  } finally {
    process.env.AI_CONFIG_WORKER_URL = original;
  }
});

test('smoke test helpers - getWorkerToken returns env variable', () => {
  const original = process.env.AI_CONFIG_WORKER_TOKEN;
  try {
    process.env.AI_CONFIG_WORKER_TOKEN = 'test-token-123';
    assert.equal(getWorkerToken(), 'test-token-123');
  } finally {
    process.env.AI_CONFIG_WORKER_TOKEN = original;
  }
});

test('smoke test helpers - getWorkerToken throws when missing', () => {
  const original = process.env.AI_CONFIG_WORKER_TOKEN;
  try {
    delete process.env.AI_CONFIG_WORKER_TOKEN;
    assert.throws(() => getWorkerToken(), /AI_CONFIG_WORKER_TOKEN/);
  } finally {
    process.env.AI_CONFIG_WORKER_TOKEN = original;
  }
});

test('smoke test helpers - buildAuthHeader produces Bearer token', () => {
  const header = buildAuthHeader('my-secret-token');
  assert.equal(header, 'Bearer my-secret-token');
});

test('smoke test helpers - buildRequest creates fetch request', () => {
  const req = buildRequest('https://api.example.com/v1/health', 'GET', 'token123');

  assert.equal(req.url, 'https://api.example.com/v1/health');
  assert.equal(req.options.method, 'GET');
  assert.equal(req.options.headers.Authorization, 'Bearer token123');
});

test('smoke test helpers - buildRequest includes Content-Type for POST', () => {
  const req = buildRequest('https://api.example.com/v1/tasks', 'POST', 'token123', { test: 'data' });

  assert.equal(req.options.method, 'POST');
  assert.equal(req.options.headers['Content-Type'], 'application/json');
  assert.equal(req.options.body, JSON.stringify({ test: 'data' }));
});

test('smoke test helpers - formatResult includes request details', () => {
  const result = formatResult('health', 'GET', 200, { status: 'ok' });

  assert.ok(result.includes('health'));
  assert.ok(result.includes('GET'));
  assert.ok(result.includes('200'));
});

test('smoke test helpers - formatResult handles errors', () => {
  const result = formatResult('health', 'GET', 500, null, 'Internal server error');

  assert.ok(result.includes('health'));
  assert.ok(result.includes('500'));
  assert.ok(result.includes('Internal server error'));
});
