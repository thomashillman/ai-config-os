import { useState, useEffect } from "react"
import ResumeSheet from "../components/ResumeSheet"
import TaskDetailTab from "./TaskDetailTab"

const WORKER_URL = import.meta.env.VITE_WORKER_URL || "https://ai-config-os.workers.dev"

function getRouteLabel(route) {
  if (route === "local_repo") return "Full"
  if (route === "github_pr") return "Cloud · PR"
  return "Cloud"
}

function getStateLabel(state) {
  if (state === "active") return { text: "Active", cls: "text-green-400" }
  if (state === "complete") return { text: "Done", cls: "text-gray-500" }
  if (state === "paused") return { text: "Paused", cls: "text-yellow-400" }
  return { text: state, cls: "text-gray-400" }
}

function timeAgo(iso) {
  if (!iso) return ""
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function TaskCard({ task, onResume, onView }) {
  const route = getRouteLabel(task.current_route)
  const state = getStateLabel(task.state)
  const findings = task.findings || []
  const openCount = findings.filter(f =>
    f.provenance?.status === "hypothesis" || f.provenance?.status === "reused"
  ).length
  const verifiedCount = findings.filter(f => f.provenance?.status === "verified").length

  return (
    <div
      className="border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors cursor-pointer"
      onClick={() => onView(task.task_id)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs ${state.cls}`}>●</span>
            <h3 className="text-white text-sm font-medium truncate">
              {task.goal || task.name || task.task_type || task.task_id}
            </h3>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>{route}</span>
            {task.short_code && <span className="font-mono">{task.short_code}</span>}
            <span>{timeAgo(task.updated_at)}</span>
          </div>
          {(openCount > 0 || verifiedCount > 0) && (
            <p className="text-xs text-gray-400 mt-2">
              {openCount > 0 && `${openCount} to verify`}
              {openCount > 0 && verifiedCount > 0 && " · "}
              {verifiedCount > 0 && `${verifiedCount} confirmed`}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 flex-shrink-0">
          {task.state === "active" && (
            <button
              onClick={e => { e.stopPropagation(); onResume(task) }}
              className="text-xs bg-gray-700 hover:bg-gray-600 text-white rounded px-3 py-1.5 transition-colors whitespace-nowrap"
            >
              Continue here →
            </button>
          )}
          {task.state !== "active" && (
            <span className={`text-xs ${state.cls}`}>{state.text}</span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function HubTab({ api }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [resumeTask, setResumeTask] = useState(null)
  const [filter, setFilter] = useState("active")
  const [detailTaskId, setDetailTaskId] = useState(null)

  if (detailTaskId) {
    return <TaskDetailTab taskId={detailTaskId} onBack={() => setDetailTaskId(null)} />
  }

  const token = import.meta.env.VITE_AUTH_TOKEN || ""

  async function fetchTasks() {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: "20" })
      if (filter !== "all") params.set("status", filter)

      const res = await fetch(`${WORKER_URL}/v1/tasks?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || `HTTP ${res.status}`)
      }

      const data = await res.json()
      setTasks(data.tasks || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTasks()
  }, [filter])

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-semibold">Tasks</h2>
        <div className="flex gap-1">
          {["active", "all"].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1 rounded transition-colors ${
                filter === f
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {f === "active" ? "Active" : "All"}
            </button>
          ))}
          <button
            onClick={fetchTasks}
            className="text-xs text-gray-500 hover:text-gray-300 px-2"
          >
            ↻
          </button>
        </div>
      </div>

      {loading && (
        <p className="text-gray-500 text-sm">Loading tasks...</p>
      )}

      {error && (
        <div className="border border-red-900 bg-red-950/30 rounded p-3">
          <p className="text-red-400 text-sm">{error}</p>
          {!token && (
            <p className="text-gray-500 text-xs mt-1">Set VITE_AUTH_TOKEN to connect to your Worker.</p>
          )}
        </div>
      )}

      {!loading && !error && tasks.length === 0 && (
        <div className="border border-gray-800 rounded-lg p-6 text-center">
          <p className="text-gray-500 text-sm">No {filter === "active" ? "active " : ""}tasks yet.</p>
          <p className="text-gray-600 text-xs mt-1">Start a review in Claude Code or Codex with task-start loaded.</p>
        </div>
      )}

      {!loading && tasks.length > 0 && (
        <div className="space-y-2">
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
        <ResumeSheet
          task={resumeTask}
          onClose={() => setResumeTask(null)}
        />
      )}
    </div>
  )
}
