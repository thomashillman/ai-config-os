/**
 * Shared Worker URL and auth header helper.
 * Centralises the WORKER_URL constant that was duplicated across multiple components.
 */

export const WORKER_URL = (typeof import.meta !== "undefined" && import.meta.env?.VITE_WORKER_URL)
  || "https://ai-config-os.workers.dev"

export function getAuthHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}
