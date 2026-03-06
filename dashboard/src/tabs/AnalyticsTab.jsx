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

export default function AnalyticsTab({ api }) {
  const [metrics, setMetrics] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${api}/analytics`)
      .then(r => r.json())
      .then(d => {
        setMetrics(d.metrics || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const aggregated = aggregateMetrics(metrics)
  const maxCount = aggregated[0]?.count || 1

  return (
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
  )
}
