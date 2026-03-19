import { useState, useEffect, useMemo } from "react"
import ResumeSheet from "../components/ResumeSheet"

const WORKER_URL = import.meta.env.VITE_WORKER_URL || "https://ai-config-os.workers.dev"

function sessionLabel(route) {
  if (route === "local_repo") return "Full session"
  if (route === "github_pr") return "Cloud session · PR"
  return "Cloud session"
}

function stateLabel(state) {
  if (state === "active") return { text: "Active", cls: "text-green-400" }
  if (state === "complete") return { text: "Done", cls: "text-gray-500" }
  if (state === "paused") return { text: "Paused", cls: "text-yellow-400" }
  return { text: state, cls: "text-gray-400" }
}

function formatDate(iso) {
  if (!iso) return ""
  const d = new Date(iso)
  return d.toLocaleDateString("en-GB", { month: "short", day: "numeric" }) +
    ", " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

// Human-readable event narrative
function eventNarrative(e, index, allEvents) {
  switch (e.type) {
    case "state_change":
      if (index === 0 || !allEvents.slice(0, index).some(x => x.type === "state_change")) {
        return "Started this review"
      }
      if (e.metadata?.next_state === "complete") return "Marked complete"
      if (e.metadata?.next_state === "paused") return "Paused"
      return "Resumed"
    case "finding_recorded":
      return "Finding recorded"
    case "route_selected":
      if (e.metadata?.route_id === "local_repo") return "Switched to Full mode — full codebase access"
      if (e.metadata?.route_id === "github_pr") return "Switched to Cloud mode (PR)"
      return "Switched to Cloud mode"
    case "continuation_created":
      return "Handoff saved"
    case "finding_transitioned": {
      const n = e.metadata?.reclassified_count || 0
      return `${n} finding${n !== 1 ? "s" : ""} re-evaluated for ${e.metadata?.route_id === "local_repo" ? "Full mode" : "new route"}`
    }
    default:
      return null
  }
}

function ProvenanceSection({ findings }) {
  const groups = [
    {
      status: "verified",
      icon: "✓",
      label: "Confirmed here",
      cls: "text-green-400",
      items: findings.filter(f => f.provenance?.status === "verified" && f.type !== "question"),
    },
    {
      status: "reused",
      icon: "↻",
      label: "Flagged in prior session, will verify",
      cls: "text-yellow-400",
      items: findings.filter(f => f.provenance?.status === "reused" && f.type !== "question"),
    },
    {
      status: "hypothesis",
      icon: "·",
      label: "Noticed — needs checking",
      cls: "text-gray-400",
      items: findings.filter(f => f.provenance?.status === "hypothesis" && f.type !== "question"),
    },
    {
      status: "invalidated",
      icon: "✗",
      label: "Not an issue",
      cls: "text-gray-600",
      items: findings.filter(f => f.provenance?.status === "invalidated" && f.type !== "question"),
    },
  ].filter(g => g.items.length > 0)

  if (!groups.length) {
    return (
      <div>
        <h3 className="text-gray-500 text-xs uppercase tracking-wide mb-2">What I found</h3>
        <p className="text-gray-600 text-sm">No findings recorded yet.</p>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-gray-500 text-xs uppercase tracking-wide mb-3">What I found</h3>
      <div className="space-y-4">
        {groups.map(g => (
          <div key={g.status}>
            <div className={`flex items-center gap-2 text-xs mb-1.5 ${g.cls}`}>
              <span>{g.icon}</span>
              <span>{g.label} ({g.items.length})</span>
            </div>
            <div className="space-y-1 ml-4">
              {g.items.map((f, i) => (
                <div key={i} className="border-l border-gray-800 pl-3">
                  <p className="text-sm text-gray-300">{f.summary || f.description || f.finding_id}</p>
                  {f.location && (
                    <p className="text-xs text-gray-600 font-mono mt-0.5">{f.location}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function OpenQuestions({ questions, onAnswer, onDismiss }) {
  if (!questions.length) return null

  return (
    <div>
      <h3 className="text-gray-500 text-xs uppercase tracking-wide mb-3">
        Open question{questions.length !== 1 ? "s" : ""}
      </h3>
      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={i} className="border border-gray-800 rounded-lg p-3 space-y-2">
            <p className="text-sm text-gray-200">{q.summary || q.description}</p>
            <div className="flex gap-2">
              <button
                onClick={() => onAnswer(q)}
                className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded px-3 py-1.5 transition-colors"
              >
                Answer
              </button>
              <button
                onClick={() => onDismiss(q)}
                className="text-xs text-gray-500 hover:text-gray-300 px-3 py-1.5 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EventStory({ events, task }) {
  const significant = events
    .map((e, i) => ({ ...e, _label: eventNarrative(e, i, events) }))
    .filter(e => e._label !== null)

  const isWaiting = task?.state === "active" &&
    task?.current_route !== "local_repo" &&
    (task?.findings || []).some(f =>
      f.provenance?.status === "hypothesis" || f.provenance?.status === "reused"
    )

  if (!significant.length && !isWaiting) return null

  return (
    <div>
      <h3 className="text-gray-500 text-xs uppercase tracking-wide mb-3">Story</h3>
      <div className="relative">
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-800" />
        <div className="space-y-3 pl-6">
          {significant.map((e, i) => (
            <div key={i} className="relative">
              <div className="absolute -left-[18px] top-[5px] w-[9px] h-[9px] rounded-full bg-gray-700 border border-gray-600" />
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-sm text-gray-300">{e._label}</span>
                <span className="text-xs text-gray-600">{formatDate(e.created_at)}</span>
              </div>
            </div>
          ))}

          {isWaiting && (
            <div className="relative">
              <div className="absolute -left-[18px] top-[5px] w-[9px] h-[9px] rounded-full border border-gray-700" />
              <p className="text-sm text-gray-600 italic">— Waiting for a full-access session</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AnswerModal({ question, taskId, token, onClose, onSaved }) {
  const [answer, setAnswer] = useState("")
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!answer.trim()) return
    setSaving(true)
    try {
      const task = await fetch(`${WORKER_URL}/v1/tasks/${taskId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then(r => r.json())

      const version = task.task?.version
      if (!version) throw new Error("Could not load task version")

      await fetch(`${WORKER_URL}/v1/tasks/${taskId}/findings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          expected_version: version,
          finding: {
            finding_id: `answer_${Date.now()}`,
            type: "answer",
            summary: `Answer: ${answer.trim()}`,
            description: `Question: ${question.summary}\nAnswer: ${answer.trim()}`,
            provenance: {
              status: "verified",
              recorded_by_route: "hub",
              recorded_at: new Date().toISOString(),
            },
          },
          updated_at: new Date().toISOString(),
        }),
      })
      onSaved()
    } catch {
      // best-effort
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-md p-5 space-y-4">
        <div className="flex items-start justify-between">
          <p className="text-sm text-gray-300">{question.summary}</p>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 ml-3 text-lg leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm text-gray-200 resize-none focus:outline-none focus:border-gray-500"
            rows={3}
            placeholder="Your answer..."
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="text-xs text-gray-500 hover:text-gray-300 px-3 py-1.5">Cancel</button>
            <button
              type="submit"
              disabled={saving || !answer.trim()}
              className="text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white rounded px-3 py-1.5 transition-colors"
            >
              {saving ? "Saving..." : "Save answer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function TaskDetailTab({ taskId, onBack }) {
  const [task, setTask] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showResume, setShowResume] = useState(false)
  const [answerQuestion, setAnswerQuestion] = useState(null)

  const token = import.meta.env.VITE_AUTH_TOKEN || ""

  async function fetchTask() {
    setLoading(true)
    setError(null)
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const [taskRes, eventsRes] = await Promise.all([
        fetch(`${WORKER_URL}/v1/tasks/${taskId}`, { headers }),
        fetch(`${WORKER_URL}/v1/tasks/${taskId}/progress-events`, { headers }),
      ])

      if (!taskRes.ok) {
        const b = await taskRes.json().catch(() => ({}))
        throw new Error(b?.error?.message || `HTTP ${taskRes.status}`)
      }

      const taskData = await taskRes.json()
      setTask(taskData.task)

      if (eventsRes.ok) {
        const eventsData = await eventsRes.json()
        setEvents(eventsData.events || [])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDismiss(question) {
    if (!task) return
    try {
      await fetch(`${WORKER_URL}/v1/tasks/${taskId}/findings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          expected_version: task.version,
          finding: {
            finding_id: `dismiss_${Date.now()}`,
            type: "dismissed",
            summary: `Dismissed: ${question.summary}`,
            provenance: {
              status: "invalidated",
              recorded_by_route: "hub",
              recorded_at: new Date().toISOString(),
            },
          },
          updated_at: new Date().toISOString(),
        }),
      })
      fetchTask()
    } catch {
      // best-effort
    }
  }

  useEffect(() => { fetchTask() }, [taskId])

  const findings = task?.findings || []
  const openQuestions = useMemo(
    () => findings.filter(f => f.type === "question"),
    [findings]
  )
  const openFindings = useMemo(
    () => findings.filter(f =>
      f.type !== "question" &&
      (f.provenance?.status === "hypothesis" || f.provenance?.status === "reused")
    ),
    [findings]
  )
  const origin = sessionLabel(task?.initial_route || task?.current_route)
  const state = stateLabel(task?.state)

  return (
    <div className="max-w-2xl space-y-6">
      {/* Back nav */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-300 text-sm">
          ← Tasks
        </button>
        {task?.short_code && (
          <span className="text-gray-700 font-mono text-xs">{task.short_code}</span>
        )}
      </div>

      {loading && <p className="text-gray-500 text-sm">Loading...</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {task && (
        <>
          {/* Title row */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-white font-semibold text-base truncate">
                  {task.goal || task.name || task.task_type}
                </h2>
                <span className="text-gray-600">·</span>
                <span className="text-gray-400 text-sm whitespace-nowrap">{origin}</span>
              </div>
              <div className="flex items-center gap-3 text-xs mt-1">
                <span className={state.cls}>{state.text}</span>
                {openFindings.length > 0 && (
                  <>
                    <span className="text-gray-700">·</span>
                    <span className="text-yellow-400">{openFindings.length} to verify</span>
                  </>
                )}
              </div>
            </div>

            {task.state === "active" && (
              <button
                onClick={() => setShowResume(true)}
                className="text-xs bg-gray-700 hover:bg-gray-600 text-white rounded px-3 py-1.5 transition-colors whitespace-nowrap flex-shrink-0"
              >
                Continue here →
              </button>
            )}
          </div>

          {/* Goal label if different from name */}
          {task.goal && task.name && task.goal !== task.name && (
            <p className="text-gray-500 text-sm">Goal: {task.goal}</p>
          )}

          {/* What I found */}
          <div className="border-t border-gray-800 pt-5">
            <ProvenanceSection findings={findings} />
          </div>

          {/* Open questions */}
          {openQuestions.length > 0 && (
            <div className="border-t border-gray-800 pt-5">
              <OpenQuestions
                questions={openQuestions}
                onAnswer={setAnswerQuestion}
                onDismiss={handleDismiss}
              />
            </div>
          )}

          {/* Story */}
          {events.length > 0 && (
            <div className="border-t border-gray-800 pt-5">
              <EventStory events={events} task={task} />
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-gray-800 pt-4 flex items-center gap-4">
            <span className="text-xs text-gray-700">v{task.version}</span>
            <span className="text-xs text-gray-700">{findings.length} findings</span>
            <button onClick={fetchTask} className="text-xs text-gray-500 hover:text-gray-300">
              ↻ Refresh
            </button>
          </div>
        </>
      )}

      {showResume && task && (
        <ResumeSheet task={task} onClose={() => setShowResume(false)} />
      )}

      {answerQuestion && task && (
        <AnswerModal
          question={answerQuestion}
          taskId={task.task_id}
          token={token}
          onClose={() => setAnswerQuestion(null)}
          onSaved={() => { setAnswerQuestion(null); fetchTask() }}
        />
      )}
    </div>
  )
}
