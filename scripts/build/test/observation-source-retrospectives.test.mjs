import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapRetrospectiveToObservations } from '../../../runtime/lib/observation-sources/retrospectives.mjs';

function retrospectiveArtifact(overrides = {}) {
  return {
    schema_version: '1.0',
    generated_at: '2026-03-23T10:00:00Z',
    pr_ref: '42',
    session_stats: { turn_count: 5, tool_calls: 10, duration_hint: '~20 min' },
    friction_signals: [],
    skill_recommendations: [],
    summary: { total_signals: 0, high_impact_signals: 0, recommendation_count: 0 },
    ...overrides,
  };
}

test('mapRetrospectiveToObservations with empty artifact', () => {
  const artifact = retrospectiveArtifact();
  const observations = mapRetrospectiveToObservations({
    retrospectiveId: 'retro_001',
    artifact,
  });

  assert.equal(observations.length, 0, 'Empty artifact produces no observations');
});

test('mapRetrospectiveToObservations maps friction signals to observations', () => {
  const artifact = retrospectiveArtifact({
    friction_signals: [
      {
        type: 'capability_gap',
        turn_index: 3,
        description: 'No skill for db schema lookup',
        impact: 'high',
        repeatable: true,
      },
      {
        type: 'loop',
        turn_index: 5,
        description: 'Tool re-invoked twice due to incomplete output',
        impact: 'medium',
        repeatable: false,
      },
    ],
    summary: { total_signals: 2, high_impact_signals: 1, recommendation_count: 0 },
  });

  const observations = mapRetrospectiveToObservations({
    retrospectiveId: 'retro_001',
    artifact,
  });

  // Should have one observation per friction signal
  assert.equal(observations.length, 2);

  // First signal: capability gap
  assert.equal(observations[0].type, 'friction_observed');
  assert.equal(observations[0].metadata.signal_type, 'capability_gap');
  assert.equal(observations[0].metadata.description, 'No skill for db schema lookup');
  assert.equal(observations[0].metadata.impact, 'high');
  assert.equal(observations[0].metadata.turn_index, 3);
  assert.equal(observations[0].metadata.repeatable, true);
  assert.equal(observations[0].metadata.retrospective_id, 'retro_001');

  // Second signal: loop
  assert.equal(observations[1].type, 'friction_observed');
  assert.equal(observations[1].metadata.signal_type, 'loop');
  assert.equal(observations[1].metadata.description, 'Tool re-invoked twice due to incomplete output');
  assert.equal(observations[1].metadata.impact, 'medium');
});

test('mapRetrospectiveToObservations maps skill recommendations to observations', () => {
  const artifact = retrospectiveArtifact({
    skill_recommendations: [
      {
        name: 'db-schema-loader',
        category: 'library-api-reference',
        rationale: 'Repeated schema lookups during session',
        trigger_description: 'Fetch database schema',
        priority: 'high',
        estimated_reuse: 'frequent',
      },
    ],
    summary: { total_signals: 0, high_impact_signals: 0, recommendation_count: 1 },
  });

  const observations = mapRetrospectiveToObservations({
    retrospectiveId: 'retro_002',
    artifact,
  });

  assert.equal(observations.length, 1);

  const obs = observations[0];
  assert.equal(obs.type, 'skill_recommended');
  assert.equal(obs.metadata.skill_name, 'db-schema-loader');
  assert.equal(obs.metadata.category, 'library-api-reference');
  assert.equal(obs.metadata.rationale, 'Repeated schema lookups during session');
  assert.equal(obs.metadata.priority, 'high');
  assert.equal(obs.metadata.estimated_reuse, 'frequent');
  assert.equal(obs.metadata.retrospective_id, 'retro_002');
});

test('mapRetrospectiveToObservations handles mixed signals and recommendations', () => {
  const artifact = retrospectiveArtifact({
    friction_signals: [
      {
        type: 'error',
        turn_index: 2,
        description: 'API call failed',
        impact: 'high',
        repeatable: false,
      },
    ],
    skill_recommendations: [
      {
        name: 'api-error-recovery',
        category: 'product-verification',
        rationale: 'Errors occurred without recovery path',
        trigger_description: 'API failure in tool call',
        priority: 'high',
        estimated_reuse: 'frequent',
      },
    ],
    summary: { total_signals: 1, high_impact_signals: 1, recommendation_count: 1 },
  });

  const observations = mapRetrospectiveToObservations({
    retrospectiveId: 'retro_003',
    artifact,
  });

  // One signal + one recommendation = 2 observations
  assert.equal(observations.length, 2);

  // First observation: friction signal
  assert.equal(observations[0].type, 'friction_observed');
  assert.equal(observations[0].metadata.signal_type, 'error');

  // Second observation: skill recommendation
  assert.equal(observations[1].type, 'skill_recommended');
  assert.equal(observations[1].metadata.skill_name, 'api-error-recovery');
});

test('mapRetrospectiveToObservations includes source metadata', () => {
  const artifact = retrospectiveArtifact({
    pr_ref: '123',
    friction_signals: [
      {
        type: 'missing_context',
        turn_index: 1,
        description: 'Missing api docs',
        impact: 'low',
        repeatable: true,
      },
    ],
    summary: { total_signals: 1, high_impact_signals: 0, recommendation_count: 0 },
  });

  const observations = mapRetrospectiveToObservations({
    retrospectiveId: 'retro_004',
    artifact,
  });

  assert.equal(observations[0].metadata.pr_ref, '123');
  assert.equal(observations[0].metadata.generated_at, '2026-03-23T10:00:00Z');
});

test('mapRetrospectiveToObservations requires retrospectiveId', () => {
  const artifact = retrospectiveArtifact();

  assert.throws(
    () => mapRetrospectiveToObservations({
      artifact,
    }),
    /retrospectiveId is required/,
  );
});

test('mapRetrospectiveToObservations requires artifact', () => {
  assert.throws(
    () => mapRetrospectiveToObservations({
      retrospectiveId: 'retro_001',
    }),
    /artifact is required/,
  );
});
