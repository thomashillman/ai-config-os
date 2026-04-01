import { useState, useEffect } from "react"
import ResumeSheet from "../components/ResumeSheet"
import TaskDetailTab from "./TaskDetailTab"
import { getWorkerBaseUrl } from "../lib/workerClient"
import { routeLabel } from "../lib/taskFormatters"
import { timeAgo } from "../lib/dateFormatters"
import { summarizeTaskFindings } from "../lib/taskFindingSummary"

// The most meaningful status summary for the right side of the card
function taskStatusSummary(task) {
  const { openCount, questionCount, verifiedCount } = summarizeTaskFindings(task.findings)

  if (task.state === "complete") {
    return { text: `${verifiedCount} verified · done`, cls: "text-gray-500" }
  }
  if (openCount > 0 && questionCount > 0) {
    return { text: `${openCount} to check · ${questionCount} question${questionCount !== 1 ? "s" : ""}`, cls: "text-yellow-400" }
  }
  if (openCount > 0) {
    return { text: `${openCount} thing${openCount !== 1 ? "s" : ""} to check`, cls: "text-yellow-400" }
  }
  if (questionCount > 0) {
    return { text: `${questionCount} open question${questionCount !== 1 ? "s" : ""}`, cls: "text-gray-400" }
  }
  if (task.state === "active") {
    return { text: "In progress", cls: "text-green-400" }
  }
  return { text: task.state, cls: "text-gray-500" }
}

function TaskCard({ task, onResume, onView }) {
  const route = routeLabel(task.current_route)
  const summary = taskStatusSummary(task)
  const isDone = task.state === "complete"

  return (
    <div
      className="border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors cursor-pointer group"
      onClick={() => onView(task.task_id)}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: state dot + title + meta */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className={`mt-1 text-[10px] flex-shrink-0 ${isDone ? "text-gray-600" : "text-green-400"}`}>
            {isDone ? "✓" : "●"}
          </span>
          <div className="min-w-0">
            <h3 className="text-white text-sm font-medium truncate leading-snug">
              {task.goal || task.name || task.task_type || task.task_id}
            </h3>
            <div className="flex items-center gap-2 text-xs text-gray-600 mt-0.5 flex-wrap">
              <span>{route}</span>
              {task.short_code && <span className="font-mono">{task.short_code}</span>}
              <span>{timeAgo(task.updated_at)}</span>
            </div>
          </div>
        </div>

        {/* Right: summary + action */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0 text-right">
          <span className={`text-xs ${summary.cls}`}>{summary.text}</span>
          {task.state === "active" && (
            <button
              onClick={e => { e.stopPropagation(); onResume(task) }}
              className="text-xs bg-gray-700 hover:bg-gray-600 text-white rounded px-2.5 py-1 transition-colors whitespace-nowrap opacity-0 group-hover:opacity-100"
            >
              Continue here →
            </button>
          )}
          {(task.state === "complete" || task.state === "paused") && (
            <span className="text-xs text-gray-600 opacity-0 group-hover:opacity-100">View →</span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function HubTab({ workerUrl, token: tokenProp }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [resumeTask, setResumeTask] = useState(null)
  const [filter, setFilter] = useState("active")
  const [detailTaskId, setDetailTaskId] = useState(null)

  const baseUrl = workerUrl || getWorkerBaseUrl()
  const token = tokenProp

  if (detailTaskId) {
    return (
      <TaskDetailTab
        taskId={detailTaskId}
        onBack={() => setDetailTaskId(null)}
        workerUrl={baseUrl}
        token={token}
      />
    )
  }

  async function fetchTasks() {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: "20" })
      if (filter !== "all") params.set("status", filter)

      const res = await fetch(`${baseUrl}/v1/tasks?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || `HTTP ${res.status}`)
      }

      const data = await res.json()
      setTasks(data.data?.tasks || data.tasks || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTasks() }, [filter])

  return (
    <div className="max-w-2xl space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-white font-semibold">Tasks</h2>
          <div className="flex gap-1">
            {["active", "all"].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-2.5 py-1 rounded transition-colors ${
                  filter === f ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {f === "active" ? "Active" : "All"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchTasks}
            className="text-xs text-gray-600 hover:text-gray-400 px-2 py-1"
          >
            ↻
          </button>
          <button
            onClick={() => window.open("https://claude.ai/chat?q=start+a+review+task", "_blank")}
            className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded px-3 py-1 transition-colors"
          >
            + New
          </button>
        </div>
      </div>

      {/* States */}
      {loading && <p className="text-gray-600 text-sm">Loading tasks...</p>}

      {error && (
        <div className="border border-red-900/50 bg-red-950/20 rounded-lg p-3">
          <p className="text-red-400 text-sm">{error}</p>
          {!token && (
            <p className="text-gray-600 text-xs mt-1">
              Set <code className="font-mono">VITE_AUTH_TOKEN</code> to connect to your Worker.
            </p>
          )}
        </div>
      )}

      {!loading && !error && tasks.length === 0 && (
        <div className="border border-gray-800 rounded-lg p-8 text-center space-y-1">
          <p className="text-gray-500 text-sm">No {filter === "active" ? "active " : ""}tasks yet.</p>
          <p className="text-gray-700 text-xs">
            Start a review in Claude Code or Codex — tasks appear here automatically.
          </p>
        </div>
      )}

      {!loading && tasks.length > 0 && (
        <div className="space-y-1.5">
          {tasks.map(task => (
            <TaskCard
              key={task.task_id}
              task={task}
              onResume={setResumeTask}
              onView={setDetailTaskId}
            />
          ))}
        </div>
      )}

      {resumeTask && (
        <ResumeSheet task={resumeTask} onClose={() => setResumeTask(null)} workerUrl={baseUrl} />
      )}
    </div>
  )
}
