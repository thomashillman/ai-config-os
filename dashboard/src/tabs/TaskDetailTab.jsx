import { useState, useEffect } from "react"
import ResumeSheet from "../components/ResumeSheet"

const WORKER_URL = import.meta.env.VITE_WORKER_URL || "https://ai-config-os.workers.dev"

function getRouteLabel(route) {
  if (route === "local_repo") return "Full mode"
  if (route === "github_pr") return "Cloud mode · PR"
  return "Cloud mode"
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

function provenanceLabel(status) {
  const map = {
    verified:    { icon: "✓", text: "Confirmed here",                cls: "text-green-400" },
    invalidated: { icon: "✗", text: "Not an issue",                  cls: "text-gray-500"  },
    reused:      { icon: "↻", text: "Flagged previously, will verify", cls: "text-yellow-400" },
    hypothesis:  { icon: "?", text: "Noticed — needs checking",       cls: "text-gray-400"  },
  }
  return map[status] || { icon: "·", text: status, cls: "text-gray-500" }
}

function ProvenanceSection({ findings }) {
  const groups = {
    verified:    findings.filter(f => f.provenance?.status === "verified"),
    reused:      findings.filter(f => f.provenance?.status === "reused"),
    hypothesis:  findings.filter(f => f.provenance?.status === "hypothesis"),
    invalidated: findings.filter(f => f.provenance?.status === "invalidated"),
  }

  return (
    <div className="space-y-4">
      <h3 className="text-gray-400 text-xs uppercase tracking-wide">What I found</h3>

      {Object.entries(groups).map(([status, items]) => {
        if (!items.length) return null
        const { icon, text, cls } = provenanceLabel(status)
        return (
          <div key={status} className="space-y-1.5">
            <div className={`flex items-center gap-2 text-xs ${cls}`}>
              <span>{icon}</span>
              <span>{text} ({items.length})</span>
            </div>
            {items.map((f, i) => (
              <div key={i} className="ml-5 text-sm text-gray-300 border-l border-gray-800 pl-3">
                <p>{f.summary || f.description || f.finding_id}</p>
                {f.location && (
                  <p className="text-xs text-gray-500 font-mono mt-0.5">{f.location}</p>
                )}
              </div>
            ))}
          </div>
        )
      })}

      {!findings.length && (
        <p className="text-gray-600 text-sm">No findings recorded yet.</p>
      )}
    </div>
  )
}

function EventStory({ events }) {
  if (!events.length) return null

  const significant = events.filter(e =>
    ["state_change", "finding_recorded", "route_selected", "continuation_created", "finding_transitioned"].includes(e.type)
  )

  if (!significant.length) return null

  function eventLabel(e) {
    switch (e.type) {
      case "state_change":      return `State → ${e.metadata?.next_state || "?"}`
      case "finding_recorded":  return `Finding recorded`
      case "route_selected":    return `Route → ${e.metadata?.route_id || "?"}`
      case "continuation_created": return "Handoff created"
      case "finding_transitioned": return `${e.metadata?.reclassified_count || 0} findings updated for route upgrade`
      default: return e.type
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-gray-400 text-xs uppercase tracking-wide">Story</h3>
      <div className="relative">
        <div className="absolute left-1.5 top-0 bottom-0 w-px bg-gray-800" />
        <div className="space-y-3 pl-6">
          {significant.map((e, i) => (
            <div key={i} className="relative">
              <div className="absolute -left-[18px] top-1.5 w-2 h-2 rounded-full bg-gray-700" />
              <div className="flex items-baseline gap-3">
                <span className="text-sm text-gray-300">{eventLabel(e)}</span>
                <span className="text-xs text-gray-600">{timeAgo(e.created_at)}</span>
              </div>
              {e.message && e.message !== eventLabel(e) && (
                <p className="text-xs text-gray-500 mt-0.5">{e.message}</p>
              )}
            </div>
          ))}
        </div>
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

  useEffect(() => { fetchTask() }, [taskId])

  const findings = task?.findings || []
  const openFindings = findings.filter(f =>
    f.provenance?.status === "hypothesis" || f.provenance?.status === "reused"
  )

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-gray-500 hover:text-gray-300 text-sm"
        >
          ← Tasks
        </button>
        {task && (
          <span className="text-gray-600 text-sm">
            {task.short_code && <span className="font-mono">{task.short_code}</span>}
          </span>
        )}
      </div>

      {loading && <p className="text-gray-500 text-sm">Loading task...</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {task && (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-white font-semibold text-base">
                {task.goal || task.name || task.task_type}
              </h2>
              <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                <span>{getRouteLabel(task.current_route)}</span>
                <span className="text-gray-700">·</span>
                <span className={task.state === "active" ? "text-green-400" : "text-gray-500"}>
                  {task.state === "active" ? "Active" : task.state}
                </span>
                <span className="text-gray-700">·</span>
                <span>{timeAgo(task.updated_at)}</span>
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

          {openFindings.length > 0 && (
            <div className="border border-yellow-900/40 bg-yellow-950/20 rounded-lg p-4">
              <p className="text-yellow-400 text-xs font-medium mb-2">
                {openFindings.length} finding{openFindings.length !== 1 ? "s" : ""} to verify in Full mode
              </p>
              <p className="text-gray-400 text-xs">
                Switch to a device with your codebase to confirm or clear these.
              </p>
            </div>
          )}

          <div className="border-t border-gray-800 pt-6">
            <ProvenanceSection findings={findings} />
          </div>

          {events.length > 0 && (
            <div className="border-t border-gray-800 pt-6">
              <EventStory events={events} />
            </div>
          )}

          <div className="border-t border-gray-800 pt-4 flex items-center gap-4">
            <span className="text-xs text-gray-600">v{task.version}</span>
            <span className="text-xs text-gray-600">{findings.length} findings</span>
            <button
              onClick={fetchTask}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              ↻ Refresh
            </button>
          </div>
        </>
      )}

      {showResume && task && (
        <ResumeSheet task={task} onClose={() => setShowResume(false)} />
      )}
    </div>
  )
}
