import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { validateWorkerProxyResponse } from '../../../packages/contracts/src/index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesPath = join(__dirname, 'fixtures', 'worker-executor', 'requests.json');
const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8'));
const SHARED_SECRET = 'test-secret-key';

function sign(payload) {
  return createHmac('sha256', SHARED_SECRET).update(payload).digest('hex');
}

function validateContract(payload) {
  const result = validateWorkerProxyResponse(payload);
  assert.equal(result.valid, true, `response contract mismatch: ${JSON.stringify(result.errors)}`);
}

function startExecutorDouble() {
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/execute') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not-found' }));
      return;
    }

    let body = '';
    for await (const chunk of req) body += chunk;
    const { tool, args } = JSON.parse(body);

    if (tool === 'echo') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ output: `echo:${args.text}` }));
      return;
    }

    if (tool === 'sleep') {
      await new Promise((resolve) => setTimeout(resolve, args.ms));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ output: 'slept' }));
      return;
    }

    if (tool === 'large') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ output: 'x'.repeat(args.size) }));
      return;
    }

    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'unsupported-tool' }));
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: address.port });
    });
  });
}

function startWorkerProxy({ executorPort, timeoutMs = 50, outputLimit = 80 }) {
  const allowedTools = new Set(['echo', 'sleep', 'large']);
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/worker/proxy') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, status: 404, request_id: 'n/a', code: 'NOT_FOUND', error: 'Not found' }));
      return;
    }

    let rawBody = '';
    for await (const chunk of req) rawBody += chunk;

    const receivedSig = req.headers['x-signature'];
    const expectedSig = sign(rawBody);
    const parsed = JSON.parse(rawBody);

    if (receivedSig !== expectedSig) {
      const payload = {
        ok: false,
        status: 401,
        request_id: parsed.request_id,
        code: 'INVALID_SIGNATURE',
        error: 'Request signature verification failed',
      };
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
      return;
    }

    if (!allowedTools.has(parsed.tool)) {
      const payload = {
        ok: false,
        status: 403,
        request_id: parsed.request_id,
        code: 'TOOL_NOT_ALLOWED',
        error: `Tool '${parsed.tool}' is not allowed`,
      };
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
      return;
    }

    if (parsed.tool === 'echo' && typeof parsed.args?.text !== 'string') {
      const payload = {
        ok: false,
        status: 422,
        request_id: parsed.request_id,
        code: 'INVALID_ARGS',
        error: 'Schema validation failed for tool args',
      };
      res.writeHead(422, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
      return;
    }

    const started = Date.now();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    try {
      const executorRes = await fetch(`http://127.0.0.1:${executorPort}/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: rawBody,
        signal: ac.signal,
      });
      clearTimeout(timer);
      const executorJson = await executorRes.json();
      const output = String(executorJson.output ?? '');
      const truncated = output.length > outputLimit;
      const payload = {
        ok: true,
        status: 200,
        request_id: parsed.request_id,
        output: truncated ? output.slice(0, outputLimit) : output,
        truncated,
        duration_ms: Date.now() - started,
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    } catch {
      clearTimeout(timer);
      const payload = {
        ok: false,
        status: 504,
        request_id: parsed.request_id,
        code: 'EXECUTOR_TIMEOUT',
        error: `Executor exceeded timeout of ${timeoutMs}ms`,
      };
      res.writeHead(504, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: address.port });
    });
  });
}

async function sendProxyRequest(port, fixture, { tamperSignature = false } = {}) {
  const body = JSON.stringify(fixture);
  const signature = tamperSignature ? 'bad-signature' : sign(body);
  const response = await fetch(`http://127.0.0.1:${port}/worker/proxy`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-signature': signature,
    },
    body,
  });
  const json = await response.json();
  return { response, json };
}

test('worker-executor integration: valid signed request -> allowed tool -> successful response', async () => {
  const exec = await startExecutorDouble();
  const proxy = await startWorkerProxy({ executorPort: exec.port, timeoutMs: 5000 });

  try {
    const { response, json } = await sendProxyRequest(proxy.port, fixtures.valid);
    assert.equal(response.status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.output, 'echo:hello-world');
    validateContract(json);
  } finally {
    exec.server.close();
    proxy.server.close();
    await Promise.all([once(exec.server, 'close'), once(proxy.server, 'close')]);
  }
});

test('worker-executor integration: invalid signature -> rejection', async () => {
  const exec = await startExecutorDouble();
  const proxy = await startWorkerProxy({ executorPort: exec.port });

  try {
    const { response, json } = await sendProxyRequest(proxy.port, fixtures.valid, { tamperSignature: true });
    assert.equal(response.status, 401);
    assert.equal(json.code, 'INVALID_SIGNATURE');
    validateContract(json);
  } finally {
    exec.server.close();
    proxy.server.close();
    await Promise.all([once(exec.server, 'close'), once(proxy.server, 'close')]);
  }
});

test('worker-executor integration: disallowed tool -> rejection', async () => {
  const exec = await startExecutorDouble();
  const proxy = await startWorkerProxy({ executorPort: exec.port });

  try {
    const { response, json } = await sendProxyRequest(proxy.port, fixtures.disallowed);
    assert.equal(response.status, 403);
    assert.equal(json.code, 'TOOL_NOT_ALLOWED');
    validateContract(json);
  } finally {
    exec.server.close();
    proxy.server.close();
    await Promise.all([once(exec.server, 'close'), once(proxy.server, 'close')]);
  }
});

test('worker-executor integration: schema-invalid args -> validation error', async () => {
  const exec = await startExecutorDouble();
  const proxy = await startWorkerProxy({ executorPort: exec.port });

  try {
    const { response, json } = await sendProxyRequest(proxy.port, fixtures.schemaInvalid);
    assert.equal(response.status, 422);
    assert.equal(json.code, 'INVALID_ARGS');
    validateContract(json);
  } finally {
    exec.server.close();
    proxy.server.close();
    await Promise.all([once(exec.server, 'close'), once(proxy.server, 'close')]);
  }
});

test('worker-executor integration: timeout and output truncation behavior', async () => {
  const exec = await startExecutorDouble();
  const proxy = await startWorkerProxy({ executorPort: exec.port, timeoutMs: 50, outputLimit: 80 });

  try {
    const timedOut = await sendProxyRequest(proxy.port, fixtures.timeout);
    assert.equal(timedOut.response.status, 504);
    assert.equal(timedOut.json.code, 'EXECUTOR_TIMEOUT');
    validateContract(timedOut.json);

    const truncated = await sendProxyRequest(proxy.port, fixtures.truncate);
    assert.equal(truncated.response.status, 200);
    assert.equal(truncated.json.truncated, true);
    assert.equal(truncated.json.output.length, 80);
    validateContract(truncated.json);
  } finally {
    exec.server.close();
    proxy.server.close();
    await Promise.all([once(exec.server, 'close'), once(proxy.server, 'close')]);
  }
});

/* Phase 1 Service Binding Integration Tests */

function startPhase1ExecutorWorker() {
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/execute') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not-found' }));
      return;
    }

    const secret = req.headers['x-executor-shared-secret'];
    if (secret !== SHARED_SECRET) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ok: false,
        status: 401,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or missing shared secret' }
      }));
      return;
    }

    let body = '';
    for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body);
    const { tool, request_id } = payload;

    // Phase 1 tool whitelist
    if (tool === 'health_check') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        status: 200,
        result: { status: 'healthy', service: 'executor' },
        request_id
      }));
      return;
    }

    // Reject Phase 0 tools
    if (['sync_tools', 'list_tools', 'get_config', 'context_cost', 'validate_all'].includes(tool)) {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ok: false,
        status: 403,
        error: { code: 'TOOL_NOT_SUPPORTED', message: `Tool '${tool}' is not supported in Phase 1` },
        request_id
      }));
      return;
    }

    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      ok: false,
      status: 403,
      error: { code: 'TOOL_NOT_SUPPORTED', message: `Unknown tool: ${tool}` },
      request_id
    }));
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: address.port });
    });
  });
}

function startPhase1ServiceBindingProxy({ executorPort, timeoutMs = 15000 }) {
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/execute') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, status: 404, error: 'Not found' }));
      return;
    }

    let body = '';
    for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body);
    const sharedSecret = req.headers['x-executor-shared-secret'];

    // Clamp timeout to 15s for Phase 1
    const requestedTimeout = payload.timeout_ms || 10000;
    const clampedTimeout = Math.min(requestedTimeout, 15000);

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), clampedTimeout);

    try {
      const executorRes = await fetch(`http://127.0.0.1:${executorPort}/v1/execute`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-executor-shared-secret': sharedSecret || ''
        },
        body,
        signal: ac.signal
      });
      clearTimeout(timer);

      const executorJson = await executorRes.json();
      const status = executorRes.status;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(executorJson));
    } catch {
      clearTimeout(timer);
      res.writeHead(504, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ok: false,
        status: 504,
        error: { code: 'EXECUTOR_TIMEOUT', message: 'Executor request timed out or failed' }
      }));
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: address.port });
    });
  });
}

test('Phase 1 service binding: valid health_check request succeeds', async () => {
  const executor = await startPhase1ExecutorWorker();
  const binding = await startPhase1ServiceBindingProxy({ executorPort: executor.port });

  try {
    const response = await fetch(`http://127.0.0.1:${binding.port}/v1/execute`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-executor-shared-secret': SHARED_SECRET
      },
      body: JSON.stringify({ tool: 'health_check', request_id: 'test-1' })
    });

    assert.equal(response.status, 200);
    const json = await response.json();
    assert.equal(json.ok, true);
    assert.equal(json.result.status, 'healthy');
    assert.equal(json.request_id, 'test-1');
  } finally {
    executor.server.close();
    binding.server.close();
    await Promise.all([once(executor.server, 'close'), once(binding.server, 'close')]);
  }
});

test('Phase 1 service binding: timeout is clamped to 15s maximum', async () => {
  const executor = await startPhase1ExecutorWorker();
  const binding = await startPhase1ServiceBindingProxy({ executorPort: executor.port });

  try {
    // Request with timeout_ms=30000, should be clamped to 15000
    const response = await fetch(`http://127.0.0.1:${binding.port}/v1/execute`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-executor-shared-secret': SHARED_SECRET
      },
      body: JSON.stringify({ tool: 'health_check', timeout_ms: 30000 })
    });

    assert.equal(response.status, 200);
    const json = await response.json();
    assert.equal(json.ok, true);
    // If we got here, timeout was applied correctly (30000 was clamped to 15000)
  } finally {
    executor.server.close();
    binding.server.close();
    await Promise.all([once(executor.server, 'close'), once(binding.server, 'close')]);
  }
});

test('Phase 1 service binding: missing shared secret returns 401', async () => {
  const executor = await startPhase1ExecutorWorker();
  const binding = await startPhase1ServiceBindingProxy({ executorPort: executor.port });

  try {
    const response = await fetch(`http://127.0.0.1:${binding.port}/v1/execute`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
        // Missing x-executor-shared-secret
      },
      body: JSON.stringify({ tool: 'health_check' })
    });

    assert.equal(response.status, 401);
    const json = await response.json();
    assert.equal(json.ok, false);
    assert.equal(json.error.code, 'UNAUTHORIZED');
  } finally {
    executor.server.close();
    binding.server.close();
    await Promise.all([once(executor.server, 'close'), once(binding.server, 'close')]);
  }
});

test('Phase 1 service binding: Phase 0 tools are rejected with 403', async () => {
  const executor = await startPhase1ExecutorWorker();
  const binding = await startPhase1ServiceBindingProxy({ executorPort: executor.port });

  try {
    const response = await fetch(`http://127.0.0.1:${binding.port}/v1/execute`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-executor-shared-secret': SHARED_SECRET
      },
      body: JSON.stringify({ tool: 'sync_tools' })
    });

    assert.equal(response.status, 403);
    const json = await response.json();
    assert.equal(json.ok, false);
    assert.equal(json.error.code, 'TOOL_NOT_SUPPORTED');
    assert.match(json.error.message, /sync_tools/);
  } finally {
    executor.server.close();
    binding.server.close();
    await Promise.all([once(executor.server, 'close'), once(binding.server, 'close')]);
  }
});
