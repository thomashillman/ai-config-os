export default function ResponseContractPanel({ data }) {
  if (!data || data.status === "Full") {
    return null
  }

  return (
    <div className="mb-4 rounded border border-yellow-700 bg-yellow-950/30 p-3 text-xs text-yellow-100 space-y-2">
      <p><span className="font-semibold">Status:</span> {data.status || "Unknown"}</p>
      <p><span className="font-semibold">Selected route:</span> {data.selectedRoute || "Unknown"}</p>
      <div>
        <p className="font-semibold">Missing capabilities</p>
        <ul className="list-disc ml-5">
          {(data.missingCapabilities || ["Not provided"]).map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-semibold">Required user input</p>
        <ul className="list-disc ml-5">
          {(data.requiredUserInput || ["Not provided"]).map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <p><span className="font-semibold">Equivalent route guidance:</span> {data.guidanceEquivalentRoute || "Not provided"}</p>
      <p>
        <span className="font-semibold">Full workflow guidance (higher-capability environment):</span>{" "}
        {data.guidanceFullWorkflowHigherCapabilityEnvironment || "Not provided"}
      </p>
    </div>
  )
}
