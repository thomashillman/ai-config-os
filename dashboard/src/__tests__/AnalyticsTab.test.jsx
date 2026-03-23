import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import AnalyticsTab from "../tabs/AnalyticsTab"

const API = "http://localhost:3000/api"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("AnalyticsTab — unified /api/analytics shape (Atom 9)", () => {
  beforeEach(() => {
    global.fetch = vi.fn((url) => {
      if (url.includes("/analytics")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            metrics: [
              { tool: "Read", timestamp: "2026-03-23T10:00:00Z" },
              { tool: "Read", timestamp: "2026-03-23T10:01:00Z" },
              { tool: "Bash", timestamp: "2026-03-23T10:02:00Z" },
              { tool: "Edit", timestamp: "2026-03-23T10:03:00Z" },
              { tool: "Edit", timestamp: "2026-03-23T10:04:00Z" },
            ],
            success: true,
            effectiveOutcomeContract: {},
          }),
        })
      }
      if (url.includes("/skill-analytics")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ skills: [], total_events: 0, success: true }),
        })
      }
      if (url.includes("/autoresearch-runs")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ runs: [], success: true }),
        })
      }
      return Promise.reject(new Error("unexpected fetch"))
    })
  })

  it("renders Tool Usage section and reads from unified /api/analytics", async () => {
    render(<AnalyticsTab api={API} />)

    // Wait for metrics to be loaded and displayed (not empty state)
    await waitFor(() => {
      expect(screen.queryByText(/No tool usage data yet/i)).not.toBeInTheDocument()
    }, { timeout: 5000 })

    // Verify individual tool names are rendered (they appear in the metrics list)
    const readElements = screen.getAllByText(/Read/i)
    expect(readElements.length).toBeGreaterThan(0)
    const editElements = screen.getAllByText(/Edit/i)
    expect(editElements.length).toBeGreaterThan(0)
    const bashElements = screen.getAllByText(/Bash/i)
    expect(bashElements.length).toBeGreaterThan(0)
  })

  it("shows empty state when no metrics present in unified response", async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes("/analytics")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ metrics: [], success: true }),
        })
      }
      if (url.includes("/skill-analytics")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ skills: [], total_events: 0, success: true }),
        })
      }
      if (url.includes("/autoresearch-runs")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ runs: [], success: true }),
        })
      }
      return Promise.reject(new Error("unexpected fetch"))
    })

    render(<AnalyticsTab api={API} />)

    await waitFor(() => {
      expect(screen.getByText(/No tool usage data yet/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })
})
