import { useState, useEffect } from "react"

export default function ToolsTab({ api }) {
  const [data, setData] = useState(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    fetch(`${api}/manifest`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData({ output: "Could not connect to dashboard API", success: false }))
  }, [])

  const handleSync = async (dryRun) => {
    setSyncing(true)
    const result = await fetch(`${api}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dry_run: dryRun })
    }).then(r => r.json()).catch(() => ({ output: "Sync request failed", success: false }))
    setData({ output: result.output, success: result.success })
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
      <pre className="bg-gray-900 rounded p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-96">
        {data ? data.output : "Loading..."}
      </pre>
    </div>
  )
}
