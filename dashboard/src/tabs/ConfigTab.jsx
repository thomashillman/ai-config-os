import { useState, useEffect } from "react"
import ResponseContractPanel from "../components/ResponseContractPanel"
import { getOutcomeContract } from "../lib/dashboardApi"
import { fetchConfigSummary, isStale } from "../lib/workerContractsClient"

export default function ConfigTab({ workerUrl, token }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetchConfigSummary(workerUrl, token).then(setData)
  }, [workerUrl, token])

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-gray-300 font-semibold">Merged Config (global + machine + project)</h2>
        {isStale(data) && (
          <span className="px-2 py-0.5 text-xs bg-yellow-900 text-yellow-400 rounded">stale</span>
        )}
      </div>
      <ResponseContractPanel data={getOutcomeContract(data)} />
      {data?.summary && (
        <p className="text-gray-500 text-sm mb-3">{data.summary}</p>
      )}
      <pre className="bg-gray-900 rounded p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-96">
        {data?.data ? JSON.stringify(data.data, null, 2) : data ? "No config data available." : "Loading..."}
      </pre>
    </div>
  )
}
