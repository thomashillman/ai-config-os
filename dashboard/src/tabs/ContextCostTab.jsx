import { useState, useEffect } from "react"
import ResponseContractPanel from "../components/ResponseContractPanel"
import { buildFetchError, getOutcomeContract } from "../lib/dashboardApi"

export default function ContextCostTab({ api }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetch(`${api}/context-cost`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(buildFetchError()))
  }, [api])

  return (
    <div>
      <h2 className="text-gray-300 font-semibold mb-4">Context Cost Analysis</h2>
      <ResponseContractPanel data={getOutcomeContract(data)} />
      <pre className="bg-gray-900 rounded p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-96">
        {data ? data.output : "Loading..."}
      </pre>
    </div>
  )
}
