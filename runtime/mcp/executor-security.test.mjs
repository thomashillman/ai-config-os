import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { runScriptWithGuardrails, toBoundedToolResponse } from './executor-runtime.mjs';
import { createTunnelPolicy } from './tunnel-security.mjs';

function withEnv(overrides, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('oversized stdout is deterministically truncated with metadata', () => {
  const repoRoot = path.resolve(process.cwd(), "../..");
  const scriptRelPath = 'runtime/mcp/tmp-large-output-test.sh';
  const scriptPath = path.join(repoRoot, scriptRelPath);
  fs.writeFileSync(scriptPath, '#!/usr/bin/env bash\npython - <<"PY"\nprint("A" * 400, end="")\nPY\n');
  fs.chmodSync(scriptPath, 0o755);

  try {
    const result = withEnv(
      {
        EXECUTOR_MAX_STDIO_BYTES: 64,
        EXECUTOR_MAX_RESPONSE_BYTES: 128,
      },
      () => runScriptWithGuardrails(scriptRelPath, [], repoRoot)
    );

    assert.equal(result.success, true);
    assert.equal(result.metadata.stdout_truncated, true);
    assert.match(result.stdout, /\[stdout truncated: \d+ bytes dropped\]/);
    assert.ok(result.metadata.bytes_dropped > 0);

    const response = toBoundedToolResponse(result);
    assert.equal(response.metadata.stdout_truncated, true);
    assert.equal(response.metadata.response_truncated, false);
  } finally {
    fs.unlinkSync(scriptPath);
  }
});

test('timeout expiry is surfaced in metadata', () => {
  const repoRoot = path.resolve(process.cwd(), "../..");
  const scriptRelPath = 'runtime/mcp/tmp-timeout-test.sh';
  const scriptPath = path.join(repoRoot, scriptRelPath);
  fs.writeFileSync(scriptPath, '#!/usr/bin/env bash\nsleep 1\necho done\n');
  fs.chmodSync(scriptPath, 0o755);

  try {
    const result = withEnv(
      {
        EXECUTOR_TIMEOUT_MS: 100,
      },
      () => runScriptWithGuardrails(scriptRelPath, [], repoRoot)
    );

    assert.equal(result.success, false);
    assert.equal(result.metadata.timed_out, true);
  } finally {
    fs.unlinkSync(scriptPath);
  }
});

test('direct/public access is rejected while tunnel-approved requests are accepted', () => {
  const policy = createTunnelPolicy({
    TRUSTED_FORWARDER_IPS: '10.0.0.10',
    TUNNEL_SHARED_TOKEN: 'secret-token',
    DASHBOARD_HOST: '127.0.0.1',
  });

  assert.equal(
    policy.isTunnelApproved({
      remoteAddress: '198.51.100.7',
      headers: {},
    }),
    false
  );

  assert.equal(
    policy.isTunnelApproved({
      remoteAddress: '198.51.100.7',
      headers: {
        'x-tunnel-token': 'secret-token',
      },
    }),
    true
  );

  assert.equal(
    policy.isTunnelApproved({
      remoteAddress: '10.0.0.10',
      headers: {
        'x-forwarded-for': '203.0.113.50',
        'x-forwarded-proto': 'https',
      },
    }),
    true
  );
});

test('response payload cap trims oversized combined output and records dropped bytes', () => {
  const fakeResult = {
    success: true,
    stdout: 'x'.repeat(500),
    stderr: '',
    metadata: {
      timeout_ms: 1000,
      stdout_truncated: false,
      stderr_truncated: false,
      response_truncated: false,
      timed_out: false,
      bytes_dropped: 0,
    },
    _maxResponseBytes: 80,
  };

  const response = toBoundedToolResponse(fakeResult);
  assert.equal(response.metadata.response_truncated, true);
  assert.ok(response.metadata.bytes_dropped > 0);
  assert.match(response.content[0].text, /\[response payload truncated: \d+ bytes dropped\]/);
});
