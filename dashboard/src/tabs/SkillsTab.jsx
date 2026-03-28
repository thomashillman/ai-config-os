import { useState, useEffect } from "react"
import ResponseContractPanel from "../components/ResponseContractPanel"
import { getOutcomeContract } from "../lib/dashboardApi"
import { fetchSkillsList, isStale } from "../lib/workerContractsClient"

const CHECKMARK = "\u2713"

const statusColour = (s) =>
  s === "stable" ? "text-green-400" : s === "experimental" ? "text-yellow-400" : "text-gray-500"

export default function SkillsTab({ workerUrl, token }) {
  const [skills, setSkills] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSkillsList(workerUrl, token)
      .then(payload => {
        setData(payload)
        setSkills(Array.isArray(payload.data?.skills) ? payload.data.skills : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [workerUrl, token])

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-gray-300 font-semibold">Skill Library ({skills.length} skills)</h2>
        {isStale(data) && (
          <span className="px-2 py-0.5 text-xs bg-yellow-900 text-yellow-400 rounded">stale</span>
        )}
      </div>
      <p className="text-gray-600 text-xs mb-4">{data?.meta?.interpretation?.why_it_matters_now || data?.data?.interpretation?.why_it_matters_now || data?.summary || "Current skill inventory and readiness."}</p>
      <ResponseContractPanel data={getOutcomeContract(data)} />
      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="text-left py-2 pr-4">Skill</th>
                <th className="text-left py-2 pr-4">Type</th>
                <th className="text-left py-2 pr-4">Status</th>
                <th className="text-center py-2 px-2">Opus</th>
                <th className="text-center py-2 px-2">Sonnet</th>
                <th className="text-center py-2 px-2">Haiku</th>
                <th className="text-center py-2 px-2">Tests</th>
              </tr>
            </thead>
            <tbody>
              {skills.map(s => (
                <tr
                  key={s.name}
                  data-testid={`skill-row-${s.name}`}
                  className="border-b border-gray-900 hover:bg-gray-900 transition-colors"
                >
                  <td className="py-2 pr-4 text-gray-200">{s.name}</td>
                  <td className="py-2 pr-4 text-gray-400">{s.type}</td>
                  <td className={`py-2 pr-4 ${statusColour(s.status)}`}>{s.status}</td>
                  <td className="py-2 px-2 text-center">{s.opus ? CHECKMARK : <span className="text-gray-700">-</span>}</td>
                  <td className="py-2 px-2 text-center">{s.sonnet ? CHECKMARK : <span className="text-gray-700">-</span>}</td>
                  <td className="py-2 px-2 text-center">{s.haiku ? CHECKMARK : <span className="text-gray-700">-</span>}</td>
                  <td className="py-2 px-2 text-center text-gray-400">{s.tests}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
