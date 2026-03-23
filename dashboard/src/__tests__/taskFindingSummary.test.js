import { describe, expect, it } from "vitest"
import { summarizeTaskFindings } from "../lib/taskFindingSummary"

const FINDINGS = [
  { finding_id: "q1", type: "question", summary: "Question" },
  { finding_id: "f1", type: "risk", summary: "Hypothesis", provenance: { status: "hypothesis" } },
  { finding_id: "f2", type: "risk", summary: "Reused", provenance: { status: "reused" } },
  { finding_id: "f3", type: "risk", summary: "Verified", provenance: { status: "verified" } },
  { finding_id: "f4", type: "risk", summary: "Invalidated", provenance: { status: "invalidated" } },
]

describe("summarizeTaskFindings", () => {
  it("classifies findings in a single pass-friendly structure", () => {
    const summary = summarizeTaskFindings(FINDINGS)

    expect(summary.questionCount).toBe(1)
    expect(summary.openCount).toBe(2)
    expect(summary.verifiedCount).toBe(1)
    expect(summary.openQuestions.map((finding) => finding.finding_id)).toEqual(["q1"])
    expect(summary.openFindings.map((finding) => finding.finding_id)).toEqual(["f1", "f2"])
    expect(summary.provenanceGroups.map((group) => [group.status, group.items.length])).toEqual([
      ["verified", 1],
      ["reused", 1],
      ["hypothesis", 1],
      ["invalidated", 1],
    ])
  })

  it("returns empty buckets for missing findings", () => {
    const summary = summarizeTaskFindings()

    expect(summary.questionCount).toBe(0)
    expect(summary.openCount).toBe(0)
    expect(summary.verifiedCount).toBe(0)
    expect(summary.openQuestions).toEqual([])
    expect(summary.openFindings).toEqual([])
    expect(summary.provenanceGroups).toEqual([])
  })
})
