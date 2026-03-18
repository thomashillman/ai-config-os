import type { JsonReadResult } from './types';

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Versioned cached response for immutable resources.
 * Resources with the same version hash are cached forever.
 * @param data - JSON payload
 * @param version - Version string used as immutable cache key
 */
export function versionedCachedResponse(data: unknown, version: string): Response {
  const etag = `"${version}"`;
  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': etag,
      'Vary': 'Accept-Encoding',
    },
  });
}

export function notFound(message: string): Response {
  return jsonResponse({ error: 'Not Found', message }, 404);
}

export function badRequest(message: string): Response {
  return jsonResponse({ error: { code: 'bad_request', message } }, 400);
}

export async function readJsonBody(request: Request): Promise<JsonReadResult> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, response: badRequest('Invalid JSON body') };
  }
}
