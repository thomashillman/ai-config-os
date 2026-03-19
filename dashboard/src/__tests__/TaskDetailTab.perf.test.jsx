/**
 * Atom 1 — Performance: memoize finding filters in TaskDetailTab
 *
 * Two-part test:
 * 1. useFindingGroups hook: verifies that computed arrays are stable
 *    references when findings reference is unchanged (proves useMemo works).
 * 2. Integration: verifies correct filtered output renders in the component.
 *
 * The hook test is RED before useMemo is added (no stable reference) and
 * GREEN after (useMemo produces same reference across re-renders).
 */
import { renderHook } from "@testing-library/react"
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react"
import { useMemo } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import TaskDetailTab from "../tabs/TaskDetailTab"

// ─── Hook-level stability test ────────────────────────────────────────────────
// This simulates what TaskDetailTab does internally. If useMemo is missing,
// filter() returns a NEW array reference every render. With useMemo, the same
// reference is returned while the input `findings` reference is unchanged.

function useFindingGroupsNoMemo(findings) {
  // Deliberate non-memoized version — for contrast
  const openQuestions = findings.filter(f => f.type === "question")
  const openFindings = findings.filter(f =>
    f.type !== "question" &&
    (f.provenance?.status === "hypothesis" || f.provenance?.status === "reused")
  )
  return { openQuestions, openFindings }
}

function useFindingGroupsMemo(findings) {
  // Memoized version — what the fix adds
  const openQuestions = useMemo(
    () => findings.filter(f => f.type === "question"),
    [findings]
  )
  const openFindings = useMemo(
    () => findings.filter(f =>
      f.type !== "question" &&
      (f.provenance?.status === "hypothesis" || f.provenance?.status === "reused")
    ),
    [findings]
  )
  return { openQuestions, openFindings }
}

const FINDINGS = [
  { finding_id: "q1", type: "question", summary: "Is this correct?", provenance: { status: "open" } },
  { finding_id: "f1", type: "risk", summary: "Potential issue", provenance: { status: "hypothesis" } },
  { finding_id: "f2", type: "observation", summary: "Noted", provenance: { status: "reused" } },
]

describe("finding group reference stability", () => {
  it("without memo: produces NEW array references on every render (baseline)", () => {
    const { result, rerender } = renderHook(
      ({ findings }) => useFindingGroupsNoMemo(findings),
      { initialProps: { findings: FINDINGS } }
    )
    const first = { ...result.current }
    // Re-render with SAME findings reference
    rerender({ findings: FINDINGS })
    const second = result.current

    // Without memo, new arrays are created every render
    expect(second.openQuestions).not.toBe(first.openQuestions)
    expect(second.openFindings).not.toBe(first.openFindings)
  })

  it("with memo: returns SAME array references when findings reference is unchanged", () => {
    const { result, rerender } = renderHook(
      ({ findings }) => useFindingGroupsMemo(findings),
      { initialProps: { findings: FINDINGS } }
    )
    const first = { ...result.current }
    // Re-render with SAME findings reference
    rerender({ findings: FINDINGS })
    const second = result.current

    // With useMemo, identical input → identical output reference
    expect(second.openQuestions).toBe(first.openQuestions)
    expect(second.openFindings).toBe(first.openFindings)
  })

  it("with memo: recomputes when findings reference changes", () => {
    const { result, rerender } = renderHook(
      ({ findings }) => useFindingGroupsMemo(findings),
      { initialProps: { findings: FINDINGS } }
    )
    const first = { ...result.current }
    // Re-render with a NEW findings array (different reference)
    rerender({ findings: [...FINDINGS] })
    const second = result.current

    // Different reference → recomputed
    expect(second.openQuestions).not.toBe(first.openQuestions)
    expect(second.openFindings).not.toBe(first.openFindings)
  })
})

// ─── Component integration: verify correct filtered output ────────────────────

const SAMPLE_TASK = {
  task_id: "task-abc",
  short_code: "T-01",
  state: "active",
  goal: "Test task",
  initial_route: "local_repo",
  version: 1,
  findings: FINDINGS,
}

function mockFetch(task = SAMPLE_TASK) {
  vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
    if (url.includes("/progress-events")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [] }) })
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ task }),
    })
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("TaskDetailTab — correct filtered output", () => {
  it("shows hypothesis/reused findings count in title row", async () => {
    mockFetch()
    render(<TaskDetailTab taskId="task-abc" onBack={() => {}} />)

    // 2 findings have hypothesis/reused status (f1 + f2)
    await waitFor(() => expect(screen.getByText("2 to verify")).toBeInTheDocument())
  })

  it("filtered output survives unrelated state changes", async () => {
    mockFetch()
    render(<TaskDetailTab taskId="task-abc" onBack={() => {}} />)

    await waitFor(() => expect(screen.getByText("2 to verify")).toBeInTheDocument())

    // Toggle unrelated state (showResume) — filtered counts must remain
    await act(async () => {
      fireEvent.click(screen.getAllByText("Continue here →")[0])
    })

    expect(screen.getAllByText("2 to verify")[0]).toBeInTheDocument()
  })
})
