import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import AnalyticsTab from "../tabs/AnalyticsTab"

const API = "http://localhost:3000/api"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// Default mock responses for all four endpoints
function makeDefaultMock({ retroSummary = { artifact_count: 0, signal_breakdown: {}, top_recommendations: [], success: true } } = {}) {
  return vi.fn((url) => {
    if (url.includes("/retrospectives-summary")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(retroSummary),
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
    return Promise.reject(new Error(`unexpected fetch: ${url}`))
  })
}

describe("AnalyticsTab — unified /api/analytics shape (Atom 9)", () => {
  beforeEach(() => {
    global.fetch = makeDefaultMock()
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
      if (url.includes("/retrospectives-summary")) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ artifact_count: 0, signal_breakdown: {}, top_recommendations: [], success: true }),
        })
      }
      if (url.includes("/skill-analytics")) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ skills: [], total_events: 0, success: true }),
        })
      }
      if (url.includes("/autoresearch-runs")) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ runs: [], success: true }),
        })
      }
      if (url.includes("/analytics")) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ metrics: [], success: true }),
        })
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    })

    render(<AnalyticsTab api={API} />)

    await waitFor(() => {
      expect(screen.getByText(/No tool usage data yet/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })
})

describe("AnalyticsTab — Friction Signals section", () => {
  it("renders signal breakdown bars when retrospective data is present", async () => {
    global.fetch = makeDefaultMock({
      retroSummary: {
        artifact_count: 2,
        signal_breakdown: { loop: 3, error: 1 },
        top_recommendations: [],
        success: true,
      },
    })

    render(<AnalyticsTab api={API} />)

    await waitFor(() => {
      expect(screen.getByText(/Friction Signals/i)).toBeInTheDocument()
    }, { timeout: 5000 })

    // signal type labels should be visible
    expect(screen.getByText("loop")).toBeInTheDocument()
    expect(screen.getByText("error")).toBeInTheDocument()
    // retro count shown in section header — wrapped as "(2 retros)" by SectionHeader
    expect(screen.getByText("(2 retros)")).toBeInTheDocument()
  })

  it("renders top recommendations when present", async () => {
    global.fetch = makeDefaultMock({
      retroSummary: {
        artifact_count: 1,
        signal_breakdown: { loop: 1 },
        top_recommendations: [
          { name: "git-ops", category: "code-quality", occurrences: 3, priority_distribution: { high: 2 } },
        ],
        success: true,
      },
    })

    render(<AnalyticsTab api={API} />)

    await waitFor(() => {
      expect(screen.getByText("git-ops")).toBeInTheDocument()
    }, { timeout: 5000 })

    expect(screen.getByText("code-quality")).toBeInTheDocument()
  })

  it("shows empty state when artifact_count is zero", async () => {
    global.fetch = makeDefaultMock({
      retroSummary: { artifact_count: 0, signal_breakdown: {}, top_recommendations: [], success: true },
    })

    render(<AnalyticsTab api={API} />)

    await waitFor(() => {
      expect(screen.getByText(/No retrospective data yet/i)).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it("shows empty state when retrospectives-summary endpoint fails", async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes("/retrospectives-summary")) {
        return Promise.reject(new Error("network error"))
      }
      if (url.includes("/skill-analytics")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ skills: [], total_events: 0, success: true }) })
      }
      if (url.includes("/autoresearch-runs")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ runs: [], success: true }) })
      }
      if (url.includes("/analytics")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ metrics: [], success: true }) })
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    })

    render(<AnalyticsTab api={API} />)

    await waitFor(() => {
      expect(screen.getByText(/No retrospective data yet/i)).toBeInTheDocument()
    }, { timeout: 5000 })
  })
})
