import { useState, useEffect } from "react"
import ResponseContractPanel from "../components/ResponseContractPanel"
import { getOutcomeContract } from "../lib/dashboardApi"
import { fetchContextCost, requestContextCostRefresh, isStale } from "../lib/workerContractsClient"

export default function ContextCostTab({ workerUrl, token }) {
  const [data, setData] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchContextCost(workerUrl, token).then(setData)
  }, [workerUrl, token])

  const handleRefresh = async () => {
    setRefreshing(true)
    await requestContextCostRefresh(workerUrl, token)
    const fresh = await fetchContextCost(workerUrl, token)
    setData(fresh)
    setRefreshing(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-gray-300 font-semibold">Context Cost Analysis</h2>
        <div className="flex items-center gap-2">
          {isStale(data) && (
            <span className="px-2 py-0.5 text-xs bg-yellow-900 text-yellow-400 rounded">stale</span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>
      <ResponseContractPanel data={getOutcomeContract(data)} />
      <pre className="bg-gray-900 rounded p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-96">
        {data?.data ? JSON.stringify(data.data, null, 2) : data ? "No context cost data available." : "Loading..."}
      </pre>
    </div>
  )
}
