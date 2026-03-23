import { useState, useEffect, useCallback } from "react"

// -- Network helpers -----------------------------------------------------------

// Returns a promise that resolves to parsed JSON or rejects on HTTP error / timeout.
function fetchJson(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  return fetch(url, { signal: controller.signal })
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    .finally(() => clearTimeout(timer))
}

// -- Data helpers --------------------------------------------------------------

function aggregateMetrics(metrics) {
  const counts = {}
  metrics.forEach(m => { counts[m.tool] = (counts[m.tool] || 0) + 1 })
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([tool, count]) => ({ tool, count }))
}

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

function RefreshBar({ lastFetched, onRefresh }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <span className="text-gray-700 text-xs">
        {lastFetched ? `Updated ${lastFetched}` : ""}
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

// -- Tool usage section --------------------------------------------------------

function ToolUsageSection({ metrics, loading }) {
  const aggregated = aggregateMetrics(metrics)
  const maxCount = aggregated[0]?.count || 1

  return (
    <div>
      <SectionHeader
        title="Tool Usage"
        count={metrics.length > 0 ? `${metrics.length} events` : null}
        subtitle="Invocations per tool this session"
      />
      {loading ? (
        <SectionSkeleton rows={5} />
      ) : aggregated.length === 0 ? (
        <EmptyState
          message="No tool usage data yet."
          hint="Collected via .claude/hooks/post-tool-use-metrics.sh"
        />
      ) : (
        <div className="space-y-2">
          {aggregated.map(({ tool, count }) => (
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

function SkillEffectivenessSection({ skillData, loading }) {
  const skills = skillData?.skills || []

  return (
    <div>
      <SectionHeader
        title="Skill Effectiveness"
        count={skillData?.total_events > 0 ? `${skillData.total_events} events` : null}
        subtitle="Output-used rate: how often a skill's output led to an Edit/Write vs being replaced."
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
                  -> /autoresearch
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

function AutoresearchSection({ runs, loading }) {
  return (
    <div>
      <SectionHeader
        title="Autoresearch Runs"
        count={runs.length > 0 ? runs.length : null}
        subtitle="Autonomous skill optimisation — control (amber) + skill gain (grey) + experiment gain (green)."
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

// -- Root tab ------------------------------------------------------------------

export default function AnalyticsTab({ api }) {
  const [metrics, setMetrics] = useState([])
  const [skillData, setSkillData] = useState(null)
  const [arRuns, setArRuns] = useState([])
  const [loading, setLoading] = useState({ tools: true, skills: true, autoresearch: true })
  const [lastFetched, setLastFetched] = useState(null)

  const fetchAll = useCallback(() => {
    setLoading({ tools: true, skills: true, autoresearch: true })

    // Each chain returns true on success and undefined on failure; .finally() passes
    // through that value so allSettled results carry it — no mutable closure needed.
    const p1 = fetchJson(`${api}/analytics`)
      .then(d => { if (Array.isArray(d.metrics)) { setMetrics(d.metrics); return true } })
      .catch(() => undefined)
      .finally(() => setLoading(prev => ({ ...prev, tools: false })))

    const p2 = fetchJson(`${api}/skill-analytics`)
      .then(d => { if (d && typeof d === 'object') { setSkillData(d); return true } })
      .catch(() => undefined)
      .finally(() => setLoading(prev => ({ ...prev, skills: false })))

    const p3 = fetchJson(`${api}/autoresearch-runs`)
      .then(d => { if (Array.isArray(d.runs)) { setArRuns(d.runs); return true } })
      .catch(() => undefined)
      .finally(() => setLoading(prev => ({ ...prev, autoresearch: false })))

    Promise.allSettled([p1, p2, p3])
      .then(results => {
        if (results.some(r => r.value === true)) setLastFetched(new Date().toLocaleTimeString())
      })
  }, [api])

  useEffect(() => { fetchAll() }, [fetchAll])

  return (
    <div className="max-w-2xl space-y-8">
      <RefreshBar lastFetched={lastFetched} onRefresh={fetchAll} />
      <ToolUsageSection metrics={metrics} loading={loading.tools} />
      <SkillEffectivenessSection skillData={skillData} loading={loading.skills} />
      <AutoresearchSection runs={arRuns} loading={loading.autoresearch} />
    </div>
  )
}
