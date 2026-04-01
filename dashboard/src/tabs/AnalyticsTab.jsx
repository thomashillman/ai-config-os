import { useState, useEffect, useCallback } from "react"
import {
  fetchAnalyticsToolUsage,
  fetchAnalyticsResourceUse,
  fetchAnalyticsSkillEffectiveness,
  fetchAnalyticsAutoresearchRuns,
  fetchAnalyticsFrictionSignals,
  isStale,
} from "../lib/workerContractsClient"

// -- Data helpers --------------------------------------------------------------

function useRateColor(rate) {
  if (rate >= 70) return "bg-green-600"
  if (rate >= 40) return "bg-yellow-600"
  return "bg-red-700"
}

function useRateLabel(rate) {
  if (rate >= 70) return "text-green-400"
  if (rate >= 40) return "text-yellow-400"
  return "text-red-400"
}

function scoreDeltaLabel(improved_by) {
  if (improved_by === null) return null
  if (improved_by > 0) return `+${improved_by}pp`
  if (improved_by === 0) return "flat"
  return `${improved_by}pp`
}

// -- Shared primitives --------------------------------------------------------─

function SectionHeader({ title, subtitle, count }) {
  return (
    <div className="mb-3">
      <h2 className="text-gray-300 font-semibold text-sm">
        {title}
        {count != null && <span className="text-gray-600 font-normal ml-1.5">({count})</span>}
      </h2>
      {subtitle && <p className="text-gray-600 text-xs mt-0.5">{subtitle}</p>}
    </div>
  )
}

function EmptyState({ message, hint }) {
  return (
    <div className="border border-gray-800 rounded-lg p-5 text-center space-y-1">
      <p className="text-gray-500 text-xs">{message}</p>
      {hint && <p className="text-gray-700 text-xs">{hint}</p>}
    </div>
  )
}

function SectionSkeleton({ rows = 4 }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="bg-gray-800 rounded h-3 w-32" />
          <div className="flex-1 bg-gray-800 rounded h-4" style={{ opacity: 0.5 + i * 0.1 }} />
          <div className="bg-gray-800 rounded h-3 w-12" />
        </div>
      ))}
    </div>
  )
}

function RefreshBar({ lastFetched, onRefresh, stale }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <span className="text-gray-700 text-xs flex items-center gap-2">
        {lastFetched ? `Updated ${lastFetched}` : ""}
        {stale && <span className="px-2 py-0.5 text-xs bg-yellow-900 text-yellow-400 rounded">stale</span>}
      </span>
      <button
        onClick={onRefresh}
        className="text-gray-600 hover:text-gray-400 text-xs transition-colors"
        title="Refresh all sections"
      >
        Refresh
      </button>
    </div>
  )
}

// -- Resource use (execution policy telemetry) --------------------------------

const RESOURCE_MODES = [
  { id: "all", label: "All" },
  { id: "subscription", label: "Subscription" },
  { id: "api_key", label: "API key" },
  { id: "hybrid", label: "Hybrid" },
]

function ResourceUseSection({ contract, loading, modeFilter, onModeChange }) {
  const interpretation = contract?.interpretation || {}
  const byMode = contract?.by_mode || {}
  const total = contract?.total_events ?? 0
  const modesToShow =
    modeFilter === "all"
      ? ["subscription", "api_key", "hybrid"]
      : [modeFilter]

  return (
    <div>
      <SectionHeader
        title="Resource Use"
        count={total > 0 ? `${total} events` : null}
        subtitle={interpretation.why_it_matters_now || "Execution policy telemetry: pressure vs spend by billing mode."}
      />
      <div className="flex flex-wrap gap-1.5 mb-3">
        {RESOURCE_MODES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onModeChange(id)}
            className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
              modeFilter === id
                ? "border-violet-500 bg-violet-950/50 text-violet-200"
                : "border-gray-800 text-gray-500 hover:text-gray-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {loading ? (
        <SectionSkeleton rows={3} />
      ) : total === 0 ? (
        <EmptyState
          message="No resource telemetry yet."
          hint="When the policy stack emits events, they aggregate here (subscription pressure vs API spend)."
        />
      ) : (
        <div className="space-y-2 text-xs">
          {modesToShow.map((key) => {
            const row = byMode[key] || {}
            return (
              <div
                key={key}
                className="border border-gray-800 rounded-lg p-3 space-y-1.5"
              >
                <div className="text-gray-400 font-medium capitalize">{key.replace("_", " ")}</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-500">
                  <span>Events</span>
                  <span className="text-gray-300 text-right">{row.count ?? 0}</span>
                  {(key === "subscription" || key === "hybrid") && (
                    <>
                      <span>Avg pressure</span>
                      <span className="text-gray-300 text-right">
                        {row.avg_pressure_score != null ? row.avg_pressure_score : "—"}
                      </span>
                    </>
                  )}
                  {(key === "api_key" || key === "hybrid") && (
                    <>
                      <span>Est. cost (minor)</span>
                      <span className="text-gray-300 text-right">
                        {row.total_estimated_cost_minor != null ? row.total_estimated_cost_minor : "—"}
                      </span>
                    </>
                  )}
                  <span>Avg packed tokens</span>
                  <span className="text-gray-300 text-right">
                    {row.avg_packed_context_tokens != null ? row.avg_packed_context_tokens : "—"}
                  </span>
                  <span>Throttle signals</span>
                  <span className="text-gray-300 text-right">{row.throttle_events ?? 0}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// -- Tool usage section --------------------------------------------------------

function ToolUsageSection({ contract, loading }) {
  const tools = contract?.tools || []
  const interpretation = contract?.interpretation || {}
  const maxCount = tools[0]?.count || 1

  return (
    <div>
      <SectionHeader
        title="Tool Usage"
        count={contract?.total_events > 0 ? `${contract.total_events} events` : null}
        subtitle={interpretation.why_it_matters_now || "Invocations per tool this session"}
      />
      {loading ? (
        <SectionSkeleton rows={5} />
) : tools.length === 0 ? (
        <EmptyState
          message="No tool usage data yet."
          hint="Collected via .claude/hooks/post-tool-use-metrics.sh"
        />
      ) : (
        <div className="space-y-2">
          {tools.map(({ tool, count }) => (
            <div key={tool} className="flex items-center gap-3">
              <span className="text-gray-400 w-36 truncate text-xs" title={tool}>{tool}</span>
              <div className="flex-1 bg-gray-900 rounded overflow-hidden h-3">
                <div
                  className="bg-blue-700 h-full rounded transition-all duration-300"
                  style={{ width: `${(count / maxCount) * 100}%` }}
                />
              </div>
              <span className="text-gray-600 text-xs w-6 text-right">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// -- Skill effectiveness section ----------------------------------------------─

function SkillEffectivenessSection({ contract, loading }) {
  const skills = contract?.skills || []
  const interpretation = contract?.interpretation || {}

  return (
    <div>
      <SectionHeader
        title="Skill Effectiveness"
        count={contract?.total_events > 0 ? `${contract.total_events} events` : null}
        subtitle={interpretation.why_it_matters_now || "Output-used rate: how often a skill's output led to an Edit/Write vs being replaced."}
      />
      {loading ? (
        <SectionSkeleton rows={4} />
      ) : skills.length === 0 ? (
        <EmptyState
          message="No skill outcome data yet."
          hint="Run /autoresearch to start optimising skills once data accumulates."
        />
      ) : (
        <div className="space-y-2">
          {skills.map(({ skill, used, replaced, total, use_rate }) => (
            <div key={skill} className="flex items-center gap-3 group">
              <span
                className="text-gray-400 w-36 truncate text-xs"
                title={skill}
              >
                {skill}
              </span>
              <div className="flex-1 bg-gray-900 rounded overflow-hidden h-3">
                <div
                  className={`${useRateColor(use_rate)} h-full rounded transition-all duration-300`}
                  style={{ width: `${use_rate}%` }}
                />
              </div>
              <span className={`text-xs w-20 text-right ${useRateLabel(use_rate)}`}>
                {use_rate}%
                <span className="text-gray-700 ml-1">({used}/{total})</span>
              </span>
              {use_rate < 50 && (
                <span
                  className="text-gray-700 text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                  title={`Run /autoresearch on ${skill} to improve its output-used rate`}
                >
                  {"-> /autoresearch"}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// -- Autoresearch runs section ------------------------------------------------─

function StatusBadge({ status }) {
  const cls = status === "complete"
    ? "bg-green-900/50 text-green-400 border-green-800"
    : status === "running"
    ? "bg-blue-900/50 text-blue-400 border-blue-800"
    : "bg-gray-800 text-gray-500 border-gray-700"
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${cls}`}>
      {status}
    </span>
  )
}

// 3-segment when control is available: control/no-skill (amber) | skill baseline gain (grey) | experiment gain (green).
// Edge cases: if control >= baseline the grey segment is 0 (skill didn't help over no-skill).
//             if control >= best  all three gains are 0 (skill strictly worse than no-skill).
// 2-segment fallback when control is absent: baseline (grey) | gain (green).
function ScoreBar({ control, baseline, best }) {
  if (baseline == null || best == null) return <div className="flex-1 bg-gray-900 rounded h-3" />

  if (control != null) {
    const controlWidth    = Math.min(100, control)
    const baselineWidth   = Math.max(0, Math.min(100 - controlWidth, baseline - control))
    const gainWidth       = Math.max(0, Math.min(100 - controlWidth - baselineWidth, best - baseline))
    return (
      <div className="flex-1 bg-gray-900 rounded overflow-hidden h-3 flex">
        <div className="bg-amber-600 h-full" style={{ width: `${controlWidth}%` }}  title={`No-skill control: ${control}%`} />
        <div className="bg-gray-500 h-full" style={{ width: `${baselineWidth}%` }} title={`Skill baseline gain: +${Math.round(baseline - control)}pp`} />
        <div className="bg-green-600 h-full" style={{ width: `${gainWidth}%` }}    title={`Experiment gain: +${Math.round(best - baseline)}pp`} />
      </div>
    )
  }

  const baselineWidth = Math.min(100, baseline)
  const gainWidth     = Math.max(0, Math.min(100 - baselineWidth, best - baseline))
  return (
    <div className="flex-1 bg-gray-900 rounded overflow-hidden h-3 flex">
      <div className="bg-gray-700 h-full" style={{ width: `${baselineWidth}%` }} title={`Baseline: ${baseline}%`} />
      <div className="bg-green-600 h-full" style={{ width: `${gainWidth}%` }}    title={`Gain: +${Math.round(best - baseline)}pp`} />
    </div>
  )
}

function AutoresearchSection({ contract, loading }) {
  const runs = contract?.runs || []
  const interpretation = contract?.interpretation || {}
  return (
    <div>
      <SectionHeader
        title="Autoresearch Runs"
        count={runs.length > 0 ? runs.length : null}
        subtitle={interpretation.why_it_matters_now || "Autonomous skill optimisation — control (amber) + skill gain (grey) + experiment gain (green)."}
      />
      {loading ? (
        <SectionSkeleton rows={3} />
      ) : runs.length === 0 ? (
        <EmptyState
          message="No autoresearch runs found."
          hint="Run /autoresearch on a skill to start an optimisation loop."
        />
      ) : (
        <div className="space-y-2">
          {runs.map(run => {
            const delta = scoreDeltaLabel(run.improved_by)
            return (
              <div key={`${run.skill}-${run.run_dir}`} className="flex items-center gap-3">
                <span className="text-gray-400 w-36 truncate text-xs" title={run.skill}>
                  {run.skill}
                </span>
                <ScoreBar control={run.control_score} baseline={run.baseline_score} best={run.best_score} />
                <div className="flex items-center gap-1.5 w-28 justify-end">
                  {delta && (
                    <span className={`text-xs ${run.improved_by > 0 ? "text-green-400" : "text-gray-500"}`}>
                      {delta}
                    </span>
                  )}
                  <StatusBadge status={run.status} />
                  <span className="text-gray-700 text-xs">{run.experiment_count}x</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// -- Friction signals section -------------------------------------------------

function FrictionSignalsSection({ contract, loading }) {
  const artifactCount = contract?.artifact_count || 0
  const signalBreakdown = contract?.signal_breakdown || {}
  const topRecommendations = contract?.top_recommendations || []
  const interpretation = contract?.interpretation || {}

  const signalEntries = Object.entries(signalBreakdown).sort((a, b) => b[1] - a[1])
  const maxCount = signalEntries[0]?.[1] || 1

  return (
    <div>
      <SectionHeader
        title="Friction Signals"
        count={artifactCount > 0 ? `${artifactCount} retros` : null}
        subtitle={interpretation.why_it_matters_now || "Signal types observed across merged PRs. Populated by /post-merge-retrospective."}
      />
      {loading ? (
        <SectionSkeleton rows={3} />
      ) : artifactCount === 0 ? (
        <EmptyState
          message="No retrospective data yet."
          hint="Run /post-merge-retrospective after merging a PR to start populating."
        />
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {signalEntries.map(([type, count]) => (
              <div key={type} className="flex items-center gap-3">
                <span className="text-gray-400 w-36 truncate text-xs" title={type}>{type}</span>
                <div className="flex-1 bg-gray-900 rounded overflow-hidden h-3">
                  <div
                    className="bg-orange-700 h-full rounded transition-all duration-300"
                    style={{ width: `${(count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="text-gray-600 text-xs w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
          {topRecommendations.length > 0 && (
            <div>
              <p className="text-gray-600 text-xs mb-2">Top skill recommendations</p>
              <div className="space-y-1">
                {topRecommendations.slice(0, 5).map(rec => (
                  <div key={rec.name} className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs w-36 truncate" title={rec.name}>{rec.name}</span>
                    <span className="text-gray-700 text-[10px] px-1 py-0.5 bg-gray-900 rounded">{rec.category}</span>
                    <span className="text-gray-600 text-xs ml-auto">{rec.occurrences}x</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// -- Root tab ------------------------------------------------------------------

export default function AnalyticsTab({ workerUrl, token }) {
  const [resourceUse, setResourceUse] = useState(null)
  const [resourceModeFilter, setResourceModeFilter] = useState("all")
  const [toolUsage, setToolUsage] = useState(null)
  const [skillEffectiveness, setSkillEffectiveness] = useState(null)
  const [autoresearchRuns, setAutoresearchRuns] = useState(null)
  const [frictionSignals, setFrictionSignals] = useState(null)
  const [loading, setLoading] = useState({ resource: true, tools: true, skills: true, autoresearch: true, retro: true })
  const [lastFetched, setLastFetched] = useState(null)
  const [anyStale, setAnyStale] = useState(false)

  const fetchAll = useCallback(() => {
    setLoading({ resource: true, tools: true, skills: true, autoresearch: true, retro: true })

    const p0 = fetchAnalyticsResourceUse(workerUrl, token)
      .then(envelope => {
        if (envelope?.data && typeof envelope.data === "object") { setResourceUse(envelope.data); return envelope }
      })
      .catch(() => undefined)
      .finally(() => setLoading(prev => ({ ...prev, resource: false })))

    const p1 = fetchAnalyticsToolUsage(workerUrl, token)
      .then(envelope => {
        if (envelope?.data && typeof envelope.data === 'object') { setToolUsage(envelope.data); return envelope }
      })
      .catch(() => undefined)
      .finally(() => setLoading(prev => ({ ...prev, tools: false })))

    const p2 = fetchAnalyticsSkillEffectiveness(workerUrl, token)
      .then(envelope => {
        if (envelope?.data && typeof envelope.data === 'object') { setSkillEffectiveness(envelope.data); return envelope }
      })
      .catch(() => undefined)
      .finally(() => setLoading(prev => ({ ...prev, skills: false })))

    const p3 = fetchAnalyticsAutoresearchRuns(workerUrl, token)
      .then(envelope => {
        if (envelope?.data && typeof envelope.data === 'object') { setAutoresearchRuns(envelope.data); return envelope }
      })
      .catch(() => undefined)
      .finally(() => setLoading(prev => ({ ...prev, autoresearch: false })))

    const p4 = fetchAnalyticsFrictionSignals(workerUrl, token)
      .then(envelope => {
        if (envelope?.data && typeof envelope.data === 'object') { setFrictionSignals(envelope.data); return envelope }
      })
      .catch(() => undefined)
      .finally(() => setLoading(prev => ({ ...prev, retro: false })))

    Promise.allSettled([p0, p1, p2, p3, p4])
      .then(results => {
        const envelopes = results.map(r => r.value).filter(Boolean)
        if (envelopes.length > 0) setLastFetched(new Date().toLocaleTimeString())
        setAnyStale(envelopes.some(e => isStale(e)))
      })
  }, [workerUrl, token])

  useEffect(() => { fetchAll() }, [fetchAll])

  return (
    <div className="max-w-2xl space-y-8">
      <RefreshBar lastFetched={lastFetched} onRefresh={fetchAll} stale={anyStale} />
      <ResourceUseSection
        contract={resourceUse}
        loading={loading.resource}
        modeFilter={resourceModeFilter}
        onModeChange={setResourceModeFilter}
      />
      <ToolUsageSection contract={toolUsage} loading={loading.tools} />
      <SkillEffectivenessSection contract={skillEffectiveness} loading={loading.skills} />
      <AutoresearchSection contract={autoresearchRuns} loading={loading.autoresearch} />
      <FrictionSignalsSection contract={frictionSignals} loading={loading.retro} />
    </div>
  )
}
