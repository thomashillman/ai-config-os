import type { Env } from "./types";
import type { AuthenticatedRequest } from "./task-mutation-context";

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

/**
 * Derive authenticated principal from request
 * In single-user deployment, resolves to default owner principal
 * Multi-user implementations can extract from JWT or request headers
 */
export function deriveAuthenticatedRequest(
  request: Request,
): AuthenticatedRequest {
  // Single-user deployment: default to owner principal
  // Future: extract principal_id from JWT claims or request headers
  return {
    principal_id: "owner",
    principal_type: "user",
    workspace_id: "default",
    // repo_id: optional, from request headers or JWT
  };
}
