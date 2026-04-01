/**
 * Worker contracts client: authenticated fetch wrapper for dashboard Worker resources.
 *
 * All dashboard tabs should use this module instead of fetching local /api/contracts/* directly.
 * Snapshots are populated by runtime/publish-dashboard-state.mjs.
 */

// Scope is passed as query params so the Worker can look up the correct KV snapshot.
const DEFAULT_SCOPE = typeof window !== "undefined"
  ? (window.__AI_CONFIG_SCOPE ?? {})
  : {}

function scopeParams(overrides = {}) {
  const scope = { ...DEFAULT_SCOPE, ...overrides }
  const params = new URLSearchParams()
  if (scope.repo_id) params.set("repo_id", scope.repo_id)
  if (scope.machine_id) params.set("machine_id", scope.machine_id)
  return params.toString() ? `?${params.toString()}` : ""
}

function buildFreshnessError(message = "Could not reach Worker") {
  return {
    contract_version: "1.0.0",
    resource: "unknown",
    data: null,
    summary: message,
    capability: { worker_backed: true, local_only: false, remote_safe: true, tunnel_required: false, unavailable_on_surface: false },
    suggested_actions: [
      { id: "check_worker", label: "Check Worker connectivity", reason: "Verify the Worker URL and token are correct", runnable_target: null },
    ],
    meta: {
      generated_at: new Date().toISOString(),
      publisher_surface: "client",
      freshness_state: "missing",
      scope: DEFAULT_SCOPE,
    },
    error: { code: "worker_unreachable", message, hint: "Check AI_CONFIG_OS_WORKER_URL and token configuration" },
  }
}

async function workerFetch(workerUrl, token, path, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(`${workerUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    })
    return await res.json()
  } catch (err) {
    return buildFreshnessError(err instanceof Error ? err.message : "Fetch failed")
  } finally {
    clearTimeout(timer)
  }
}

// ── Per-resource fetchers ─────────────────────────────────────────────────────

export function fetchSkillsList(workerUrl, token, scope = {}) {
  return workerFetch(workerUrl, token, `/v1/skills${scopeParams(scope)}`)
}

export function fetchToolingStatus(workerUrl, token, scope = {}) {
  return workerFetch(workerUrl, token, `/v1/tooling/status${scopeParams(scope)}`)
}

export function fetchConfigSummary(workerUrl, token, scope = {}) {
  return workerFetch(workerUrl, token, `/v1/config/summary${scopeParams(scope)}`)
}

export function fetchContextCost(workerUrl, token, scope = {}) {
  return workerFetch(workerUrl, token, `/v1/runtime/context-cost${scopeParams(scope)}`)
}

export function fetchAuditValidateAll(workerUrl, token, scope = {}) {
  return workerFetch(workerUrl, token, `/v1/audit/validate-all${scopeParams(scope)}`)
}

export function fetchAnalyticsToolUsage(workerUrl, token, scope = {}) {
  return workerFetch(workerUrl, token, `/v1/analytics/tool-usage${scopeParams(scope)}`)
}

export function fetchAnalyticsSkillEffectiveness(workerUrl, token, scope = {}) {
  return workerFetch(workerUrl, token, `/v1/analytics/skill-effectiveness${scopeParams(scope)}`)
}

export function fetchAnalyticsAutoresearchRuns(workerUrl, token, scope = {}) {
  return workerFetch(workerUrl, token, `/v1/analytics/autoresearch-runs${scopeParams(scope)}`)
}

export function fetchAnalyticsFrictionSignals(workerUrl, token, scope = {}) {
  return workerFetch(workerUrl, token, `/v1/analytics/friction-signals${scopeParams(scope)}`)
}

export function fetchAnalyticsResourceUse(workerUrl, token, scope = {}) {
  return workerFetch(workerUrl, token, `/v1/analytics/resource-use${scopeParams(scope)}`)
}

// ── Action request helpers ────────────────────────────────────────────────────

export function requestToolingSync(workerUrl, token) {
  return workerFetch(workerUrl, token, "/v1/tooling/sync-request", { method: "POST", body: "{}" })
}

export function requestAuditValidateAll(workerUrl, token) {
  return workerFetch(workerUrl, token, "/v1/audit/validate-all/request", { method: "POST", body: "{}" })
}

export function requestContextCostRefresh(workerUrl, token) {
  return workerFetch(workerUrl, token, "/v1/runtime/context-cost/request", { method: "POST", body: "{}" })
}

// ── Freshness helpers ─────────────────────────────────────────────────────────

export function getFreshnessState(envelope) {
  return envelope?.meta?.freshness_state ?? null
}

export function isStale(envelope) {
  const state = getFreshnessState(envelope)
  return state === "stale" || state === "missing"
}
