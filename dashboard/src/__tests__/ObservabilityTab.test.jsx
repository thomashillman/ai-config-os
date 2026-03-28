import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import ObservabilityTab from "../tabs/ObservabilityTab"

const WORKER = "https://ai-config-os.workers.dev"
const TOKEN = "test-token"

function jsonResp(payload, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  })
}

const DEFAULT_SETTINGS = {
  raw_retention_days: 7,
  summary_retention_days: 90,
  aggregate_retention_days: 365,
  max_events_per_run: 100,
  max_message_length: 2048,
}

const SAMPLE_RUN = {
  run_id: "run-abc123",
  started_at: "2026-03-21T10:00:00.000Z",
  finished_at: "2026-03-21T10:00:03.000Z",
  status: "success",
  expected_version: "0.5.4",
  observed_version: "0.5.4",
  phase_count: 5,
}

const FAILURE_RUN = {
  run_id: "run-fail-xyz",
  started_at: "2026-03-21T09:00:00.000Z",
  finished_at: "2026-03-21T09:00:01.000Z",
  status: "failure",
  first_failed_phase: "worker_package_fetch",
  error_code: "WORKER_PACKAGE_NOT_PUBLISHED",
  phase_count: 2,
  attention_required: true,
  failure_reason_summary: "Run stopped while fetching worker package.",
  next_actions: ["Inspect failed phase logs", "Retry bootstrap"],
  locality: "bootstrap/worker",
  capability: "artifact.fetch",
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// ── Atom 9: Latest run viewer ─────────────────────────────────────────────────

describe("ObservabilityTab — latest run viewer (Atom 9)", () => {
  it("shows latest run status when a run exists", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResp({ runs: [SAMPLE_RUN], latest: SAMPLE_RUN, count: 1 })
    )

    render(<ObservabilityTab workerUrl={WORKER} token={TOKEN} />)

    // Multiple elements expected (latest panel + run list row)
    expect(await screen.findAllByText("success")).not.toHaveLength(0)
    expect(screen.getAllByText("run-abc123")).not.toHaveLength(0)
  })

  it("shows 'no runs recorded' when latest is null", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResp({ runs: [], latest: null, count: 0 })
    )

    render(<ObservabilityTab workerUrl={WORKER} token={TOKEN} />)
    expect(await screen.findByText(/no bootstrap runs recorded/i)).toBeInTheDocument()
  })

  it("shows first_failed_phase when run failed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResp({ runs: [FAILURE_RUN], latest: FAILURE_RUN, count: 1 })
    )

    render(<ObservabilityTab workerUrl={WORKER} token={TOKEN} />)
    expect(await screen.findByText("worker_package_fetch")).toBeInTheDocument()
  })

  it("shows error_code when run failed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResp({ runs: [FAILURE_RUN], latest: FAILURE_RUN, count: 1 })
    )

    render(<ObservabilityTab workerUrl={WORKER} token={TOKEN} />)
    // error_code appears in latest panel and run list row
    expect(await screen.findAllByText("WORKER_PACKAGE_NOT_PUBLISHED")).not.toHaveLength(0)
  })

  it("renders shared signal fields for failed runs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResp({ runs: [FAILURE_RUN], latest: FAILURE_RUN, count: 1 })
    )

    render(<ObservabilityTab workerUrl={WORKER} token={TOKEN} />)
    expect(await screen.findByText(/attention required/i)).toBeInTheDocument()
    expect(screen.getByText("Run stopped while fetching worker package.")).toBeInTheDocument()
    expect(screen.getAllByText("Inspect failed phase logs").length).toBeGreaterThan(0)
  })

  it("shows expected_version and observed_version", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResp({ runs: [SAMPLE_RUN], latest: SAMPLE_RUN, count: 1 })
    )

    render(<ObservabilityTab workerUrl={WORKER} token={TOKEN} />)
    const versionEls = await screen.findAllByText("0.5.4")
    expect(versionEls.length).toBeGreaterThanOrEqual(1)
  })

  it("shows failure badge for failed run", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResp({ runs: [FAILURE_RUN], latest: FAILURE_RUN, count: 1 })
    )

    render(<ObservabilityTab workerUrl={WORKER} token={TOKEN} />)
    // "failure" badge appears in latest panel and run list row
    expect(await screen.findAllByText("failure")).not.toHaveLength(0)
  })

  it("shows loading state while fetching", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}))
    render(<ObservabilityTab workerUrl={WORKER} token={TOKEN} />)
    expect(screen.getAllByText("Loading...").length).toBeGreaterThan(0)
  })
})

// ── Atom 8: Settings panel ────────────────────────────────────────────────────

describe("ObservabilityTab — settings panel (Atom 8)", () => {
  function setupSettingsMock(overrides = {}) {
    vi.spyOn(globalThis, "fetch").mockImplementation((url, opts) => {
      if (url.includes("/v1/observability/runs")) {
        return jsonResp({ runs: [], latest: null, count: 0 })
      }
      if (url.includes("/v1/observability/settings") && opts?.method === "PUT") {
        return overrides.onPut ? overrides.onPut(url, opts) : jsonResp({ ok: true, settings: DEFAULT_SETTINGS })
      }
      if (url.includes("/v1/observability/settings")) {
        return jsonResp({ settings: DEFAULT_SETTINGS })
      }
      return jsonResp({})
    })
  }

  async function renderSettings() {
    setupSettingsMock()

    render(<ObservabilityTab workerUrl={WORKER} token={TOKEN} />)

    // Navigate to settings tab
    const settingsBtn = await screen.findByRole("button", { name: /retention settings/i })
    fireEvent.click(settingsBtn)

    return screen
  }

  it("renders settings tab button", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResp({ runs: [], latest: null, count: 0 })
    )
    render(<ObservabilityTab workerUrl={WORKER} token={TOKEN} />)
    expect(await screen.findByRole("button", { name: /retention settings/i })).toBeInTheDocument()
  })

  it("loads and displays current retention settings", async () => {
    await renderSettings()
    await waitFor(() => {
      expect(screen.getByTestId("setting-raw_retention_days")).toBeInTheDocument()
    })
    const input = screen.getByTestId("setting-raw_retention_days")
    expect(input.value).toBe("7")
  })

  it("shows all five settings fields", async () => {
    await renderSettings()
    await waitFor(() => {
      expect(screen.getByTestId("setting-raw_retention_days")).toBeInTheDocument()
    })
    const fields = [
      "raw_retention_days",
      "summary_retention_days",
      "aggregate_retention_days",
      "max_events_per_run",
      "max_message_length",
    ]
    for (const f of fields) {
      expect(screen.getByTestId(`setting-${f}`)).toBeInTheDocument()
    }
  })

  it("shows save button", async () => {
    await renderSettings()
    await waitFor(() => {
      expect(screen.getByTestId("save-settings-btn")).toBeInTheDocument()
    })
  })

  it("saves settings and shows confirmation", async () => {
    setupSettingsMock({
      onPut: (url, opts) => {
        const body = JSON.parse(opts.body)
        return jsonResp({ ok: true, settings: body })
      },
    })

    render(<ObservabilityTab workerUrl={WORKER} token={TOKEN} />)
    const settingsBtn = await screen.findByRole("button", { name: /retention settings/i })
    fireEvent.click(settingsBtn)
    await waitFor(() => screen.getByTestId("save-settings-btn"))

    fireEvent.click(screen.getByTestId("save-settings-btn"))
    expect(await screen.findByText(/settings saved/i)).toBeInTheDocument()
  })

  it("shows validation error when server rejects settings", async () => {
    setupSettingsMock({
      onPut: () =>
        jsonResp(
          { error: "Validation failed", details: ["Field 'raw_retention_days' must be between 1 and 30 (got 999)"] },
          400
        ),
    })

    render(<ObservabilityTab workerUrl={WORKER} token={TOKEN} />)
    const settingsBtn = await screen.findByRole("button", { name: /retention settings/i })
    fireEvent.click(settingsBtn)
    await waitFor(() => screen.getByTestId("save-settings-btn"))
    fireEvent.click(screen.getByTestId("save-settings-btn"))

    expect(await screen.findByText(/raw_retention_days/i)).toBeInTheDocument()
  })
})
