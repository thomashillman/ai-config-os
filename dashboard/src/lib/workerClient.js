/**
 * Shared Worker URL and auth for dashboard → Worker /v1 calls.
 *
 * Resolution order matches App: window injection (runtime) overrides Vite env.
 */

const DEFAULT_WORKER_HOST = "https://ai-config-os.workers.dev"

/**
 * @returns {string} Base URL with trailing slashes stripped
 */
export function getWorkerBaseUrl() {
  if (typeof window !== "undefined" && window.__AI_CONFIG_WORKER) {
    return String(window.__AI_CONFIG_WORKER).replace(/\/+$/, "")
  }
  const fromEnv = import.meta.env?.VITE_WORKER_URL
  const trimmed = typeof fromEnv === "string" ? fromEnv.trim() : ""
  return trimmed || DEFAULT_WORKER_HOST
}

/**
 * @returns {string} Bearer token without "Bearer " prefix (empty if unset)
 */
export function getWorkerToken() {
  if (typeof window !== "undefined" && window.__AI_CONFIG_TOKEN) {
    return String(window.__AI_CONFIG_TOKEN)
  }
  return import.meta.env?.VITE_AUTH_TOKEN ?? ""
}

/** Snapshot at module load; prefer getWorkerBaseUrl() or props from App when overrides matter. */
export const WORKER_URL = getWorkerBaseUrl()

export function getAuthHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}
