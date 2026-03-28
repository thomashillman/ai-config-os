import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import ToolsTab from "../tabs/ToolsTab"
import SkillsTab from "../tabs/SkillsTab"
import ContextCostTab from "../tabs/ContextCostTab"
import ConfigTab from "../tabs/ConfigTab"

function jsonResponse(payload) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(payload),
  })
}

function contractResponse(data) {
  return jsonResponse({
    data,
    success: true,
    summary: "ok",
    capability: {},
    meta: {},
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("dashboard findings", () => {
  it("renders outcome contract details from the API response", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      jsonResponse({
        output: "ok",
        success: true,
        effectiveOutcomeContract: {
          status: "Degraded",
          selectedRoute: "manual-input-correction",
          missingCapabilities: ["shell.exec"],
          requiredUserInput: ["Retry in a higher capability environment"],
        },
      }),
    )

    render(<ToolsTab api="http://localhost:4242/api" />)

    expect(await screen.findByText("Degraded")).toBeInTheDocument()
    expect(screen.getByText("manual-input-correction")).toBeInTheDocument()
  })

  it("renders supported variants from the skills.list contract", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      contractResponse({
        contract: "skills.list",
        skills: [
          {
            name: "code-review",
            type: "core",
            status: "stable",
            opus: true,
            sonnet: true,
            haiku: false,
            tests: 4,
          },
        ],
        interpretation: {
          why_it_matters_now: "Current skill inventory and readiness.",
        },
        effectiveOutcomeContract: { status: "Full" },
        success: true,
      }),
    )

    render(<SkillsTab api="http://localhost:4242/api" />)

    const row = await screen.findByTestId("skill-row-code-review")

    expect(within(row).getByText("stable")).toBeInTheDocument()
    expect(within(row).getByText("4")).toBeInTheDocument()
    expect(within(row).getAllByText("✓")).toHaveLength(2)
  })

  it("does not keep mojibake checkmark sentinels in SkillsTab source", () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url))
    const componentPath = path.resolve(currentDir, "..", "tabs", "SkillsTab.jsx")
    const source = fs.readFileSync(componentPath, "utf8")

    expect(source).not.toContain("âœ“")
  })

  it("provides utility CSS definitions used by JSX class names", () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url))
    const cssPath = path.resolve(currentDir, "..", "index.css")
    const css = fs.readFileSync(cssPath, "utf8")

    expect(css).toContain(".bg-gray-950")
    expect(css).toContain(".text-gray-100")
    expect(css).toContain(".min-h-screen")
    expect(css).toContain(".flex")
  })

  it("shows an actionable error when context-cost fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"))

    render(<ContextCostTab api="http://localhost:4242/api" />)

    await waitFor(() =>
      expect(screen.getByText("Could not connect to dashboard API")).toBeInTheDocument(),
    )
  })

  it("shows an actionable error when config fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"))

    render(<ConfigTab api="http://localhost:4242/api" />)

    await waitFor(() =>
      expect(screen.getByText("Could not connect to dashboard API")).toBeInTheDocument(),
    )
  })
})
