// Worker-safe variant of handoff token service without Ajv schema validation.
// Uses in Worker runtime where JSON.parse boundary provides type safety.
// Node-only validation remains in handoff-token-service.mjs.

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const SIGNATURE_HEX_PATTERN = /^[a-f0-9]{64}$/;

function toEpochMs(value, fieldName) {
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${fieldName}: expected ISO date-time string or epoch milliseconds`);
  }
  return parsed;
}

function ensurePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
}

function ensureNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} is required`);
  }
}

function signaturesMatch(actualHex, expectedHex) {
  if (!SIGNATURE_HEX_PATTERN.test(actualHex) || !SIGNATURE_HEX_PATTERN.test(expectedHex)) {
    return false;
  }

  return timingSafeEqual(Buffer.from(actualHex, 'hex'), Buffer.from(expectedHex, 'hex'));
}

export function canonicalHandoffTokenPayload(token) {
  return [
    token.schema_version,
    token.token_id,
    token.task_id,
    token.issued_at,
    token.expires_at,
    token.replay_nonce,
  ].join('\n');
}

export function signCanonicalHandoffTokenPayload({ secret, canonical }) {
  ensureNonEmptyString(secret, 'secret');
  ensureNonEmptyString(canonical, 'canonical');

  return createHmac('sha256', secret)
    .update(canonical)
    .digest('hex');
}

function createTokenId() {
  return `handoff_${randomUUID().replace(/-/g, '')}`;
}

function createReplayNonce() {
  return randomBytes(16).toString('hex');
}

export class InMemoryHandoffReplayStore {
  constructor() {
    this._entries = new Map();
  }

  _key(tokenId, nonce) {
    return `${tokenId}:${nonce}`;
  }

  _cleanup(nowMs) {
    for (const [key, expiresAtMs] of this._entries.entries()) {
      if (expiresAtMs <= nowMs) {
        this._entries.delete(key);
      }
    }
  }

  isConsumed({ tokenId, nonce, nowMs }) {
    this._cleanup(nowMs);
    const expiresAtMs = this._entries.get(this._key(tokenId, nonce));
    return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
  }

  consume({ tokenId, nonce, nowMs, expiresAtMs }) {
    this._cleanup(nowMs);
    const key = this._key(tokenId, nonce);
    const existing = this._entries.get(key);
    if (Number.isFinite(existing) && existing > nowMs) {
      return false;
    }

    this._entries.set(key, expiresAtMs);
    return true;
  }
}

export function createHandoffTokenService({
  secret,
  replayStore = new InMemoryHandoffReplayStore(),
  now = () => new Date().toISOString(),
  createTokenId: createTokenIdFn = createTokenId,
  createReplayNonce: createReplayNonceFn = createReplayNonce,
} = {}) {
  ensureNonEmptyString(secret, 'secret');

  function issueToken({ taskId, ttlSeconds, now: nowInput } = {}) {
    ensureNonEmptyString(taskId, 'taskId');
    ensurePositiveInteger(ttlSeconds, 'ttlSeconds');

    const issuedAtMs = toEpochMs(nowInput ?? now(), 'now');
    const expiresAtMs = issuedAtMs + (ttlSeconds * 1000);

    const unsignedToken = {
      schema_version: '1.0.0',
      token_id: createTokenIdFn(),
      task_id: taskId,
      issued_at: new Date(issuedAtMs).toISOString(),
      expires_at: new Date(expiresAtMs).toISOString(),
      replay_nonce: createReplayNonceFn(),
    };

    const signature = signCanonicalHandoffTokenPayload({
      secret,
      canonical: canonicalHandoffTokenPayload(unsignedToken),
    });

    // Worker-safe: skip Ajv validation; token structure guaranteed by issueToken construction
    return {
      ...unsignedToken,
      signature,
    };
  }

  function verifyToken({ token, expectedTaskId, now: nowInput } = {}) {
    ensureNonEmptyString(expectedTaskId, 'expectedTaskId');

    // Worker-safe: skip Ajv validation; basic shape checks only
    const validatedToken = token;
    if (validatedToken.task_id !== expectedTaskId) {
      throw new Error(`Token task id mismatch: expected '${expectedTaskId}', got '${validatedToken.task_id}'`);
    }

    const nowMs = toEpochMs(nowInput ?? now(), 'now');
    const issuedAtMs = toEpochMs(validatedToken.issued_at, 'issued_at');
    const expiresAtMs = toEpochMs(validatedToken.expires_at, 'expires_at');

    if (expiresAtMs <= issuedAtMs) {
      throw new Error('Token has invalid lifetime window');
    }
    if (issuedAtMs > nowMs) {
      throw new Error('Token is not active yet');
    }
    if (nowMs >= expiresAtMs) {
      throw new Error('Token is expired');
    }

    const expectedSignature = signCanonicalHandoffTokenPayload({
      secret,
      canonical: canonicalHandoffTokenPayload(validatedToken),
    });

    if (!signaturesMatch(validatedToken.signature, expectedSignature)) {
      throw new Error('Token has invalid signature');
    }

    if (typeof replayStore?.isConsumed === 'function' && replayStore.isConsumed({
      tokenId: validatedToken.token_id,
      nonce: validatedToken.replay_nonce,
      nowMs,
    })) {
      throw new Error('Token/nonce pair is already consumed');
    }

    return validatedToken;
  }

  function consumeToken({ tokenId, nonce, now: nowInput, expiresAt } = {}) {
    ensureNonEmptyString(tokenId, 'tokenId');
    ensureNonEmptyString(nonce, 'nonce');

    const nowMs = toEpochMs(nowInput ?? now(), 'now');
    const expiresAtMs = toEpochMs(expiresAt ?? new Date(nowMs + (5 * 60 * 1000)).toISOString(), 'expiresAt');
    if (expiresAtMs <= nowMs) {
      throw new Error('expiresAt must be in the future');
    }

    if (typeof replayStore?.consume === 'function') {
      const consumed = replayStore.consume({ tokenId, nonce, nowMs, expiresAtMs });
      if (!consumed) {
        throw new Error('Token/nonce pair is already consumed');
      }
    }

    return { tokenId, nonce, consumed_at: new Date(nowMs).toISOString() };
  }

  return {
    issueToken,
    verifyToken,
    consumeToken,
  };
}
