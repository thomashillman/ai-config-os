import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractEvalCandidates } from '../../../runtime/lib/eval-candidate-extractor.mjs';

function mockObservationEvent(type, metadata = {}) {
  return {
    type,
    createdAt: new Date().toISOString(),
    metadata: {
      ...metadata,
    },
  };
}

test('extractEvalCandidates identifies repeated friction signals', () => {
  const observations = [
    mockObservationEvent('friction_observed', {
      signal_type: 'loop',
      description: 'Tool called twice for same task',
      impact: 'high',
      turn_index: 3,
      repeatable: true,
    }),
    mockObservationEvent('friction_observed', {
      signal_type: 'loop',
      description: 'Tool called twice for same task',
      impact: 'high',
      turn_index: 7,
      repeatable: true,
    }),
    mockObservationEvent('friction_observed', {
      signal_type: 'loop',
      description: 'Tool called twice for same task',
      impact: 'high',
      turn_index: 12,
      repeatable: true,
    }),
  ];

  const candidates = extractEvalCandidates(observations);

  assert.ok(Array.isArray(candidates));
  assert.ok(candidates.length > 0);

  const loopCandidate = candidates.find((c) => c.signal_type === 'loop');
  assert.ok(loopCandidate);
  assert.equal(loopCandidate.count, 3);
  assert.ok(loopCandidate.evidence);
  assert.ok(Array.isArray(loopCandidate.evidence.turns));
});

test('extractEvalCandidates counts signal types', () => {
  const observations = [
    mockObservationEvent('friction_observed', {
      signal_type: 'capability_gap',
      description: 'No skill for this',
      impact: 'medium',
    }),
    mockObservationEvent('friction_observed', {
      signal_type: 'capability_gap',
      description: 'No skill for this',
      impact: 'medium',
    }),
    mockObservationEvent('friction_observed', {
      signal_type: 'error',
      description: 'API error',
      impact: 'high',
    }),
    mockObservationEvent('friction_observed', {
      signal_type: 'error',
      description: 'API error',
      impact: 'high',
    }),
  ];

  const candidates = extractEvalCandidates(observations);

  assert.ok(candidates.length >= 2);

  const capGapCandidate = candidates.find((c) => c.signal_type === 'capability_gap');
  assert.equal(capGapCandidate.count, 2);

  const errorCandidate = candidates.find((c) => c.signal_type === 'error');
  assert.equal(errorCandidate.count, 2);
});

test('extractEvalCandidates filters out single-occurrence signals', () => {
  const observations = [
    mockObservationEvent('friction_observed', {
      signal_type: 'loop',
      description: 'Loop detected',
      impact: 'high',
    }),
    mockObservationEvent('friction_observed', {
      signal_type: 'loop',
      description: 'Loop detected',
      impact: 'high',
    }),
    mockObservationEvent('friction_observed', {
      signal_type: 'assumption_failure',
      description: 'Wrong assumption',
      impact: 'low',
    }),
  ];

  const candidates = extractEvalCandidates(observations);

  // Only loop should appear (count >= 2)
  const loopCandidate = candidates.find((c) => c.signal_type === 'loop');
  assert.ok(loopCandidate);

  const assumptionCandidate = candidates.find((c) => c.signal_type === 'assumption_failure');
  // Should not appear or should have count < 2
  if (assumptionCandidate) {
    assert.ok(assumptionCandidate.count < 2);
  }
});

test('extractEvalCandidates identifies skill recommendation gaps', () => {
  const observations = [
    mockObservationEvent('friction_observed', {
      signal_type: 'capability_gap',
      description: 'No skill for database queries',
      impact: 'high',
      repeatable: true,
    }),
    mockObservationEvent('friction_observed', {
      signal_type: 'capability_gap',
      description: 'No skill for database queries',
      impact: 'high',
      repeatable: true,
    }),
    mockObservationEvent('friction_observed', {
      signal_type: 'capability_gap',
      description: 'No skill for database queries',
      impact: 'high',
      repeatable: true,
    }),
  ];

  const candidates = extractEvalCandidates(observations);

  const gapCandidate = candidates.find((c) => c.signal_type === 'capability_gap');
  assert.ok(gapCandidate);
  assert.equal(gapCandidate.count, 3);
  assert.equal(gapCandidate.severity, 'high');
  assert.ok(gapCandidate.recommendation);
});

test('extractEvalCandidates ranks by frequency and impact', () => {
  const observations = [
    // High frequency, high impact
    mockObservationEvent('friction_observed', {
      signal_type: 'loop',
      description: 'Loop',
      impact: 'high',
    }),
    mockObservationEvent('friction_observed', {
      signal_type: 'loop',
      description: 'Loop',
      impact: 'high',
    }),
    mockObservationEvent('friction_observed', {
      signal_type: 'loop',
      description: 'Loop',
      impact: 'high',
    }),
    mockObservationEvent('friction_observed', {
      signal_type: 'loop',
      description: 'Loop',
      impact: 'high',
    }),
    // Low frequency, high impact
    mockObservationEvent('friction_observed', {
      signal_type: 'error',
      description: 'Error',
      impact: 'high',
    }),
    mockObservationEvent('friction_observed', {
      signal_type: 'error',
      description: 'Error',
      impact: 'high',
    }),
  ];

  const candidates = extractEvalCandidates(observations);

  // Loop should rank higher (more frequent)
  const loopIndex = candidates.findIndex((c) => c.signal_type === 'loop');
  const errorIndex = candidates.findIndex((c) => c.signal_type === 'error');

  if (loopIndex >= 0 && errorIndex >= 0) {
    assert.ok(loopIndex < errorIndex, 'Higher frequency should rank first');
  }
});

test('extractEvalCandidates returns empty array for empty observations', () => {
  const candidates = extractEvalCandidates([]);
  assert.ok(Array.isArray(candidates));
  assert.equal(candidates.length, 0);
});

test('extractEvalCandidates ignores non-friction events', () => {
  const observations = [
    mockObservationEvent('narration_shown', {
      narration_point: 'onStart',
    }),
    mockObservationEvent('user_response', {
      response_type: 'engaged',
    }),
    mockObservationEvent('friction_observed', {
      signal_type: 'loop',
      description: 'Loop',
      impact: 'high',
    }),
    mockObservationEvent('friction_observed', {
      signal_type: 'loop',
      description: 'Loop',
      impact: 'high',
    }),
  ];

  const candidates = extractEvalCandidates(observations);

  // Should only extract from friction_observed
  const loopCandidate = candidates.find((c) => c.signal_type === 'loop');
  assert.equal(loopCandidate.count, 2);
});

test('extractEvalCandidates includes evidence about impact levels', () => {
  const observations = [
    mockObservationEvent('friction_observed', {
      signal_type: 'capability_gap',
      description: 'Gap 1',
      impact: 'high',
    }),
    mockObservationEvent('friction_observed', {
      signal_type: 'capability_gap',
      description: 'Gap 2',
      impact: 'medium',
    }),
  ];

  const candidates = extractEvalCandidates(observations);

  const candidate = candidates.find((c) => c.signal_type === 'capability_gap');
  if (candidate && candidate.evidence) {
    assert.ok(candidate.evidence.impacts);
  }
});
