import { useState, useEffect } from "react"
import ResponseContractPanel from "../components/ResponseContractPanel"
import { getOutcomeContract } from "../lib/dashboardApi"
import { fetchAuditValidateAll, requestAuditValidateAll, isStale } from "../lib/workerContractsClient"

export default function AuditTab({ workerUrl, token }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchAuditValidateAll(workerUrl, token).then(setData)
  }, [workerUrl, token])

  const runAudit = async () => {
    setLoading(true)
    await requestAuditValidateAll(workerUrl, token)
    const fresh = await fetchAuditValidateAll(workerUrl, token)
    setData(fresh)
    setLoading(false)
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-gray-300 font-semibold">Skill Audit</h2>
        {isStale(data) && (
          <span className="px-2 py-0.5 text-xs bg-yellow-900 text-yellow-400 rounded">stale</span>
        )}
        <button
          onClick={runAudit}
          disabled={loading}
          className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50"
        >
          {loading ? "Running..." : "Run Audit"}
        </button>
      </div>
      <ResponseContractPanel data={getOutcomeContract(data)} />
      {data?.summary && (
        <p className="text-gray-500 text-sm mb-3">{data.summary}</p>
      )}
      {data?.data ? (
        <pre className="bg-gray-900 rounded p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-96">
          {JSON.stringify(data.data, null, 2)}
        </pre>
      ) : (
        <p className="text-gray-600 text-xs">
          {data ? "No audit data in snapshot. Click Run Audit to publish a fresh result." : "Loading..."}
        </p>
      )}
    </div>
  )
}
