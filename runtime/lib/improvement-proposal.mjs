// Improvement Proposal Builder — generates durable proposal artifacts from insights.
// Pure function: creates proposal objects in memory, no persistence.

let proposalCounter = 0;

/**
 * Create an improvement proposal from an insight.
 *
 * @param {object} deps
 * @param {object} deps.insight - Insight from momentum-reflector with type, target, evidence, suggestion
 * @param {string} deps.target - Target to modify (e.g., 'templates.onStart', 'definitions')
 * @param {*} [deps.current] - Current value (optional for intent definitions)
 * @param {*} deps.proposed - Proposed value (string for templates, object for intents)
 * @returns {object} Proposal artifact with stable shape and required fields
 */
export function createImprovementProposal({
  insight,
  target,
  current,
  proposed,
} = {}) {
  if (!insight) {
    throw new Error("insight is required");
  }
  if (!target) {
    throw new Error("target is required");
  }

  // Determine proposal type from target
  let proposalType = "template_change";
  if (target === "definitions" || target.startsWith("definitions.")) {
    proposalType = "intent_definition";
  }

  const proposal = {
    id: `proposal_${String(proposalCounter++).padStart(6, "0")}`,
    type: proposalType,
    status: "pending_review",
    insight_id: insight.id,
    finding: insight.finding,
    target,
    current: current !== undefined ? current : null,
    proposed: proposed !== undefined ? proposed : null,
    evidence: insight.evidence || {},
    confidence: insight.suggestion?.confidence ?? 0.5,
    created_at: new Date().toISOString(),
  };

  return proposal;
}
