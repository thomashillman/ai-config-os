// Eval Candidate Extractor — identifies repeated issues from observations.
// Pure function: analyzes observations, returns candidate objects.

/**
 * Extract eval candidates from observations by identifying repeated friction signals.
 *
 * @param {Array} observations - Array of observation events
 * @returns {Array} Candidate objects ranked by frequency and impact
 */
export function extractEvalCandidates(observations = []) {
  if (!Array.isArray(observations)) {
    return [];
  }

  // Filter for friction_observed events and group by signal_type
  const frictionMap = new Map();

  for (const obs of observations) {
    if (obs.type !== "friction_observed") {
      continue;
    }

    const signalType = obs.metadata?.signal_type;
    if (!signalType) {
      continue;
    }

    if (!frictionMap.has(signalType)) {
      frictionMap.set(signalType, {
        signalType,
        count: 0,
        impacts: [],
        turns: [],
        descriptions: [],
        repeatable: false,
      });
    }

    const entry = frictionMap.get(signalType);
    entry.count += 1;
    if (obs.metadata?.impact) {
      entry.impacts.push(obs.metadata.impact);
    }
    if (typeof obs.metadata?.turn_index === "number") {
      entry.turns.push(obs.metadata.turn_index);
    }
    if (obs.metadata?.description) {
      entry.descriptions.push(obs.metadata.description);
    }
    if (obs.metadata?.repeatable) {
      entry.repeatable = true;
    }
  }

  // Convert to candidate objects, filtering out single occurrences
  const candidates = [];

  for (const [signalType, entry] of frictionMap.entries()) {
    if (entry.count < 2) {
      continue;
    }

    // Determine severity (high > medium > low)
    const severityOrder = { high: 3, medium: 2, low: 1 };
    const maxSeverity = Math.max(
      ...(entry.impacts.length > 0
        ? entry.impacts.map((i) => severityOrder[i] || 0)
        : [0]),
    );
    const severityMap = { 3: "high", 2: "medium", 1: "low", 0: "unknown" };
    const severity = severityMap[maxSeverity];

    const candidate = {
      id: `candidate_${signalType}_${Date.now()}`,
      signal_type: signalType,
      count: entry.count,
      severity,
      evidence: {
        turns: entry.turns,
        impacts: [...new Set(entry.impacts)],
        examples: entry.descriptions.slice(0, 3),
        repeatable: entry.repeatable,
      },
      recommendation:
        severity === "high"
          ? "Consider creating an eval or template adjustment"
          : "Monitor for pattern evolution",
      created_at: new Date().toISOString(),
    };

    candidates.push(candidate);
  }

  // Sort by count (frequency) descending, then by severity
  const severityOrder = { high: 3, medium: 2, low: 1, unknown: 0 };
  candidates.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return severityOrder[b.severity] - severityOrder[a.severity];
  });

  return candidates;
}
