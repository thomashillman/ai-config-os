export function aggregateToolMetrics(metrics = []) {
  const counts = {}
  for (const metric of metrics) {
    const tool = metric?.tool
    if (!tool) continue
    counts[tool] = (counts[tool] || 0) + 1
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([tool, count]) => ({ tool, count }))
}

export function mapSkillEffectivenessModel(skillData) {
  const skills = Array.isArray(skillData?.skills) ? skillData.skills : []
  return {
    totalEvents: skillData?.total_events || 0,
    rows: skills.map((skill) => ({
      skill: skill.skill,
      used: skill.used || 0,
      replaced: skill.replaced || 0,
      total: skill.total || 0,
      useRate: skill.use_rate || 0,
      attentionFlags: skill.use_rate < 50 ? [{ kind: "low-use-rate", label: "Consider /autoresearch" }] : [],
    })),
  }
}

export function mapAutoresearchRunsModel(runs = []) {
  return runs.map((run) => ({
    ...run,
    deltaLabel: run.improved_by == null ? null : run.improved_by > 0 ? `+${run.improved_by}pp` : run.improved_by === 0 ? "flat" : `${run.improved_by}pp`,
  }))
}

export function mapRetroSummaryModel(retroSummary) {
  const artifactCount = retroSummary?.artifact_count || 0
  const signalBreakdown = retroSummary?.signal_breakdown || {}
  const topRecommendations = Array.isArray(retroSummary?.top_recommendations) ? retroSummary.top_recommendations : []

  return {
    artifactCount,
    signalEntries: Object.entries(signalBreakdown).sort((a, b) => b[1] - a[1]),
    topRecommendations,
  }
}
