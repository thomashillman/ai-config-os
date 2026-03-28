import { useState, useEffect } from "react"
import ResponseContractPanel from "../components/ResponseContractPanel"
import { getOutcomeContract } from "../lib/dashboardApi"
import { fetchToolingStatus, requestToolingSync, isStale } from "../lib/workerContractsClient"

export default function ToolsTab({ workerUrl, token }) {
  const [data, setData] = useState(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    fetchToolingStatus(workerUrl, token).then(setData)
  }, [workerUrl, token])

  const handleSync = async () => {
    setSyncing(true)
    await requestToolingSync(workerUrl, token)
    const fresh = await fetchToolingStatus(workerUrl, token)
    setData(fresh)
    setSyncing(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-gray-300 font-semibold">Tool Status</h2>
        <div className="flex gap-2">
          {isStale(data) && (
            <span className="px-2 py-0.5 text-xs bg-yellow-900 text-yellow-400 rounded">stale</span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-3 py-1 text-xs bg-blue-700 hover:bg-blue-600 rounded disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
        </div>
      </div>
      <ResponseContractPanel data={getOutcomeContract(data)} />
      {data?.summary && (
        <p className="text-gray-500 text-sm mb-3">{data.summary}</p>
      )}
      <pre className="bg-gray-900 rounded p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-96">
        {data?.data ? JSON.stringify(data.data, null, 2) : data ? "No tool data available." : "Loading..."}
      </pre>
    </div>
  )
}
