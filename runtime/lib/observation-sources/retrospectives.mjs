// Retrospective Artifact Mapper — converts retrospective artifacts to canonical observation events.
// Pure mapper: no network, no storage, no side effects.

/**
 * Map a retrospective artifact to canonical observation events.
 *
 * @param {object} deps
 * @param {string} deps.retrospectiveId - Unique retrospective identifier
 * @param {object} deps.artifact - Retrospective artifact from post-merge-retrospective skill
 * @returns {Array} Array of canonical observation events
 */
export function mapRetrospectiveToObservations({ retrospectiveId, artifact } = {}) {
  if (!retrospectiveId) {
    throw new Error('retrospectiveId is required');
  }
  if (!artifact) {
    throw new Error('artifact is required');
  }

  const observations = [];

  // Map friction signals to friction_observed events
  if (artifact.friction_signals && Array.isArray(artifact.friction_signals)) {
    for (const signal of artifact.friction_signals) {
      observations.push({
        type: 'friction_observed',
        createdAt: new Date().toISOString(),
        metadata: {
          retrospective_id: retrospectiveId,
          signal_type: signal.type,
          description: signal.description,
          impact: signal.impact,
          turn_index: signal.turn_index,
          repeatable: signal.repeatable,
          pr_ref: artifact.pr_ref || null,
          generated_at: artifact.generated_at || null,
        },
      });
    }
  }

  // Map skill recommendations to skill_recommended events
  if (artifact.skill_recommendations && Array.isArray(artifact.skill_recommendations)) {
    for (const recommendation of artifact.skill_recommendations) {
      observations.push({
        type: 'skill_recommended',
        createdAt: new Date().toISOString(),
        metadata: {
          retrospective_id: retrospectiveId,
          skill_name: recommendation.name,
          category: recommendation.category,
          rationale: recommendation.rationale,
          trigger_description: recommendation.trigger_description,
          priority: recommendation.priority,
          estimated_reuse: recommendation.estimated_reuse,
          pr_ref: artifact.pr_ref || null,
          generated_at: artifact.generated_at || null,
        },
      });
    }
  }

  return observations;
}
