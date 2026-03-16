import { useState, useEffect } from "react"

const WORKER_URL = import.meta.env.VITE_WORKER_URL || "https://ai-config-os.workers.dev"

function getRouteLabel(route) {
  if (route === "local_repo") return "Full mode"
  if (route === "github_pr") return "Cloud mode · PR"
  return "Cloud mode"
}

function getProvenance(status) {
  if (status === "verified") return { label: "Confirmed", icon: "✓", cls: "text-green-400" }
  if (status === "invalidated") return { label: "Not an issue", icon: "✗", cls: "text-gray-500" }
  if (status === "reused") return { label: "Flagged previously, will verify", icon: "↻", cls: "text-yellow-400" }
  return { label: "Noticed — needs checking", icon: "?", cls: "text-gray-400" }
}

export default function ResumeSheet({ task, onClose }) {
  const [copied, setCopied] = useState(false)
  const phrase = `resume ${task.goal || task.name || task.task_type || task.task_id}`

  useEffect(() => {
    // Auto-copy on open
    if (navigator.clipboard) {
      navigator.clipboard.writeText(phrase).then(() => {
        setCopied(true)
      }).catch(() => {})
    }
  }, [phrase])

  const findings = task.findings || []
  const openFindings = findings.filter(f => f.provenance?.status === "hypothesis" || f.provenance?.status === "reused")
  const verifiedFindings = findings.filter(f => f.provenance?.status === "verified")

  function handleCopy() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(phrase).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-lg p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-white font-semibold">Continue: "{task.goal || task.name || task.task_type}"</h2>
            <p className="text-gray-400 text-xs mt-1">{getRouteLabel(task.current_route)}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
        </div>

        {openFindings.length > 0 && (
          <div className="space-y-1">
            <p className="text-gray-400 text-xs uppercase tracking-wide">From prior session:</p>
            {openFindings.map((f, i) => {
              const prov = getProvenance(f.provenance?.status)
              return (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className={prov.cls}>{prov.icon}</span>
                  <span className="text-gray-300">{f.summary || f.description || f.finding_id}</span>
                </div>
              )
            })}
          </div>
        )}

        {verifiedFindings.length > 0 && (
          <p className="text-gray-500 text-xs">{verifiedFindings.length} finding{verifiedFindings.length !== 1 ? "s" : ""} already confirmed</p>
        )}

        <div className="bg-gray-800 border border-gray-600 rounded p-3">
          <div className="flex items-center justify-between gap-3">
            <code className="text-green-400 text-sm flex-1 truncate">{phrase}</code>
            <span className={`text-xs flex-shrink-0 ${copied ? "text-green-400" : "text-gray-400"}`}>
              {copied ? "✓ Copied" : ""}
            </span>
          </div>
          {!copied && (
            <button
              onClick={handleCopy}
              className="mt-2 text-xs text-gray-400 hover:text-gray-200 underline"
            >
              Copy to clipboard
            </button>
          )}
        </div>

        <p className="text-gray-500 text-xs">Paste into Claude Code or Codex to continue this session.</p>

        <div className="flex gap-3 pt-1">
          <a
            href={`https://claude.ai/chat?q=${encodeURIComponent(phrase)}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 text-center text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded px-3 py-2 transition-colors"
          >
            Open Claude ↗
          </a>
          <button
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-300 px-3 py-2"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
