import { useState, useEffect } from "react"
import { WORKER_URL } from "../lib/workerClient"

// Human-readable label for where a session was created
function sessionOriginLabel(route) {
  if (route === "local_repo") return "Full mode session"
  if (route === "github_pr") return "Cloud mode session (PR)"
  return "Cloud mode session"
}

// What the current (local) environment can do that the origin couldn't
function upgradeCapabilityLine(initialRoute, currentRoute) {
  if (initialRoute !== "local_repo" && currentRoute === "local_repo") {
    return "Here I can trace the full call graph and check git history."
  }
  if (initialRoute === "pasted_diff" && currentRoute === "github_pr") {
    return "Here I can fetch the full PR context."
  }
  return null
}

export default function ResumeSheet({ task, onClose }) {
  const [copied, setCopied] = useState(false)
  const phrase = `resume ${task.goal || task.name || task.task_type || task.task_id}`
  const origin = sessionOriginLabel(task.initial_route || task.current_route)

  // Try to detect current env capability for the upgrade line
  // (shown when this sheet is opened on a stronger device than where task started)
  const upgradeLine = upgradeCapabilityLine(
    task.initial_route || task.current_route,
    task.current_route  // placeholder — hub doesn't know the viewing device's route
  )

  const findings = task.findings || []
  const openFindings = findings.filter(f =>
    f.type !== "question" &&
    (f.provenance?.status === "hypothesis" || f.provenance?.status === "reused")
  )
  const openQuestions = findings.filter(f => f.type === "question")

  useEffect(() => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(phrase).then(() => setCopied(true)).catch(() => {})
    }
  }, [phrase])

  function handleCopy() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(phrase).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 3000)
      })
    }
  }

  function handleShare() {
    const url = `${WORKER_URL}/hub/latest`
    if (navigator.share) {
      navigator.share({ title: `Continue: ${task.goal || task.name}`, url })
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-lg">

        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-4">
          <div>
            <h2 className="text-white font-semibold">
              Continue: &ldquo;{task.goal || task.name || task.task_type}&rdquo;
            </h2>
            <p className="text-gray-500 text-xs mt-0.5">{origin}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-xl leading-none ml-4 mt-0.5"
          >
            ×
          </button>
        </div>

        {/* Findings from prior session */}
        {(openFindings.length > 0 || openQuestions.length > 0) && (
          <div className="px-5 pb-4 space-y-1.5">
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">
              From your {origin}:
            </p>
            {openFindings.map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-yellow-400 mt-0.5 flex-shrink-0">↻</span>
                <span className="text-gray-300">{f.summary || f.description || f.finding_id}</span>
              </div>
            ))}
            {openQuestions.map((f, i) => (
              <div key={`q${i}`} className="flex items-start gap-2 text-sm">
                <span className="text-gray-400 mt-0.5 flex-shrink-0">?</span>
                <span className="text-gray-300">{f.summary || f.description}</span>
              </div>
            ))}
          </div>
        )}

        {/* Capability upgrade line */}
        {upgradeLine && (
          <div className="px-5 pb-4">
            <p className="text-gray-400 text-sm italic">{upgradeLine}</p>
          </div>
        )}

        {/* Resume phrase — prominent bordered box */}
        <div className="mx-5 mb-4 bg-gray-800 border-2 border-gray-600 rounded-lg p-3">
          <div className="flex items-center justify-between gap-3">
            <code className="text-green-400 text-sm font-mono flex-1 min-w-0 truncate">
              {phrase}
            </code>
            <span className={`text-xs font-medium flex-shrink-0 transition-colors ${copied ? "text-green-400" : "text-gray-500"}`}>
              {copied ? "✓ Copied" : "copy"}
            </span>
          </div>
          {!copied && (
            <button
              onClick={handleCopy}
              className="absolute inset-0 w-full h-full opacity-0"
              aria-label="Copy resume phrase"
            />
          )}
        </div>

        <p className="px-5 pb-4 text-gray-600 text-xs">
          Paste into Claude Code or Codex to continue this session.
        </p>

        {/* Action buttons */}
        <div className="px-5 pb-5 flex gap-2">
          <a
            href={`https://claude.ai/chat?q=${encodeURIComponent(phrase)}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 text-center text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded px-3 py-2 transition-colors"
          >
            Open Claude Code ↗
          </a>
          <a
            href={`https://chatgpt.com/?q=${encodeURIComponent(phrase)}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 text-center text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded px-3 py-2 transition-colors"
          >
            Open Codex ↗
          </a>
          <button
            onClick={handleShare}
            className="text-xs text-gray-500 hover:text-gray-300 px-3 py-2 rounded border border-gray-700 hover:border-gray-600 transition-colors"
          >
            Share
          </button>
        </div>
      </div>
    </div>
  )
}
