import { useState, useEffect } from "react"
import ResponseContractPanel from "../components/ResponseContractPanel"
import { buildFetchError, getOutcomeContract } from "../lib/dashboardApi"

export default function ConfigTab({ api }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetch(`${api}/contracts/config.summary`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(buildFetchError()))
  }, [api])

  return (
    <div>
      <h2 className="text-gray-300 font-semibold mb-4">Merged Config (global + machine + project)</h2>
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
