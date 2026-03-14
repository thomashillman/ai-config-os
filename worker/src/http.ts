import type { JsonReadResult } from './types';

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
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
