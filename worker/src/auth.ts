import type { Env } from "./types";

export function isAuthorized(request: Request, env: Env): boolean {
  const authHeader = request.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return false;

  const token = authHeader.slice(7).trim();
  if (!token) return false;
  if (token === env.AUTH_TOKEN) return true;
  if (env.AUTH_TOKEN_NEXT && token === env.AUTH_TOKEN_NEXT) return true;
  return false;
}

export function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({
      error: "Unauthorized",
      hint: "Provide a valid Bearer token",
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": 'Bearer realm="ai-config-os"',
      },
    },
  );
}
