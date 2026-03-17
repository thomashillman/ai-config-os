import { useState } from "react"
import ToolsTab from "./tabs/ToolsTab"
import SkillsTab from "./tabs/SkillsTab"
import ContextCostTab from "./tabs/ContextCostTab"
import ConfigTab from "./tabs/ConfigTab"
import AuditTab from "./tabs/AuditTab"
import AnalyticsTab from "./tabs/AnalyticsTab"
import HubTab from "./tabs/HubTab"

const TABS = [
  { id: "hub", label: "Tasks" },
  { id: "tools", label: "Tools" },
  { id: "skills", label: "Skills" },
  { id: "context", label: "Context Cost" },
  { id: "config", label: "Config" },
  { id: "audit", label: "Audit" },
  { id: "analytics", label: "Analytics" },
]

const API = "http://localhost:4242/api"

export default function App() {
  const [activeTab, setActiveTab] = useState("hub")

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
        {activeTab === "hub" && <HubTab api={API} />}
        {activeTab === "tools" && <ToolsTab api={API} />}
        {activeTab === "skills" && <SkillsTab api={API} />}
        {activeTab === "context" && <ContextCostTab api={API} />}
        {activeTab === "config" && <ConfigTab api={API} />}
        {activeTab === "audit" && <AuditTab api={API} />}
        {activeTab === "analytics" && <AnalyticsTab api={API} />}
      </main>
    </div>
  )
}
