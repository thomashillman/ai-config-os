import { useState, useEffect } from "react"

export default function ContextCostTab({ api }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetch(`${api}/context-cost`)
      .then(r => r.json())
      .then(setData)
  }, [])

  return (
    <div>
      <h2 className="text-gray-300 font-semibold mb-4">Context Cost Analysis</h2>
      <pre className="bg-gray-900 rounded p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-96">
        {data ? data.output : "Loading..."}
      </pre>
    </div>
  )
}
