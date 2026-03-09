import { useState } from "react"
import ResponseContractPanel from "../components/ResponseContractPanel"

export default function AuditTab({ api }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const runAudit = async () => {
    setLoading(true)
    const result = await fetch(`${api}/validate-all`)
      .then(r => r.json())
      .catch(() => ({ output: "Audit request failed", success: false, status: "Degraded" }))
    setData(result)
    setLoading(false)
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-gray-300 font-semibold">Skill Audit</h2>
        <button
          onClick={runAudit}
          disabled={loading}
          className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50"
        >
          {loading ? "Running..." : "Run Audit"}
        </button>
      </div>
      <ResponseContractPanel data={data} />
      {data ? (
        <pre className="bg-gray-900 rounded p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-96">
          {data.output}
        </pre>
      ) : (
        <p className="text-gray-600 text-xs">Click Run Audit to validate all skills and config</p>
      )}
    </div>
  )
}
