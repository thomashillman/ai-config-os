import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { runScriptWithGuardrails, toBoundedToolResponse } from './executor-runtime.mjs';
import { createTunnelPolicy } from './tunnel-security.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '../..');
const HAS_BASH = spawnSync('bash', ['-lc', 'echo ok'], { stdio: 'ignore' }).status === 0;

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

test('oversized stdout is deterministically truncated with metadata', { skip: !HAS_BASH }, () => {
  const scriptRelPath = 'runtime/mcp/tmp-large-output-test.sh';
  const scriptPath = path.join(REPO_ROOT, scriptRelPath);
  fs.writeFileSync(scriptPath, '#!/usr/bin/env bash\ni=0\nwhile [ "$i" -lt 400 ]; do\n  printf "A"\n  i=$((i + 1))\ndone\n');
  fs.chmodSync(scriptPath, 0o755);

  try {
    const result = withEnv(
      {
        EXECUTOR_MAX_STDIO_BYTES: 64,
        EXECUTOR_MAX_RESPONSE_BYTES: 128,
      },
      () => runScriptWithGuardrails(scriptRelPath, [], REPO_ROOT)
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

test('timeout expiry is surfaced in metadata', { skip: !HAS_BASH }, () => {
  const scriptRelPath = 'runtime/mcp/tmp-timeout-test.sh';
  const scriptPath = path.join(REPO_ROOT, scriptRelPath);
  fs.writeFileSync(scriptPath, '#!/usr/bin/env bash\nwhile true; do\n  :\ndone\n');
  fs.chmodSync(scriptPath, 0o755);

  try {
    const result = withEnv(
      {
        EXECUTOR_TIMEOUT_MS: 100,
      },
      () => runScriptWithGuardrails(scriptRelPath, [], REPO_ROOT)
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

test('mTLS header is ignored for untrusted remote address', () => {
  const policy = createTunnelPolicy({
    TRUSTED_FORWARDER_IPS: '10.0.0.10',
    REQUIRE_TUNNEL_MTLS: '1',
  });

  assert.equal(
    policy.isTunnelApproved({
      remoteAddress: '198.51.100.7',
      headers: {
        'x-client-cert-verified': 'SUCCESS',
      },
    }),
    false
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
