import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import AnalyticsTab from "../tabs/AnalyticsTab"

const WORKER_URL = "http://localhost:3000"
const TOKEN = "test-token"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// Wraps a data payload in the canonical Worker envelope shape.
function workerEnvelope(data) {
  return { contract_version: "1.0.0", data, meta: { freshness_state: "fresh", generated_at: "" } }
}

// Default mock responses for all four endpoints
function makeDefaultMock({ retroSummary = { artifact_count: 0, signal_breakdown: {}, top_recommendations: [], success: true } } = {}) {
  return vi.fn((url) => {
    if (url.includes("/v1/analytics/resource-use")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(workerEnvelope({
          contract: "analytics.resource_use",
          total_events: 0,
          by_mode: {
            subscription: { count: 0, avg_pressure_score: null, total_estimated_cost_minor: null, avg_packed_context_tokens: null, throttle_events: 0 },
            api_key: { count: 0, avg_pressure_score: null, total_estimated_cost_minor: null, avg_packed_context_tokens: null, throttle_events: 0 },
            hybrid: { count: 0, avg_pressure_score: null, total_estimated_cost_minor: null, avg_packed_context_tokens: null, throttle_events: 0 },
          },
          interpretation: { why_it_matters_now: "" },
          success: true,
        })),
      })
    }
    if (url.includes("/v1/analytics/friction-signals")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(workerEnvelope({ ...retroSummary, interpretation: { why_it_matters_now: "" } })),
      })
    }
    if (url.includes("/v1/analytics/skill-effectiveness")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(workerEnvelope({ skills: [], total_events: 0, interpretation: {}, success: true })),
      })
    }
    if (url.includes("/v1/analytics/autoresearch-runs")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(workerEnvelope({ runs: [], interpretation: {}, success: true })),
      })
    }
    if (url.includes("/v1/analytics/tool-usage")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(workerEnvelope({
          tools: [
            { tool: "Read", count: 2 },
            { tool: "Edit", count: 2 },
            { tool: "Bash", count: 1 },
          ],
          total_events: 5,
          interpretation: {},
          success: true,
        })),
      })
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`))
  })
}

describe("AnalyticsTab — unified /api/contracts/analytics.tool_usage shape (Atom 9)", () => {
  beforeEach(() => {
    global.fetch = makeDefaultMock()
  })

  it("renders Tool Usage section and reads from unified /api/contracts/analytics.tool_usage", async () => {
    render(<AnalyticsTab workerUrl={WORKER_URL} token={TOKEN} />)

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
      if (url.includes("/v1/analytics/resource-use")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(workerEnvelope({
            total_events: 0,
            by_mode: {},
            interpretation: {},
            success: true,
          })),
        })
      }
      if (url.includes("/v1/analytics/friction-signals")) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve(workerEnvelope({ artifact_count: 0, signal_breakdown: {}, top_recommendations: [], success: true })),
        })
      }
      if (url.includes("/v1/analytics/skill-effectiveness")) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve(workerEnvelope({ skills: [], total_events: 0, interpretation: {}, success: true })),
        })
      }
      if (url.includes("/v1/analytics/autoresearch-runs")) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve(workerEnvelope({ runs: [], interpretation: {}, success: true })),
        })
      }
      if (url.includes("/v1/analytics/tool-usage")) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve(workerEnvelope({ tools: [], total_events: 0, interpretation: {}, success: true })),
        })
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    })

    render(<AnalyticsTab workerUrl={WORKER_URL} token={TOKEN} />)

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

    render(<AnalyticsTab workerUrl={WORKER_URL} token={TOKEN} />)

    // wait for loaded signal rows (header renders before data resolves)
    expect(await screen.findByText("loop", {}, { timeout: 5000 })).toBeInTheDocument()
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

    render(<AnalyticsTab workerUrl={WORKER_URL} token={TOKEN} />)

    await waitFor(() => {
      expect(screen.getByText("git-ops")).toBeInTheDocument()
    }, { timeout: 5000 })

    expect(screen.getByText("code-quality")).toBeInTheDocument()
  })

  it("shows empty state when artifact_count is zero", async () => {
    global.fetch = makeDefaultMock({
      retroSummary: { artifact_count: 0, signal_breakdown: {}, top_recommendations: [], success: true },
    })

    render(<AnalyticsTab workerUrl={WORKER_URL} token={TOKEN} />)

    await waitFor(() => {
      expect(screen.getByText(/No retrospective data yet/i)).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it("shows empty state when retrospectives-summary endpoint fails", async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes("/v1/analytics/resource-use")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(workerEnvelope({ total_events: 0, by_mode: {}, interpretation: {}, success: true })),
        })
      }
      if (url.includes("/v1/analytics/friction-signals")) {
        return Promise.reject(new Error("network error"))
      }
      if (url.includes("/v1/analytics/skill-effectiveness")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(workerEnvelope({ skills: [], total_events: 0, interpretation: {}, success: true })) })
      }
      if (url.includes("/v1/analytics/autoresearch-runs")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(workerEnvelope({ runs: [], interpretation: {}, success: true })) })
      }
      if (url.includes("/v1/analytics/tool-usage")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(workerEnvelope({ tools: [], total_events: 0, interpretation: {}, success: true })) })
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    })

    render(<AnalyticsTab workerUrl={WORKER_URL} token={TOKEN} />)

    await waitFor(() => {
      expect(screen.getByText(/No retrospective data yet/i)).toBeInTheDocument()
    }, { timeout: 5000 })
  })
})
