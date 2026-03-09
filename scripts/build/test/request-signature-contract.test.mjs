import test from 'node:test';
import assert from 'node:assert/strict';
import {
  InMemoryNonceStore,
  canonicalSigningInput,
  verifySignedRequest,
} from '../../../shared/contracts/request-signature.mjs';

const SECRET = 'test-signing-secret';

async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function signCanonical(secret, canonical) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `v1=${hex}`;
}

async function makeHeaders({ method = 'GET', path = '/v1/health', body = '', timestamp = Date.now(), nonce = 'n-1' } = {}) {
  const bodyHash = await sha256Hex(body);
  const canonical = canonicalSigningInput({ method, path, timestamp: String(timestamp), nonce, bodyHash });
  const signature = await signCanonical(SECRET, canonical);

  return new Headers({
    'X-AIOS-Timestamp': String(timestamp),
    'X-AIOS-Nonce': nonce,
    'X-AIOS-Body-SHA256': bodyHash,
    'X-AIOS-Signature': signature,
  });
}

test('verifySignedRequest accepts valid signed request', async () => {
  const headers = await makeHeaders();
  const result = await verifySignedRequest({
    method: 'GET',
    path: '/v1/health',
    headers,
    body: '',
    secret: SECRET,
    nonceStore: new InMemoryNonceStore(),
  });

  assert.equal(result.ok, true);
});

test('verifySignedRequest rejects stale timestamp', async () => {
  const timestamp = Date.now() - (10 * 60 * 1000);
  const headers = await makeHeaders({ timestamp, nonce: 'n-stale' });

  const result = await verifySignedRequest({
    method: 'GET',
    path: '/v1/health',
    headers,
    body: '',
    secret: SECRET,
    nowMs: Date.now(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.status, 403);
  assert.equal(result.error.code, 'stale_timestamp');
});

test('verifySignedRequest rejects replayed nonce', async () => {
  const nonceStore = new InMemoryNonceStore();
  const headers = await makeHeaders({ nonce: 'n-replay' });

  const first = await verifySignedRequest({
    method: 'GET',
    path: '/v1/health',
    headers,
    body: '',
    secret: SECRET,
    nonceStore,
  });
  const second = await verifySignedRequest({
    method: 'GET',
    path: '/v1/health',
    headers,
    body: '',
    secret: SECRET,
    nonceStore,
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.error.status, 403);
  assert.equal(second.error.code, 'replayed_nonce');
});
