import { useState, useEffect } from "react"
import ResponseContractPanel from "../components/ResponseContractPanel"
import { buildFetchError, getOutcomeContract } from "../lib/dashboardApi"

const CHECKMARK = "\u2713"

const statusColour = (s) =>
  s === "stable" ? "text-green-400" : s === "experimental" ? "text-yellow-400" : "text-gray-500"

export default function SkillsTab({ api }) {
  const [skills, setSkills] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${api}/contracts/skills.list`)
      .then(r => r.json())
      .then(payload => payload?.data ?? payload)
      .then(d => {
        setData(d)
        setSkills(Array.isArray(d.skills) ? d.skills : [])
        setLoading(false)
      })
      .catch(() => {
        setData(buildFetchError())
        setLoading(false)
      })
  }, [api])

  return (
    <div>
      <h2 className="text-gray-300 font-semibold mb-1">Skill Library ({skills.length} skills)</h2>
      <p className="text-gray-600 text-xs mb-4">{data?.interpretation?.why_it_matters_now || "Current skill inventory and readiness."}</p>
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
