import { useState, useEffect } from "react"
import { WORKER_URL } from "../lib/workerClient"
import { mapTaskToResumeModel } from "../lib/contracts/taskViewModels"

export default function ResumeSheet({ task, onClose }) {
  const [copied, setCopied] = useState(false)
  const model = mapTaskToResumeModel(task)

  useEffect(() => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(model.phrase).then(() => setCopied(true)).catch(() => {})
    }
  }, [model.phrase])

  function handleCopy() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(model.phrase).then(() => {
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
        <div className="flex items-start justify-between p-5 pb-4">
          <div>
            <h2 className="text-white font-semibold">Continue: &ldquo;{model.title}&rdquo;</h2>
            <p className="text-gray-500 text-xs mt-0.5">{model.originLabel}</p>
            <p className="text-gray-600 text-xs mt-1">{model.conciseSummaryLine}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-xl leading-none ml-4 mt-0.5"
          >
            ×
          </button>
        </div>

        {(model.openFindings.length > 0 || model.openQuestions.length > 0) && (
          <div className="px-5 pb-4 space-y-1.5">
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">From your {model.originLabel}:</p>
            {model.openFindings.map((finding, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-yellow-400 mt-0.5 flex-shrink-0">↻</span>
                <span className="text-gray-300">{finding.summary || finding.description || finding.finding_id}</span>
              </div>
            ))}
            {model.openQuestions.map((finding, i) => (
              <div key={`q${i}`} className="flex items-start gap-2 text-sm">
                <span className="text-gray-400 mt-0.5 flex-shrink-0">?</span>
                <span className="text-gray-300">{finding.summary || finding.description}</span>
              </div>
            ))}
          </div>
        )}

        {model.upgradeLine && (
          <div className="px-5 pb-4">
            <p className="text-gray-400 text-sm italic">{model.upgradeLine}</p>
          </div>
        )}

        <div className="mx-5 mb-4 bg-gray-800 border-2 border-gray-600 rounded-lg p-3">
          <div className="flex items-center justify-between gap-3">
            <code className="text-green-400 text-sm font-mono flex-1 min-w-0 truncate">{model.phrase}</code>
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

        <p className="px-5 pb-4 text-gray-600 text-xs">Paste into Claude Code or Codex to continue this session.</p>

        <div className="px-5 pb-5 flex gap-2">
          <a
            href={`https://claude.ai/chat?q=${encodeURIComponent(model.phrase)}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 text-center text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded px-3 py-2 transition-colors"
          >
            Open Claude Code ↗
          </a>
          <a
            href={`https://chatgpt.com/?q=${encodeURIComponent(model.phrase)}`}
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
