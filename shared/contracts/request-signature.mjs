import { timingSafeEqual } from "node:crypto";

const encoder = new TextEncoder();

export const SIGNATURE_HEADERS = {
  timestamp: "X-AIOS-Timestamp",
  nonce: "X-AIOS-Nonce",
  bodyHash: "X-AIOS-Body-SHA256",
  signature: "X-AIOS-Signature",
};

export const SIGNATURE_ALGORITHM = "HMAC-SHA256";
export const SIGNATURE_VERSION = "v1";
export const DEFAULT_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function canonicalSigningInput({
  method,
  path,
  timestamp,
  nonce,
  bodyHash,
}) {
  return [
    method.toUpperCase(),
    path,
    timestamp,
    nonce,
    bodyHash.toLowerCase(),
  ].join("\n");
}

async function sha256Hex(input) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(secret, input) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(input));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const SIGNATURE_PATTERN = /^v1=([a-f0-9]{64})$/i;

function signaturesMatch(actual, expected) {
  const actualMatch = SIGNATURE_PATTERN.exec(actual);
  const expectedMatch = SIGNATURE_PATTERN.exec(expected);

  if (!actualMatch || !expectedMatch) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(actualMatch[1], "hex"),
    Buffer.from(expectedMatch[1], "hex"),
  );
}

function structuredError(status, code, message, details = {}) {
  return { ok: false, error: { status, code, message, details } };
}

export class InMemoryNonceStore {
  constructor() {
    this._seen = new Map();
  }

  consume(nonce, nowMs) {
    const existing = this._seen.get(nonce);
    if (existing && existing > nowMs) return false;
    this._seen.set(nonce, nowMs + DEFAULT_CLOCK_SKEW_MS);

    for (const [key, expiresAt] of this._seen.entries()) {
      if (expiresAt <= nowMs) this._seen.delete(key);
    }

    return true;
  }
}

export async function verifySignedRequest({
  method,
  path,
  headers,
  body = "",
  secret,
  nowMs = Date.now(),
  nonceStore,
  clockSkewMs = DEFAULT_CLOCK_SKEW_MS,
}) {
  if (!secret) {
    return structuredError(
      401,
      "signing_secret_missing",
      "Request signing secret is not configured",
    );
  }

  const timestamp = headers.get(SIGNATURE_HEADERS.timestamp) ?? "";
  const nonce = headers.get(SIGNATURE_HEADERS.nonce) ?? "";
  const bodyHash = headers.get(SIGNATURE_HEADERS.bodyHash) ?? "";
  const signatureHeader = headers.get(SIGNATURE_HEADERS.signature) ?? "";

  if (!timestamp || !nonce || !bodyHash || !signatureHeader) {
    return structuredError(
      401,
      "missing_signature_headers",
      "Required request-signing headers are missing",
      {
        required: Object.values(SIGNATURE_HEADERS),
      },
    );
  }

  const parsedTs = Number(timestamp);
  if (!Number.isFinite(parsedTs)) {
    return structuredError(
      401,
      "invalid_timestamp",
      "Timestamp must be epoch milliseconds",
    );
  }

  if (Math.abs(nowMs - parsedTs) > clockSkewMs) {
    return structuredError(
      403,
      "stale_timestamp",
      "Timestamp is outside allowed clock-skew window",
      {
        clock_skew_ms: clockSkewMs,
      },
    );
  }

  if (!/^[a-f0-9]{64}$/i.test(bodyHash)) {
    return structuredError(
      401,
      "invalid_body_hash",
      "Body hash must be a lowercase SHA-256 hex digest",
    );
  }

  const computedBodyHash = await sha256Hex(body);
  if (computedBodyHash !== bodyHash.toLowerCase()) {
    return structuredError(
      401,
      "body_hash_mismatch",
      "Body hash does not match request payload",
    );
  }

  const canonical = canonicalSigningInput({
    method,
    path,
    timestamp,
    nonce,
    bodyHash,
  });
  const expected = `${SIGNATURE_VERSION}=${await hmacSha256Hex(secret, canonical)}`;

  if (!signaturesMatch(signatureHeader, expected)) {
    return structuredError(
      401,
      "invalid_signature",
      "Signature verification failed",
      {
        algorithm: SIGNATURE_ALGORITHM,
      },
    );
  }

  if (
    nonceStore &&
    typeof nonceStore.consume === "function" &&
    !nonceStore.consume(nonce, nowMs)
  ) {
    return structuredError(
      403,
      "replayed_nonce",
      "Nonce was already used inside the accepted window",
    );
  }

  return { ok: true, canonical };
}
