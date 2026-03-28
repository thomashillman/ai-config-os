import { useState, useEffect, useMemo } from "react"
import ResumeSheet from "../components/ResumeSheet"
import { WORKER_URL } from "../lib/workerClient"
import { readErrorMessage } from "../lib/taskFormatters"
import { mapTaskToDetailModel } from "../lib/contracts/taskViewModels"

function ProvenanceSection({ groups }) {
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
        {groups.map(group => (
          <div key={group.status}>
            <div className={`flex items-center gap-2 text-xs mb-1.5 ${group.cls}`}>
              <span>{group.icon}</span>
              <span>{group.label} ({group.items.length})</span>
            </div>
            <div className="space-y-1 ml-4">
              {group.items.map((finding, index) => (
                <div key={index} className="border-l border-gray-800 pl-3">
                  <p className="text-sm text-gray-300">{finding.summary || finding.description || finding.finding_id}</p>
                  {finding.location && (
                    <p className="text-xs text-gray-600 font-mono mt-0.5">{finding.location}</p>
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

function OpenQuestions({ questions, onAnswer, onDismiss, dismissErrors, dismissingQuestionId }) {
  if (!questions.length) return null

  return (
    <div>
      <h3 className="text-gray-500 text-xs uppercase tracking-wide mb-3">
        Open question{questions.length !== 1 ? "s" : ""}
      </h3>
      <div className="space-y-3">
        {questions.map((question, i) => {
          const questionId = question.finding_id || String(i)
          const dismissError = dismissErrors[questionId]
          const isDismissing = dismissingQuestionId === questionId

          return (
            <div key={questionId} className="border border-gray-800 rounded-lg p-3 space-y-2">
              <p className="text-sm text-gray-200">{question.summary || question.description}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => onAnswer(question)}
                  className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded px-3 py-1.5 transition-colors"
                >
                  Answer
                </button>
                <button
                  onClick={() => onDismiss(question)}
                  disabled={isDismissing}
                  className="text-xs text-gray-500 hover:text-gray-300 disabled:opacity-40 px-3 py-1.5 transition-colors"
                >
                  {isDismissing ? "Dismissing..." : "Dismiss"}
                </button>
              </div>
              {dismissError && (
                <p className="text-xs text-red-400" role="alert">{dismissError}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EventStory({ significantEvents, waitingForFullAccess }) {
  if (!significantEvents.length && !waitingForFullAccess) return null

  return (
    <div>
      <h3 className="text-gray-500 text-xs uppercase tracking-wide mb-3">Story</h3>
      <div className="relative">
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-800" />
        <div className="space-y-3 pl-6">
          {significantEvents.map((event, index) => (
            <div key={index} className="relative">
              <div className="absolute -left-[18px] top-[5px] w-[9px] h-[9px] rounded-full bg-gray-700 border border-gray-600" />
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-sm text-gray-300">{event.label}</span>
                <span className="text-xs text-gray-600">{event.createdAtLabel}</span>
              </div>
            </div>
          ))}

          {waitingForFullAccess && (
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
  const [error, setError] = useState("")

  async function handleSubmit(e) {
    e.preventDefault()
    if (!answer.trim()) return
    setSaving(true)
    setError("")

    try {
      const taskResponse = await fetch(`${WORKER_URL}/v1/tasks/${taskId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (!taskResponse.ok) {
        throw new Error(await readErrorMessage(taskResponse, `Could not load task version (HTTP ${taskResponse.status})`))
      }

      const taskResponsePayload = await taskResponse.json()
      const version = taskResponsePayload.task?.version
      if (!version) throw new Error("Could not load task version")

      const response = await fetch(`${WORKER_URL}/v1/tasks/${taskId}/findings`, {
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
            description: `Question: ${question.summary}
Answer: ${answer.trim()}`,
            provenance: {
              status: "verified",
              recorded_by_route: "hub",
              recorded_at: new Date().toISOString(),
            },
          },
          updated_at: new Date().toISOString(),
        }),
      })

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, `Could not save answer (HTTP ${response.status})`))
      }

      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save answer")
    } finally {
      setSaving(false)
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
          {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
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
  const [dismissErrors, setDismissErrors] = useState({})
  const [dismissingQuestionId, setDismissingQuestionId] = useState(null)

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
      setDismissErrors({})

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

    const questionId = question.finding_id || question.summary || question.description
    setDismissingQuestionId(questionId)
    setDismissErrors(current => {
      const next = { ...current }
      delete next[questionId]
      return next
    })

    try {
      const response = await fetch(`${WORKER_URL}/v1/tasks/${taskId}/findings`, {
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

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, `Could not dismiss question (HTTP ${response.status})`))
      }

      await fetchTask()
    } catch (err) {
      setDismissErrors(current => ({
        ...current,
        [questionId]: err instanceof Error ? err.message : "Could not dismiss question",
      }))
    } finally {
      setDismissingQuestionId(null)
    }
  }

  useEffect(() => { fetchTask() }, [taskId])

  const detailModel = useMemo(() => mapTaskToDetailModel(task, events), [task, events])
  const waitingForFullAccess = task?.state === "active" && task?.current_route !== "local_repo" && detailModel.openFindings.length > 0

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-300 text-sm">← Tasks</button>
        {task?.short_code && (
          <span className="text-gray-700 font-mono text-xs">{task.short_code}</span>
        )}
      </div>

      {loading && <p className="text-gray-500 text-sm">Loading...</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {task && (
        <>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-white font-semibold text-base truncate">{detailModel.title}</h2>
                <span className="text-gray-600">·</span>
                <span className="text-gray-400 text-sm whitespace-nowrap">{detailModel.originLabel}</span>
              </div>
              <div className="flex items-center gap-3 text-xs mt-1">
                <span className={detailModel.stateBadge.cls}>{detailModel.stateBadge.text}</span>
                {detailModel.openFindings.length > 0 && (
                  <>
                    <span className="text-gray-700">·</span>
                    <span className="text-yellow-400">{detailModel.openFindings.length} to verify</span>
                  </>
                )}
              </div>
            </div>

            {detailModel.nextActions.some(action => action.id === "continue") && (
              <button
                onClick={() => setShowResume(true)}
                className="text-xs bg-gray-700 hover:bg-gray-600 text-white rounded px-3 py-1.5 transition-colors whitespace-nowrap flex-shrink-0"
              >
                Continue here →
              </button>
            )}
          </div>

          {task.goal && task.name && task.goal !== task.name && (
            <p className="text-gray-500 text-sm">Goal: {task.goal}</p>
          )}

          <div className="border-t border-gray-800 pt-5">
            <ProvenanceSection groups={detailModel.provenanceGroups} />
          </div>

          {detailModel.openQuestions.length > 0 && (
            <div className="border-t border-gray-800 pt-5">
              <OpenQuestions
                questions={detailModel.openQuestions}
                onAnswer={setAnswerQuestion}
                onDismiss={handleDismiss}
                dismissErrors={dismissErrors}
                dismissingQuestionId={dismissingQuestionId}
              />
            </div>
          )}

          {(events.length > 0 || waitingForFullAccess) && (
            <div className="border-t border-gray-800 pt-5">
              <EventStory significantEvents={detailModel.significantEvents} waitingForFullAccess={waitingForFullAccess} />
            </div>
          )}

          <div className="border-t border-gray-800 pt-4 flex items-center gap-4">
            <span className="text-xs text-gray-700">v{task.version}</span>
            <span className="text-xs text-gray-700">{detailModel.findings.length} findings</span>
            <button onClick={fetchTask} className="text-xs text-gray-500 hover:text-gray-300">↻ Refresh</button>
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
