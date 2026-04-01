import { Suspense, lazy, useMemo, useState } from "react"
import { getWorkerBaseUrl, getWorkerToken } from "./lib/workerClient"

const ToolsTab = lazy(() => import("./tabs/ToolsTab"))
const SkillsTab = lazy(() => import("./tabs/SkillsTab"))
const ContextCostTab = lazy(() => import("./tabs/ContextCostTab"))
const ConfigTab = lazy(() => import("./tabs/ConfigTab"))
const AuditTab = lazy(() => import("./tabs/AuditTab"))
const AnalyticsTab = lazy(() => import("./tabs/AnalyticsTab"))
const HubTab = lazy(() => import("./tabs/HubTab"))
const ObservabilityTab = lazy(() => import("./tabs/ObservabilityTab"))

const TABS = [
  { id: "hub", label: "Tasks" },
  { id: "tools", label: "Tools" },
  { id: "skills", label: "Skills" },
  { id: "context", label: "Context Cost" },
  { id: "config", label: "Config" },
  { id: "audit", label: "Audit" },
  { id: "analytics", label: "Analytics" },
  { id: "observability", label: "Bootstrap Runs" },
]

const WORKER_URL = getWorkerBaseUrl()
const WORKER_TOKEN = getWorkerToken()

function TabPanel({ activeTab }) {
  switch (activeTab) {
    case "hub":
      return <HubTab workerUrl={WORKER_URL} token={WORKER_TOKEN} />
    case "tools":
      return <ToolsTab workerUrl={WORKER_URL} token={WORKER_TOKEN} />
    case "skills":
      return <SkillsTab workerUrl={WORKER_URL} token={WORKER_TOKEN} />
    case "context":
      return <ContextCostTab workerUrl={WORKER_URL} token={WORKER_TOKEN} />
    case "config":
      return <ConfigTab workerUrl={WORKER_URL} token={WORKER_TOKEN} />
    case "audit":
      return <AuditTab workerUrl={WORKER_URL} token={WORKER_TOKEN} />
    case "analytics":
      return <AnalyticsTab workerUrl={WORKER_URL} token={WORKER_TOKEN} />
    case "observability":
      return <ObservabilityTab workerUrl={WORKER_URL} token={WORKER_TOKEN} />
    default:
      return <HubTab workerUrl={WORKER_URL} token={WORKER_TOKEN} />
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState("hub")

  const activeTabLabel = useMemo(
    () => TABS.find(tab => tab.id === activeTab)?.label ?? "Tasks",
    [activeTab]
  )

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-mono text-sm">
      <header className="border-b border-gray-800 px-6 py-3 flex items-center gap-4">
        <span className="text-gray-400 font-semibold tracking-wide">ai-config-os</span>
        <nav className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-1 rounded text-xs transition-colors ${
                activeTab === t.id
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="p-6">
        <Suspense fallback={<p className="text-gray-600 text-sm">Loading {activeTabLabel}…</p>}>
          <TabPanel activeTab={activeTab} />
        </Suspense>
      </main>
    </div>
  )
}
