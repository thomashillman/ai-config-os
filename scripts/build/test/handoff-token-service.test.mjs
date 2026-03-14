import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createHandoffTokenService,
  InMemoryHandoffReplayStore,
  canonicalHandoffTokenPayload,
  signCanonicalHandoffTokenPayload,
} from '../../../runtime/lib/handoff-token-service.mjs';

const SECRET = 'test-secret';
const FIXED_NOW = '2026-03-12T12:00:00.000Z';

function createService(overrides = {}) {
  return createHandoffTokenService({
    secret: SECRET,
    replayStore: new InMemoryHandoffReplayStore(),
    now: () => FIXED_NOW,
    createTokenId: () => 'handoff_001',
    createReplayNonce: () => 'nonce_001',
    ...overrides,
  });
}

test('verifyToken rejects invalid signature', () => {
  const service = createService();
  const token = service.issueToken({ taskId: 'task_001', ttlSeconds: 300 });

  assert.throws(
    () => service.verifyToken({
      token: { ...token, signature: '00'.repeat(32) },
      expectedTaskId: 'task_001',
      now: FIXED_NOW,
    }),
    /invalid signature/i,
  );
});

test('verifyToken rejects expired token', () => {
  const service = createService();
  const token = service.issueToken({ taskId: 'task_001', ttlSeconds: 300 });

  assert.throws(
    () => service.verifyToken({
      token,
      expectedTaskId: 'task_001',
      now: '2026-03-12T12:05:00.000Z',
    }),
    /token is expired/i,
  );
});

test('verifyToken rejects task mismatch', () => {
  const service = createService();
  const token = service.issueToken({ taskId: 'task_001', ttlSeconds: 300 });

  assert.throws(
    () => service.verifyToken({
      token,
      expectedTaskId: 'task_999',
      now: FIXED_NOW,
    }),
    /task id mismatch/i,
  );
});

test('verifyToken rejects consumed token/nonce replay', () => {
  const replayStore = new InMemoryHandoffReplayStore();
  const service = createService({ replayStore });
  const token = service.issueToken({ taskId: 'task_001', ttlSeconds: 300 });

  service.verifyToken({ token, expectedTaskId: 'task_001', now: FIXED_NOW });
  service.consumeToken({ tokenId: token.token_id, nonce: token.replay_nonce, now: FIXED_NOW });

  assert.throws(
    () => service.verifyToken({ token, expectedTaskId: 'task_001', now: FIXED_NOW }),
    /already consumed/i,
  );
});

test('verifyToken enforces issued_at <= now < expires_at boundaries', () => {
  const service = createService();
  const token = service.issueToken({ taskId: 'task_001', ttlSeconds: 300 });

  assert.doesNotThrow(() => service.verifyToken({ token, expectedTaskId: 'task_001', now: token.issued_at }));
  assert.doesNotThrow(() => service.verifyToken({ token, expectedTaskId: 'task_001', now: '2026-03-12T12:04:59.999Z' }));

  assert.throws(
    () => service.verifyToken({ token, expectedTaskId: 'task_001', now: token.expires_at }),
    /token is expired/i,
  );
});

test('consumeToken rejects replay attempt on same token/nonce', () => {
  const service = createService();
  const token = service.issueToken({ taskId: 'task_001', ttlSeconds: 300 });

  service.consumeToken({ tokenId: token.token_id, nonce: token.replay_nonce, now: FIXED_NOW });

  assert.throws(
    () => service.consumeToken({ tokenId: token.token_id, nonce: token.replay_nonce, now: FIXED_NOW }),
    /already consumed/i,
  );
});

test('canonical payload and signature are deterministic', () => {
  const token = {
    schema_version: '1.0.0',
    token_id: 'handoff_001',
    task_id: 'task_001',
    issued_at: '2026-03-12T12:00:00.000Z',
    expires_at: '2026-03-12T12:05:00.000Z',
    replay_nonce: 'nonce_001',
  };

  const canonical = canonicalHandoffTokenPayload(token);
  assert.equal(
    canonical,
    [
      '1.0.0',
      'handoff_001',
      'task_001',
      '2026-03-12T12:00:00.000Z',
      '2026-03-12T12:05:00.000Z',
      'nonce_001',
    ].join('\n'),
  );

  assert.equal(signCanonicalHandoffTokenPayload({ secret: SECRET, canonical }), signCanonicalHandoffTokenPayload({ secret: SECRET, canonical }));
});


test('verifyToken rejects token with invalid lifetime window', () => {
  const service = createService();
  const token = service.issueToken({ taskId: 'task_001', ttlSeconds: 300 });

  assert.throws(
    () => service.verifyToken({
      token: {
        ...token,
        issued_at: '2026-03-12T12:10:00.000Z',
        expires_at: '2026-03-12T12:05:00.000Z',
      },
      expectedTaskId: 'task_001',
      now: '2026-03-12T12:04:00.000Z',
    }),
    /invalid lifetime window/i,
  );
});

test('consumeToken rejects expiresAt in the past', () => {
  const service = createService();

  assert.throws(
    () => service.consumeToken({
      tokenId: 'handoff_001',
      nonce: 'nonce_001',
      now: FIXED_NOW,
      expiresAt: '2026-03-12T11:59:59.000Z',
    }),
    /expiresAt must be in the future/i,
  );
});
