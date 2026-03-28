import { useState, useEffect } from "react"
import ResponseContractPanel from "../components/ResponseContractPanel"
import { buildFetchError, getOutcomeContract } from "../lib/dashboardApi"

export default function ToolsTab({ api }) {
  const [data, setData] = useState(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    fetch(`${api}/contracts/tooling.status`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(buildFetchError()))
  }, [api])

  const handleSync = async (dryRun) => {
    setSyncing(true)
    const result = await fetch(`${api}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dry_run: dryRun })
    }).then(r => r.json()).catch(() => buildFetchError("Sync request failed"))
    setData(result)
    setSyncing(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-gray-300 font-semibold">Tool Status</h2>
        <div className="flex gap-2">
          <button
            onClick={() => handleSync(true)}
            disabled={syncing}
            className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50"
          >
            Dry Run
          </button>
          <button
            onClick={() => handleSync(false)}
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
