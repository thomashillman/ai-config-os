import type { JsonReadResult } from "./types";
import type { CapabilityError } from "./types/capabilities";

// ─── CORS ─────────────────────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, X-Request-Signature",
  "Access-Control-Max-Age": "86400",
};

/** Apply CORS headers to any Response. Used for capability endpoints. */
export function withCors(response: Response): Response {
  const next = new Response(response.body, response);
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    next.headers.set(k, v);
  }
  return next;
}

export function corsPreflightResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// ─── JSON helpers ─────────────────────────────────────────────────────────────

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Versioned cached response for immutable resources.
 * Resources with the same version hash are cached forever.
 * CORS headers are included so browsers can read these responses.
 * @param data - JSON payload
 * @param version - Version string used as immutable cache key
 */
export function versionedCachedResponse(
  data: unknown,
  version: string,
): Response {
  const etag = `"${version}"`;
  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: etag,
      Vary: "Accept-Encoding",
      ...CORS_HEADERS,
    },
  });
}

/**
 * Structured error response for capability endpoints.
 * Always includes CORS headers so browser clients can read error details.
 */
export function errorResponse(
  error: CapabilityError,
  status: number,
): Response {
  return new Response(JSON.stringify({ error }, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

// ─── Legacy helpers ───────────────────────────────────────────────────────────

export function notFound(message: string): Response {
  return jsonResponse({ error: "Not Found", message }, 404);
}

export function badRequest(message: string): Response {
  return jsonResponse({ error: { code: "bad_request", message } }, 400);
}

export async function readJsonBody(request: Request): Promise<JsonReadResult> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, response: badRequest("Invalid JSON body") };
  }
}
