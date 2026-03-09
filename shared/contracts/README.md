# Request Signing Contract

This package defines the canonical request-signing contract used by both executor ingress and worker ingress.

## Canonical input (v1)

Sign this exact newline-delimited string:

1. HTTP method (uppercased)
2. Request path (no scheme/host/query)
3. `X-AIOS-Timestamp` (epoch milliseconds)
4. `X-AIOS-Nonce` (unique per request)
5. `X-AIOS-Body-SHA256` (lowercase hex SHA-256 of raw body)

## Required headers

- `X-AIOS-Timestamp`
- `X-AIOS-Nonce`
- `X-AIOS-Body-SHA256`
- `X-AIOS-Signature`

`X-AIOS-Signature` format: `v1=<hex-hmac>`.

## Algorithm

- Version: `v1`
- Signature algorithm: `HMAC-SHA256`
- Body hash algorithm: `SHA-256`

## Failure semantics

Structured errors are returned as JSON with this shape:

```json
{
  "error": {
    "status": 401,
    "code": "invalid_signature",
    "message": "Signature verification failed",
    "details": {}
  }
}
```

### Status mapping

- `401`: malformed/missing headers, missing secret, body-hash mismatch, invalid signature.
- `403`: stale timestamp, replayed nonce.

## Clock skew tolerance

Default tolerance is ±5 minutes (`300000` ms). Requests outside this window fail with `403 stale_timestamp`.

## Nonce replay protection

A nonce can be consumed once during the accepted window. Reuse inside the window fails with `403 replayed_nonce`.
