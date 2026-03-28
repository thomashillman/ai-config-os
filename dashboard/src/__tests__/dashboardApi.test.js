// Tests for dashboard/src/lib/dashboardApi.js
//
// Runs via: cd dashboard && npm test
// Framework: Vitest (matches existing dashboard test suite).

import { describe, it, expect } from "vitest"
import { getOutcomeContract, buildFetchError } from "../lib/dashboardApi"

describe("getOutcomeContract", () => {
  it("returns null for null input", () => {
    expect(getOutcomeContract(null)).toBeNull()
  })

  it("returns null for undefined input", () => {
    expect(getOutcomeContract(undefined)).toBeNull()
  })

  it("extracts effectiveOutcomeContract when present", () => {
    const contract = { status: "Full", selectedRoute: "local" }
    const payload = { effectiveOutcomeContract: contract, output: "some output" }
    expect(getOutcomeContract(payload)).toBe(contract)
  })

  it("returns the payload itself when effectiveOutcomeContract is absent", () => {
    const payload = { status: "Full", output: "raw payload" }
    expect(getOutcomeContract(payload)).toBe(payload)
  })

  it("falls back to the payload itself when effectiveOutcomeContract is null", () => {
    const payload = { effectiveOutcomeContract: null }
    expect(getOutcomeContract(payload)).toBe(payload)
  })
})

describe("buildFetchError", () => {
  it("returns a degraded contract with success=false", () => {
    const result = buildFetchError()
    expect(result.success).toBe(false)
  })

  it("includes the default message in output", () => {
    const result = buildFetchError()
    expect(result.output).toContain("Could not connect")
  })

  it("uses a custom message when provided", () => {
    const result = buildFetchError("API timed out")
    expect(result.output).toBe("API timed out")
  })

  it("effectiveOutcomeContract has Degraded status", () => {
    const { effectiveOutcomeContract: c } = buildFetchError()
    expect(c.status).toBe("Degraded")
  })

  it("effectiveOutcomeContract declares dashboard-api-connectivity as missing", () => {
    const { effectiveOutcomeContract: c } = buildFetchError()
    expect(c.missingCapabilities).toContain("dashboard-api-connectivity")
  })

  it("effectiveOutcomeContract has required guidance fields", () => {
    const { effectiveOutcomeContract: c } = buildFetchError()
    expect(typeof c.guidanceEquivalentRoute).toBe("string")
    expect(typeof c.guidanceFullWorkflowHigherCapabilityEnvironment).toBe("string")
    expect(Array.isArray(c.requiredUserInput)).toBe(true)
    expect(c.requiredUserInput.length).toBeGreaterThan(0)
  })

  it("effectiveOutcomeContract has manual-input-correction selectedRoute", () => {
    const { effectiveOutcomeContract: c } = buildFetchError()
    expect(c.selectedRoute).toBe("manual-input-correction")
  })
})

describe("getOutcomeContract — canonical envelope support", () => {
  it("returns null for a canonical success envelope (no degraded panel needed)", () => {
    const envelope = {
      contract_version: "1.0.0",
      resource: "skills.list",
      data: { skills: [] },
      summary: "Loaded.",
      capability: { local_only: true, worker_backed: false, remote_safe: false, tunnel_required: true, unavailable_on_surface: false },
      suggested_actions: [],
    }
    expect(getOutcomeContract(envelope)).toBeNull()
  })

  it("normalises a canonical error envelope into degraded shape for ResponseContractPanel", () => {
    const envelope = {
      contract_version: "1.0.0",
      resource: "skills.list",
      data: null,
      summary: "Dashboard API request failed.",
      capability: { local_only: true, worker_backed: false, remote_safe: false, tunnel_required: true, unavailable_on_surface: false },
      suggested_actions: [],
      error: { code: "internal_error", message: "Script failed", hint: "Check dashboard logs." },
    }
    const result = getOutcomeContract(envelope)
    expect(result).not.toBeNull()
    expect(result.status).toBe("Degraded")
    expect(result.selectedRoute).toBe("manual-input-correction")
    expect(result.missingCapabilities).toContain("internal_error")
    expect(result.requiredUserInput[0]).toMatch(/Check dashboard logs/)
    expect(result.guidanceEquivalentRoute).toBe("Script failed")
  })

  it("still extracts legacy effectiveOutcomeContract when contract_version is absent", () => {
    const contract = { status: "Full", selectedRoute: "local" }
    const payload = { effectiveOutcomeContract: contract, output: "raw" }
    expect(getOutcomeContract(payload)).toBe(contract)
  })
})
