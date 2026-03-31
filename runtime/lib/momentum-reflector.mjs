// Momentum Reflector — analyzes narration effectiveness and proposes improvements.
// Pure function: takes observation data in, returns report out.
// v1: report-only, no auto-apply.

function classifyEngagement(observations) {
  const byPoint = {};

  for (const { narration, response } of observations) {
    const point = narration?.metadata?.narration_point;
    if (!point) continue;

    if (!byPoint[point]) {
      byPoint[point] = {
        total: 0,
        engaged: 0,
        ignored: 0,
        upgrade_accepted: 0,
        upgrade_declined: 0,
      };
    }

    byPoint[point].total += 1;
    const responseType = response?.metadata?.response_type;
    if (
      responseType === "engaged" ||
      responseType === "follow_up" ||
      responseType === "accepted_upgrade"
    ) {
      byPoint[point].engaged += 1;
    }
    if (responseType === "ignored") {
      byPoint[point].ignored += 1;
    }
    if (responseType === "accepted_upgrade") {
      byPoint[point].upgrade_accepted += 1;
    }
    if (responseType === "declined_upgrade") {
      byPoint[point].upgrade_declined += 1;
    }
  }

  return byPoint;
}

function findTemplateEffectivenessInsights(engagementByPoint, insightIndex) {
  const insights = [];

  const points = Object.keys(engagementByPoint);
  if (points.length < 2) return insights;

  // Find points with significantly different engagement rates
  const rates = points.map((point) => {
    const data = engagementByPoint[point];
    return {
      point,
      rate: data.total > 0 ? data.engaged / data.total : 0,
      total: data.total,
    };
  });

  rates.sort((a, b) => b.rate - a.rate);

  const best = rates[0];
  const worst = rates[rates.length - 1];

  if (best.total >= 3 && worst.total >= 3 && best.rate - worst.rate > 0.2) {
    insights.push({
      id: `insight_${String(insightIndex.value++).padStart(3, "0")}`,
      type: "template_effectiveness",
      finding: `'${best.point}' narrations get ${(best.rate * 100).toFixed(0)}% engagement vs ${(worst.rate * 100).toFixed(0)}% for '${worst.point}'`,
      evidence: {
        best_point: best.point,
        best_rate: Number(best.rate.toFixed(2)),
        best_total: best.total,
        worst_point: worst.point,
        worst_rate: Number(worst.rate.toFixed(2)),
        worst_total: worst.total,
      },
      suggestion: {
        target: `templates.${worst.point}`,
        current: null,
        proposed: null,
        confidence: Math.min(0.9, (best.rate - worst.rate) * 1.5),
      },
    });
  }

  return insights;
}

function findUpgradeAcceptanceInsights(engagementByPoint, insightIndex) {
  const insights = [];

  const upgradeData = engagementByPoint.onUpgradeAvailable;
  if (!upgradeData || upgradeData.total < 2) return insights;

  const acceptRate =
    upgradeData.upgrade_accepted + upgradeData.upgrade_declined > 0
      ? upgradeData.upgrade_accepted /
        (upgradeData.upgrade_accepted + upgradeData.upgrade_declined)
      : null;

  if (acceptRate !== null) {
    insights.push({
      id: `insight_${String(insightIndex.value++).padStart(3, "0")}`,
      type: "upgrade_acceptance",
      finding: `Upgrade acceptance rate: ${(acceptRate * 100).toFixed(0)}% (${upgradeData.upgrade_accepted} accepted, ${upgradeData.upgrade_declined} declined)`,
      evidence: {
        accepted: upgradeData.upgrade_accepted,
        declined: upgradeData.upgrade_declined,
        rate: Number(acceptRate.toFixed(2)),
      },
      suggestion: null,
    });
  }

  return insights;
}

function findIntentCoverageInsights(observations, insightIndex) {
  const insights = [];

  // Look for user_response events with follow_up_text that could be intents
  const followUps = observations
    .filter(
      (o) =>
        o.response?.metadata?.response_type === "follow_up" &&
        o.response?.metadata?.follow_up_text,
    )
    .map((o) => o.response.metadata.follow_up_text);

  if (followUps.length >= 2) {
    insights.push({
      id: `insight_${String(insightIndex.value++).padStart(3, "0")}`,
      type: "intent_coverage",
      finding: `${followUps.length} follow-up phrases could map to known task types`,
      evidence: { phrases: followUps.slice(0, 10) },
      suggestion: {
        target: "definitions",
        action: "add_patterns",
        patterns: followUps.slice(0, 5),
        taskType: null,
        confidence: 0.5,
      },
    });
  }

  return insights;
}

function findResponseTimeInsights(observations, insightIndex) {
  const insights = [];

  const byPoint = {};
  for (const { narration, response } of observations) {
    const point = narration?.metadata?.narration_point;
    const timeMs = response?.metadata?.time_to_action_ms;
    if (!point || typeof timeMs !== "number") continue;

    if (!byPoint[point]) byPoint[point] = [];
    byPoint[point].push(timeMs);
  }

  const medians = Object.entries(byPoint)
    .filter(([, times]) => times.length >= 3)
    .map(([point, times]) => {
      times.sort((a, b) => a - b);
      const median = times[Math.floor(times.length / 2)];
      return { point, median, count: times.length };
    });

  if (medians.length >= 2) {
    medians.sort((a, b) => a.median - b.median);
    const fastest = medians[0];
    const slowest = medians[medians.length - 1];

    if (slowest.median > fastest.median * 2) {
      insights.push({
        id: `insight_${String(insightIndex.value++).padStart(3, "0")}`,
        type: "response_time",
        finding: `'${fastest.point}' gets responses in ${fastest.median}ms median vs ${slowest.median}ms for '${slowest.point}'`,
        evidence: {
          fastest_point: fastest.point,
          fastest_median_ms: fastest.median,
          slowest_point: slowest.point,
          slowest_median_ms: slowest.median,
        },
        suggestion: null,
      });
    }
  }

  return insights;
}

export function reflect({
  observations,
  currentTemplates,
  currentDefinitions,
} = {}) {
  const obs = observations || [];

  const period = {
    from: null,
    to: null,
  };

  if (obs.length > 0) {
    const times = obs
      .map((o) => o.narration?.created_at)
      .filter(Boolean)
      .sort();
    period.from = times[0] || null;
    period.to = times[times.length - 1] || null;
  }

  const totalNarrations = obs.filter((o) => o.narration).length;
  const totalResponses = obs.filter((o) => o.response).length;
  const engagementRate =
    totalNarrations > 0
      ? Number((totalResponses / totalNarrations).toFixed(2))
      : 0;

  const engagementByPoint = classifyEngagement(obs);
  const insightIndex = { value: 1 };

  const insights = [
    ...findTemplateEffectivenessInsights(engagementByPoint, insightIndex),
    ...findUpgradeAcceptanceInsights(engagementByPoint, insightIndex),
    ...findIntentCoverageInsights(obs, insightIndex),
    ...findResponseTimeInsights(obs, insightIndex),
  ];

  // Cap all confidence values to [0, 1]
  for (const insight of insights) {
    if (insight.suggestion?.confidence !== undefined) {
      insight.suggestion.confidence = Math.max(
        0,
        Math.min(1, insight.suggestion.confidence),
      );
    }
  }

  return {
    report: {
      period,
      total_narrations: totalNarrations,
      total_responses: totalResponses,
      engagement_rate: engagementRate,
      insights,
    },
    applied: [],
  };
}
