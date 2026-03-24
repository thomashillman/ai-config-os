const PROVENANCE_GROUPS = {
  verified: {
    icon: "✓",
    label: "Confirmed here",
    cls: "text-green-400",
  },
  reused: {
    icon: "↻",
    label: "Flagged in prior session, will verify",
    cls: "text-yellow-400",
  },
  hypothesis: {
    icon: "·",
    label: "Noticed — needs checking",
    cls: "text-gray-400",
  },
  invalidated: {
    icon: "✗",
    label: "Not an issue",
    cls: "text-gray-600",
  },
}

export function summarizeTaskFindings(findings = []) {
  const summary = {
    openQuestions: [],
    openFindings: [],
    verifiedCount: 0,
    questionCount: 0,
    openCount: 0,
    provenanceGroups: Object.entries(PROVENANCE_GROUPS).map(([status, config]) => ({
      status,
      ...config,
      items: [],
    })),
  }

  const groupsByStatus = Object.fromEntries(
    summary.provenanceGroups.map((group) => [group.status, group])
  )

  for (const finding of findings) {
    if (finding?.type === "question") {
      summary.openQuestions.push(finding)
      summary.questionCount += 1
      continue
    }

    const status = finding?.provenance?.status

    if (status === "verified") {
      summary.verifiedCount += 1
    }

    if (status === "hypothesis" || status === "reused") {
      summary.openFindings.push(finding)
      summary.openCount += 1
    }

    const group = groupsByStatus[status]
    if (group) {
      group.items.push(finding)
    }
  }

  summary.provenanceGroups = summary.provenanceGroups.filter((group) => group.items.length > 0)

  return summary
}
