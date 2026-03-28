import { useState, useEffect } from "react"
import ResponseContractPanel from "../components/ResponseContractPanel"
import { buildFetchError, getOutcomeContract } from "../lib/dashboardApi"
import { mapSkillsContract } from "../lib/contracts/skillsViewModels"

const CHECKMARK = "\u2713"

const statusColour = (status) =>
  status === "stable" ? "text-green-400" : status === "experimental" ? "text-yellow-400" : "text-gray-500"

export default function SkillsTab({ api }) {
  const [skills, setSkills] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${api}/skill-stats`)
      .then(r => r.json())
      .then(d => {
        setData(d)
        setSkills(mapSkillsContract(d))
        setLoading(false)
      })
      .catch(() => {
        setData(buildFetchError())
        setLoading(false)
      })
  }, [api])

  return (
    <div>
      <h2 className="text-gray-300 font-semibold mb-4">Skill Library ({skills.length} skills)</h2>
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
              {skills.map(skill => (
                <tr key={skill.name} className="border-b border-gray-900 hover:bg-gray-900 transition-colors">
                  <td className="py-2 pr-4 text-gray-200">{skill.name}</td>
                  <td className="py-2 pr-4 text-gray-400">{skill.type}</td>
                  <td className={`py-2 pr-4 ${statusColour(skill.status)}`}>{skill.status}</td>
                  <td className="py-2 px-2 text-center">{skill.opus ? CHECKMARK : <span className="text-gray-700">-</span>}</td>
                  <td className="py-2 px-2 text-center">{skill.sonnet ? CHECKMARK : <span className="text-gray-700">-</span>}</td>
                  <td className="py-2 px-2 text-center">{skill.haiku ? CHECKMARK : <span className="text-gray-700">-</span>}</td>
                  <td className="py-2 px-2 text-center text-gray-400">{skill.tests}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
