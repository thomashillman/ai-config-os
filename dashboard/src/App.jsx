import { Suspense, lazy, useMemo, useState } from "react"

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

const API = "http://localhost:4242/api"
const WORKER_URL = typeof window !== "undefined"
  ? (window.__AI_CONFIG_WORKER ?? "https://ai-config-os.workers.dev")
  : "https://ai-config-os.workers.dev"
const WORKER_TOKEN = typeof window !== "undefined"
  ? (window.__AI_CONFIG_TOKEN ?? "")
  : ""

function TabPanel({ activeTab }) {
  switch (activeTab) {
    case "hub":
      return <HubTab api={API} />
    case "tools":
      return <ToolsTab api={API} />
    case "skills":
      return <SkillsTab api={API} />
    case "context":
      return <ContextCostTab api={API} />
    case "config":
      return <ConfigTab api={API} />
    case "audit":
      return <AuditTab api={API} />
    case "analytics":
      return <AnalyticsTab api={API} />
    case "observability":
      return <ObservabilityTab workerUrl={WORKER_URL} token={WORKER_TOKEN} />
    default:
      return <HubTab api={API} />
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
      <header className="border-b border-gray-800 px-6 flex items-center gap-4">
        <span className="text-gray-200 font-semibold tracking-wide py-3 flex-shrink-0">ai-config-os</span>
        <span className="w-px h-4 bg-gray-800 flex-shrink-0" />
        <nav className="flex gap-0 overflow-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-3 text-xs transition-colors whitespace-nowrap border-b-2 ${
                activeTab === t.id
                  ? "text-white border-white"
                  : "text-gray-500 border-transparent hover:text-gray-300"
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
