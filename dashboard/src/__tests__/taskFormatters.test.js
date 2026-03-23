import { describe, it, expect } from "vitest"
import { routeLabel, stateLabel, readErrorMessage } from "../lib/taskFormatters"

describe("routeLabel", () => {
  it('returns "Full" for local_repo', () => {
    expect(routeLabel("local_repo")).toBe("Full")
  })

  it('returns "Cloud · PR" for github_pr', () => {
    expect(routeLabel("github_pr")).toBe("Cloud · PR")
  })

  it('returns "Cloud" for unknown routes', () => {
    expect(routeLabel("pasted_diff")).toBe("Cloud")
    expect(routeLabel("")).toBe("Cloud")
    expect(routeLabel(undefined)).toBe("Cloud")
  })
})

describe("stateLabel", () => {
  it('returns green Active for active', () => {
    const result = stateLabel("active")
    expect(result.text).toBe("Active")
    expect(result.cls).toContain("green")
  })

  it('returns Done for complete', () => {
    const result = stateLabel("complete")
    expect(result.text).toBe("Done")
  })

  it('returns Paused for paused', () => {
    const result = stateLabel("paused")
    expect(result.text).toBe("Paused")
  })

  it('returns raw state text for unknown state', () => {
    const result = stateLabel("archived")
    expect(result.text).toBe("archived")
  })
})

describe("readErrorMessage", () => {
  it("extracts error.message from JSON response", async () => {
    const mockResponse = {
      json: () => Promise.resolve({ error: { message: "something went wrong" } }),
    }
    const result = await readErrorMessage(mockResponse, "fallback")
    expect(result).toBe("something went wrong")
  })

  it("extracts top-level message from JSON response", async () => {
    const mockResponse = {
      json: () => Promise.resolve({ message: "top level error" }),
    }
    const result = await readErrorMessage(mockResponse, "fallback")
    expect(result).toBe("top level error")
  })

  it("returns fallback when response.json() rejects", async () => {
    const mockResponse = {
      json: () => Promise.reject(new Error("not json")),
    }
    const result = await readErrorMessage(mockResponse, "fallback message")
    expect(result).toBe("fallback message")
  })
})
