import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTRACT_VERSION,
  assertExecutionResult,
  assertSignedExecutionRequestEnvelope,
  assertToolInvocationPayload,
  makeErrorResponse,
} from '../../../packages/contracts/index.js';

test('tool invocation payload validates required fields', () => {
  const payload = assertToolInvocationPayload({
    toolName: 'validate_all',
    args: { dry_run: true },
  });

  assert.equal(payload.toolName, 'validate_all');
});

test('execution request envelope includes compatibility contractVersion', () => {
  const envelope = assertSignedExecutionRequestEnvelope({
    contractVersion: CONTRACT_VERSION,
    requestId: 'req-123',
    issuedAt: new Date().toISOString(),
    signature: {
      algorithm: 'hmac-sha256',
      keyId: 'test-key',
      value: 'signature',
    },
    payload: {
      toolName: 'sync_tools',
      args: { dry_run: false },
    },
  });

  assert.equal(envelope.contractVersion, CONTRACT_VERSION);
});

test('execution result shape enforces stdout/stderr/exit metadata', () => {
  const result = assertExecutionResult({
    ok: false,
    stdout: 'partial output',
    stderr: 'failure',
    exitCode: 1,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 15,
  });

  assert.equal(result.exitCode, 1);
});

test('error response shape is contract-backed', () => {
  const response = makeErrorResponse({
    code: 'EXECUTION_FAILED',
    message: 'Execution failed',
    requestId: 'req-123',
  });

  assert.equal(response.contractVersion, CONTRACT_VERSION);
  assert.equal(response.ok, false);
});
