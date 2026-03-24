/**
 * Pure formatting utilities for task data.
 * No React imports — all functions are plain JS for easy testing.
 */

export function routeLabel(route) {
  if (route === "local_repo") return "Full"
  if (route === "github_pr") return "Cloud · PR"
  return "Cloud"
}

export function stateLabel(state) {
  if (state === "active") return { text: "Active", cls: "text-green-400" }
  if (state === "complete") return { text: "Done", cls: "text-gray-500" }
  if (state === "paused") return { text: "Paused", cls: "text-yellow-400" }
  return { text: state, cls: "text-gray-400" }
}

export async function readErrorMessage(response, fallbackMessage) {
  try {
    const payload = await response.json()
    return payload?.error?.message || payload?.message || fallbackMessage
  } catch {
    return fallbackMessage
  }
}
