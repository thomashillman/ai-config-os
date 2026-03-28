import { useState, useEffect, useCallback } from "react"

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status) {
  const colors = {
    success: "bg-green-900 text-green-300",
    failure: "bg-red-900 text-red-300",
    partial: "bg-yellow-900 text-yellow-300",
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${colors[status] ?? "bg-gray-800 text-gray-400"}`}>
      {status}
    </span>
  )
}

function fmtDate(iso) {
  if (!iso) return "—"
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

function fmtMs(started, finished) {
  if (!started || !finished) return "—"
  const ms = new Date(finished) - new Date(started)
  return isNaN(ms) ? "—" : `${ms} ms`
}

function getSignals(run) {
  if (!run) return null
  const canonicalSignals = run.canonical_v2?.signals
  return {
    attention_required: run.attention_required ?? canonicalSignals?.attention_required ?? false,
    failure_reason_summary: run.failure_reason_summary ?? canonicalSignals?.failure_reason_summary ?? "—",
    next_actions: run.next_actions ?? canonicalSignals?.next_actions ?? [],
    locality: run.locality ?? canonicalSignals?.locality ?? "—",
    capability: run.capability ?? canonicalSignals?.capability ?? "—",
  }
}

function RunSignalsPanel({ run }) {
  const signals = getSignals(run)
  if (!signals) return null
  return (
    <div className="bg-gray-950/70 rounded p-3 space-y-2">
      <p className="text-gray-400 text-xs">
        {signals.attention_required ? "⚠️ Attention required" : "✅ No attention required"}
      </p>
      <p className="text-gray-300 text-xs">{signals.failure_reason_summary}</p>
      <div className="flex flex-wrap gap-2">
        {signals.next_actions.map((action) => (
          <span key={action} className="px-2 py-0.5 rounded text-[11px] bg-gray-800 text-gray-300">{action}</span>
        ))}
      </div>
      <div className="text-[11px] text-gray-500">
        <span className="mr-3">Locality: <span className="text-gray-300 font-mono">{signals.locality}</span></span>
        <span>Capability: <span className="text-gray-300 font-mono">{signals.capability}</span></span>
      </div>
    </div>
  )
}

// ── Latest Run Panel (Atom 9) ─────────────────────────────────────────────────

function LatestRunPanel({ run }) {
  if (!run) return <p className="text-gray-500 text-xs">No bootstrap runs recorded yet.</p>

  return (
    <div className="bg-gray-900 rounded p-4 space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-gray-400 text-xs">Latest run:</span>
        <span className="text-gray-200 text-xs font-mono">{run.run_id}</span>
        {statusBadge(run.status)}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
        <div className="text-gray-500">Started</div>
        <div className="text-gray-300">{fmtDate(run.started_at)}</div>

        <div className="text-gray-500">Duration</div>
        <div className="text-gray-300">{fmtMs(run.started_at, run.finished_at)}</div>

        <div className="text-gray-500">Expected version</div>
        <div className="text-gray-300 font-mono">{run.expected_version ?? "—"}</div>

        <div className="text-gray-500">Observed version</div>
        <div className="text-gray-300 font-mono">{run.observed_version ?? "—"}</div>

        {run.first_failed_phase && (
          <>
            <div className="text-gray-500">First failed phase</div>
            <div className="text-red-400 font-mono">{run.first_failed_phase}</div>
          </>
        )}

        {run.error_code && (
          <>
            <div className="text-gray-500">Error code</div>
            <div className="text-red-400 font-mono">{run.error_code}</div>
          </>
        )}

        <div className="text-gray-500">Phase count</div>
        <div className="text-gray-300">{run.phase_count}</div>
      </div>
      <RunSignalsPanel run={run} />
    </div>
  )
}

// ── Run List Panel ────────────────────────────────────────────────────────────

function RunListPanel({ runs, onSelect }) {
  if (runs.length === 0) return <p className="text-gray-600 text-xs">No runs in history.</p>

  return (
    <div className="space-y-1">
      {runs.map(run => {
        const signals = getSignals(run)
        return (
        <button
          key={run.run_id}
          onClick={() => onSelect(run.run_id)}
          className="w-full text-left bg-gray-900 hover:bg-gray-800 rounded px-3 py-2 flex items-center gap-3 transition-colors"
        >
          <span className="text-gray-500 text-xs font-mono w-52 truncate">{run.run_id}</span>
          {statusBadge(run.status)}
          {signals?.attention_required && <span className="text-yellow-400 text-[11px]">needs attention</span>}
          {signals?.next_actions?.[0] && <span className="text-gray-400 text-[11px] truncate max-w-56">{signals.next_actions[0]}</span>}
          <span className="text-gray-500 text-xs ml-auto">{fmtDate(run.started_at)}</span>
          {run.error_code && (
            <span className="text-red-400 text-xs font-mono">{run.error_code}</span>
          )}
        </button>
        )
      })}
    </div>
  )
}

// ── Run Detail Panel ──────────────────────────────────────────────────────────

function RunDetailPanel({ run, onClose }) {
  if (!run) return null

  return (
    <div className="bg-gray-900 rounded p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-gray-200 text-xs font-mono">{run.run_id}</span>
          {statusBadge(run.status)}
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xs">✕ close</button>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
        <div className="text-gray-500">Started</div>
        <div className="text-gray-300">{fmtDate(run.started_at)}</div>
        <div className="text-gray-500">Finished</div>
        <div className="text-gray-300">{fmtDate(run.finished_at)}</div>
        <div className="text-gray-500">Expected version</div>
        <div className="text-gray-300 font-mono">{run.expected_version ?? "—"}</div>
        <div className="text-gray-500">Observed version</div>
        <div className="text-gray-300 font-mono">{run.observed_version ?? "—"}</div>
        {run.first_failed_phase && <>
          <div className="text-gray-500">First failed phase</div>
          <div className="text-red-400 font-mono">{run.first_failed_phase}</div>
        </>}
        {run.error_code && <>
          <div className="text-gray-500">Error code</div>
          <div className="text-red-400 font-mono">{run.error_code}</div>
        </>}
      </div>
      <RunSignalsPanel run={run} />

      {run.phases && run.phases.length > 0 && (
        <div>
          <p className="text-gray-500 text-xs mb-2">Phases</p>
          <div className="space-y-1">
            {run.phases.map((p, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${p.result === 'ok' ? 'bg-green-500' : p.result === 'error' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                <span className="text-gray-300 font-mono w-48">{p.phase}</span>
                <span className="text-gray-500">{p.duration_ms} ms</span>
                {p.error_code && <span className="text-red-400 font-mono">{p.error_code}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Settings Panel (Atom 8) ───────────────────────────────────────────────────

const SETTINGS_BOUNDS = {
  raw_retention_days: { min: 1, max: 30, label: "Raw retention (days)" },
  summary_retention_days: { min: 7, max: 365, label: "Summary retention (days)" },
  aggregate_retention_days: { min: 30, max: 730, label: "Aggregate retention (days)" },
  max_events_per_run: { min: 1, max: 500, label: "Max events per run" },
  max_message_length: { min: 64, max: 4096, label: "Max message length (chars)" },
}

function SettingsPanel({ workerUrl, token }) {
  const [settings, setSettings] = useState(null)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveOk, setSaveOk] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  const load = useCallback(() => {
    setLoading(true)
    setLoadError(null)
    fetch(`${workerUrl}/v1/observability/settings`, { headers })
      .then(r => r.json())
      .then(d => {
        const s = d.settings ?? {}
        setSettings(s)
        setDraft({ ...s })
        setLoading(false)
      })
      .catch(err => {
        setLoadError(err.message)
        setLoading(false)
      })
  }, [workerUrl, token])

  useEffect(() => { load() }, [load])

  const handleChange = (field, value) => {
    const parsed = parseInt(value, 10)
    setDraft(prev => ({ ...prev, [field]: isNaN(parsed) ? value : parsed }))
    setSaveOk(false)
    setSaveError(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    setSaveOk(false)
    try {
      const resp = await fetch(`${workerUrl}/v1/observability/settings`, {
        method: "PUT",
        headers,
        body: JSON.stringify(draft),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setSaveError(data.details ? data.details.join("; ") : (data.error ?? "Save failed"))
      } else {
        setSettings(data.settings)
        setDraft({ ...data.settings })
        setSaveOk(true)
      }
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-gray-500 text-xs">Loading settings...</p>
  if (loadError) return <p className="text-red-400 text-xs">Failed to load settings: {loadError}</p>
  if (!draft) return null

  return (
    <div className="bg-gray-900 rounded p-4 space-y-4">
      <p className="text-gray-400 text-xs">Retention settings are validated server-side. Changes take effect on the next maintenance run.</p>
      <div className="space-y-3">
        {Object.entries(SETTINGS_BOUNDS).map(([field, { min, max, label }]) => (
          <div key={field} className="flex items-center gap-4">
            <label className="text-gray-400 text-xs w-52">{label}</label>
            <input
              type="number"
              min={min}
              max={max}
              value={draft[field] ?? ""}
              onChange={e => handleChange(field, e.target.value)}
              data-testid={`setting-${field}`}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs w-24 focus:outline-none focus:border-blue-500"
            />
            <span className="text-gray-600 text-xs">{min}–{max}</span>
          </div>
        ))}
      </div>
      {saveError && <p className="text-red-400 text-xs">{saveError}</p>}
      {saveOk && <p className="text-green-400 text-xs">Settings saved.</p>}
      <button
        onClick={handleSave}
        disabled={saving}
        data-testid="save-settings-btn"
        className="px-4 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded text-xs text-white transition-colors"
      >
        {saving ? "Saving..." : "Save settings"}
      </button>
    </div>
  )
}

// ── Main ObservabilityTab ──────────────────────────────────────────────────────

export default function ObservabilityTab({ workerUrl, token }) {
  const [view, setView] = useState("runs") // "runs" | "settings"
  const [runsData, setRunsData] = useState(null)
  const [runsLoading, setRunsLoading] = useState(true)
  const [selectedRunId, setSelectedRunId] = useState(null)
  const [selectedRun, setSelectedRun] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const headers = token ? { Authorization: `Bearer ${token}` } : {}

  const loadRuns = useCallback(() => {
    setRunsLoading(true)
    fetch(`${workerUrl}/v1/observability/runs`, { headers })
      .then(r => r.json())
      .then(d => { setRunsData(d); setRunsLoading(false) })
      .catch(() => setRunsLoading(false))
  }, [workerUrl, token])

  useEffect(() => { loadRuns() }, [loadRuns])

  const handleSelectRun = async (runId) => {
    setSelectedRunId(runId)
    setDetailLoading(true)
    try {
      const resp = await fetch(`${workerUrl}/v1/observability/runs/${runId}`, { headers })
      const data = await resp.json()
      setSelectedRun(data.run ?? null)
    } catch {
      setSelectedRun(null)
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h2 className="text-gray-300 font-semibold">Bootstrap Observability</h2>
        <div className="flex gap-1">
          {[["runs", "Runs"], ["settings", "Retention Settings"]].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`px-3 py-1 rounded text-xs transition-colors ${view === id ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === "runs" && (
        <div className="space-y-4">
          {/* Latest run (Atom 9) */}
          <div>
            <p className="text-gray-500 text-xs mb-2">Latest run</p>
            {runsLoading
              ? <p className="text-gray-500 text-xs">Loading...</p>
              : <LatestRunPanel run={runsData?.latest ?? null} />
            }
          </div>

          {/* Run detail (drill-in) */}
          {selectedRunId && (
            <div>
              <p className="text-gray-500 text-xs mb-2">Run detail</p>
              {detailLoading
                ? <p className="text-gray-500 text-xs">Loading run...</p>
                : <RunDetailPanel run={selectedRun} onClose={() => { setSelectedRunId(null); setSelectedRun(null) }} />
              }
            </div>
          )}

          {/* Recent runs list */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <p className="text-gray-500 text-xs">Recent runs ({runsData?.count ?? 0})</p>
              <button onClick={loadRuns} className="text-gray-600 hover:text-gray-400 text-xs">↺ refresh</button>
            </div>
            {runsLoading
              ? <p className="text-gray-500 text-xs">Loading...</p>
              : <RunListPanel runs={runsData?.runs ?? []} onSelect={handleSelectRun} />
            }
          </div>
        </div>
      )}

      {view === "settings" && (
        <SettingsPanel workerUrl={workerUrl} token={token} />
      )}
    </div>
  )
}
