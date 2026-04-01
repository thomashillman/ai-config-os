import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getWorkerBaseUrl, getWorkerToken } from "../lib/workerClient"

describe("getWorkerBaseUrl", () => {
  beforeEach(() => {
    delete window.__AI_CONFIG_WORKER
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    delete window.__AI_CONFIG_WORKER
    vi.unstubAllEnvs()
  })

  it("prefers window.__AI_CONFIG_WORKER over env", () => {
    vi.stubEnv("VITE_WORKER_URL", "https://from-env.example")
    window.__AI_CONFIG_WORKER = "https://from-window.example/"
    expect(getWorkerBaseUrl()).toBe("https://from-window.example")
  })

  it("strips trailing slashes from window URL", () => {
    window.__AI_CONFIG_WORKER = "https://w.example///"
    expect(getWorkerBaseUrl()).toBe("https://w.example")
  })

  it("uses VITE_WORKER_URL when window is unset", () => {
    vi.stubEnv("VITE_WORKER_URL", "  https://env-only.example  ")
    expect(getWorkerBaseUrl()).toBe("https://env-only.example")
  })

  it("falls back to default host when unset", () => {
    expect(getWorkerBaseUrl()).toBe("https://ai-config-os.workers.dev")
  })
})

describe("getWorkerToken", () => {
  beforeEach(() => {
    delete window.__AI_CONFIG_TOKEN
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    delete window.__AI_CONFIG_TOKEN
    vi.unstubAllEnvs()
  })

  it("prefers window.__AI_CONFIG_TOKEN over env", () => {
    vi.stubEnv("VITE_AUTH_TOKEN", "env-token")
    window.__AI_CONFIG_TOKEN = "window-token"
    expect(getWorkerToken()).toBe("window-token")
  })

  it("uses VITE_AUTH_TOKEN when window is unset", () => {
    vi.stubEnv("VITE_AUTH_TOKEN", "secret")
    expect(getWorkerToken()).toBe("secret")
  })

  it("returns empty string when unset", () => {
    vi.stubEnv("VITE_AUTH_TOKEN", "")
    expect(getWorkerToken()).toBe("")
  })
})
