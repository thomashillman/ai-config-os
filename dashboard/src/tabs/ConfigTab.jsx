import { useState, useEffect } from "react"
import ResponseContractPanel from "../components/ResponseContractPanel"

export default function ConfigTab({ api }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetch(`${api}/config`)
      .then(r => r.json())
      .then(setData)
  }, [])

  return (
    <div>
      <h2 className="text-gray-300 font-semibold mb-4">Merged Config (global + machine + project)</h2>
      <ResponseContractPanel data={data} />
      <pre className="bg-gray-900 rounded p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-96">
        {data ? data.output : "Loading..."}
      </pre>
    </div>
  )
}
