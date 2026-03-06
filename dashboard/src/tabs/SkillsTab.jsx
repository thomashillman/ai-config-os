import { useState, useEffect } from "react"

function parseSkillStats(output) {
  const lines = output.split("\n").filter(Boolean)
  const dataLines = lines.slice(2) // skip header and separator
  return dataLines.map(line => {
    const parts = line.trim().split(/\s{2,}/)
    return {
      name: parts[0] || "",
      type: parts[1] || "",
      status: parts[2] || "",
      opus: parts[3] || "-",
      sonnet: parts[4] || "-",
      haiku: parts[5] || "-",
      tests: parts[6] || "0",
    }
  }).filter(r => r.name)
}

const statusColour = (s) =>
  s === "stable" ? "text-green-400" : s === "experimental" ? "text-yellow-400" : "text-gray-500"

export default function SkillsTab({ api }) {
  const [skills, setSkills] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${api}/skill-stats`)
      .then(r => r.json())
      .then(d => {
        setSkills(parseSkillStats(d.output || ""))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div>
      <h2 className="text-gray-300 font-semibold mb-4">Skill Library ({skills.length} skills)</h2>
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
                <tr key={s.name} className="border-b border-gray-900 hover:bg-gray-900 transition-colors">
                  <td className="py-2 pr-4 text-gray-200">{s.name}</td>
                  <td className="py-2 pr-4 text-gray-400">{s.type}</td>
                  <td className={`py-2 pr-4 ${statusColour(s.status)}`}>{s.status}</td>
                  <td className="py-2 px-2 text-center">{s.opus === "✓" ? "✓" : <span className="text-gray-700">-</span>}</td>
                  <td className="py-2 px-2 text-center">{s.sonnet === "✓" ? "✓" : <span className="text-gray-700">-</span>}</td>
                  <td className="py-2 px-2 text-center">{s.haiku === "✓" ? "✓" : <span className="text-gray-700">-</span>}</td>
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
