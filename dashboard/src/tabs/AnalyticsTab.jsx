import { useState, useEffect } from "react"

function aggregateMetrics(metrics) {
  const counts = {}
  metrics.forEach(m => {
    counts[m.tool] = (counts[m.tool] || 0) + 1
  })
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([tool, count]) => ({ tool, count }))
}

function UseRateBar({ rate }) {
  const color = rate >= 70 ? "bg-green-600" : rate >= 40 ? "bg-yellow-600" : "bg-red-700"
  return (
    <div className="flex-1 bg-gray-900 rounded overflow-hidden h-4">
      <div className={`${color} h-full rounded transition-all`} style={{ width: `${rate}%` }} />
    </div>
  )
}

export default function AnalyticsTab({ api }) {
  const [metrics, setMetrics] = useState([])
  const [skillData, setSkillData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`${api}/analytics`).then(r => r.json()).catch(() => ({ metrics: [] })),
      fetch(`${api}/skill-analytics`).then(r => r.json()).catch(() => ({ skills: [], total_events: 0 })),
    ]).then(([analyticsData, skillAnalyticsData]) => {
      setMetrics(analyticsData.metrics || [])
      setSkillData(skillAnalyticsData)
      setLoading(false)
    })
  }, [api])

  const aggregated = aggregateMetrics(metrics)
  const maxCount = aggregated[0]?.count || 1

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-gray-300 font-semibold mb-4">Tool Usage Analytics ({metrics.length} events)</h2>
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : aggregated.length === 0 ? (
          <p className="text-gray-600 text-xs">No analytics data yet. Data collected via .claude/hooks/post-tool-use-metrics.sh</p>
        ) : (
          <div className="space-y-2">
            {aggregated.map(({ tool, count }) => (
              <div key={tool} className="flex items-center gap-3">
                <span className="text-gray-400 w-40 truncate text-xs">{tool}</span>
                <div className="flex-1 bg-gray-900 rounded overflow-hidden h-4">
                  <div
                    className="bg-blue-700 h-full rounded transition-all"
                    style={{ width: `${(count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="text-gray-500 text-xs w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-gray-300 font-semibold mb-1">Skill Effectiveness</h2>
        <p className="text-gray-600 text-xs mb-4">
          Output-used rate: how often a skill&apos;s output led to an Edit/Write vs being replaced by another skill.
          {skillData && skillData.total_events > 0 && ` (${skillData.total_events} events)`}
        </p>
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : !skillData || skillData.skills.length === 0 ? (
          <p className="text-gray-600 text-xs">No skill outcome data yet. Collected via .claude/hooks/skill-outcome-tracker.sh</p>
        ) : (
          <div className="space-y-2">
            {skillData.skills.map(({ skill, used, replaced, total, use_rate }) => (
              <div key={skill} className="flex items-center gap-3">
                <span className="text-gray-400 w-40 truncate text-xs">{skill}</span>
                <UseRateBar rate={use_rate} />
                <span className="text-gray-500 text-xs w-16 text-right">{use_rate}% ({used}/{total})</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
