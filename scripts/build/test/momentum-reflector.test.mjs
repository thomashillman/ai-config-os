import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reflect } from '../../../runtime/lib/momentum-reflector.mjs';

function observationFixture({ narrationPoint = 'onStart', responseType = 'engaged', timeToActionMs = 3000, followUpText = null } = {}) {
  return {
    narration: {
      type: 'narration_shown',
      event_id: `evt_${Date.now()}_narration_${narrationPoint}`,
      created_at: new Date().toISOString(),
      metadata: {
        narration_point: narrationPoint,
        template_version: '1.0.0',
        narration_output: { headline: 'test' },
      },
    },
    response: responseType ? {
      type: 'user_response',
      event_id: `evt_${Date.now()}_user_response_${responseType}`,
      created_at: new Date().toISOString(),
      metadata: {
        response_type: responseType,
        time_to_action_ms: timeToActionMs,
        follow_up_text: followUpText,
      },
    } : null,
  };
}

test('empty observations produce empty insights', () => {
  const result = reflect({ observations: [] });

  assert.equal(result.report.total_narrations, 0);
  assert.equal(result.report.total_responses, 0);
  assert.equal(result.report.engagement_rate, 0);
  assert.deepEqual(result.report.insights, []);
  assert.deepEqual(result.applied, []);
});

test('null observations produce empty insights', () => {
  const result = reflect({ observations: null });

  assert.equal(result.report.total_narrations, 0);
  assert.deepEqual(result.report.insights, []);
});

test('reflector produces template effectiveness insight when engagement differs', () => {
  const observations = [
    // onStart: high engagement (4/5 engaged)
    ...Array.from({ length: 4 }, () => observationFixture({ narrationPoint: 'onStart', responseType: 'engaged' })),
    observationFixture({ narrationPoint: 'onStart', responseType: 'ignored' }),
    // onResume: low engagement (1/5 engaged)
    observationFixture({ narrationPoint: 'onResume', responseType: 'engaged' }),
    ...Array.from({ length: 4 }, () => observationFixture({ narrationPoint: 'onResume', responseType: 'ignored' })),
  ];

  const result = reflect({ observations });

  const templateInsight = result.report.insights.find((i) => i.type === 'template_effectiveness');
  assert.ok(templateInsight, 'should produce template effectiveness insight');
  assert.ok(templateInsight.evidence.best_point);
  assert.ok(templateInsight.evidence.worst_point);
  assert.ok(templateInsight.suggestion.confidence >= 0);
  assert.ok(templateInsight.suggestion.confidence <= 1);
});

test('reflector produces upgrade acceptance insight', () => {
  const observations = [
    observationFixture({ narrationPoint: 'onUpgradeAvailable', responseType: 'accepted_upgrade' }),
    observationFixture({ narrationPoint: 'onUpgradeAvailable', responseType: 'accepted_upgrade' }),
    observationFixture({ narrationPoint: 'onUpgradeAvailable', responseType: 'declined_upgrade' }),
  ];

  const result = reflect({ observations });

  const upgradeInsight = result.report.insights.find((i) => i.type === 'upgrade_acceptance');
  assert.ok(upgradeInsight, 'should produce upgrade acceptance insight');
  assert.equal(upgradeInsight.evidence.accepted, 2);
  assert.equal(upgradeInsight.evidence.declined, 1);
});

test('reflector produces intent coverage gap insight', () => {
  const observations = [
    observationFixture({ narrationPoint: 'onStart', responseType: 'follow_up', followUpText: 'scan this project' }),
    observationFixture({ narrationPoint: 'onStart', responseType: 'follow_up', followUpText: 'look at my code' }),
  ];

  const result = reflect({ observations });

  const intentInsight = result.report.insights.find((i) => i.type === 'intent_coverage');
  assert.ok(intentInsight, 'should produce intent coverage insight');
  assert.ok(intentInsight.evidence.phrases.length >= 2);
  assert.equal(intentInsight.suggestion.action, 'add_patterns');
});

test('reflector produces response time insight', () => {
  const observations = [
    // Fast responses for onStart
    ...Array.from({ length: 4 }, () => observationFixture({ narrationPoint: 'onStart', responseType: 'engaged', timeToActionMs: 1000 })),
    // Slow responses for onResume
    ...Array.from({ length: 4 }, () => observationFixture({ narrationPoint: 'onResume', responseType: 'engaged', timeToActionMs: 5000 })),
  ];

  const result = reflect({ observations });

  const timeInsight = result.report.insights.find((i) => i.type === 'response_time');
  assert.ok(timeInsight, 'should produce response time insight');
  assert.ok(timeInsight.evidence.fastest_median_ms < timeInsight.evidence.slowest_median_ms);
});

test('insight confidence scores are within [0, 1]', () => {
  const observations = [
    ...Array.from({ length: 5 }, () => observationFixture({ narrationPoint: 'onStart', responseType: 'engaged' })),
    ...Array.from({ length: 5 }, () => observationFixture({ narrationPoint: 'onResume', responseType: 'ignored' })),
  ];

  const result = reflect({ observations });

  for (const insight of result.report.insights) {
    if (insight.suggestion?.confidence !== undefined) {
      assert.ok(insight.suggestion.confidence >= 0, `confidence ${insight.suggestion.confidence} should be >= 0`);
      assert.ok(insight.suggestion.confidence <= 1, `confidence ${insight.suggestion.confidence} should be <= 1`);
    }
  }
});

test('reflector does not modify templates (v1 constraint)', () => {
  const observations = [
    ...Array.from({ length: 5 }, () => observationFixture({ narrationPoint: 'onStart', responseType: 'engaged' })),
  ];

  const result = reflect({ observations });

  assert.deepEqual(result.applied, []);
});

test('engagement rate is correctly calculated', () => {
  const observations = [
    observationFixture({ narrationPoint: 'onStart', responseType: 'engaged' }),
    observationFixture({ narrationPoint: 'onStart', responseType: 'engaged' }),
    observationFixture({ narrationPoint: 'onStart', responseType: null }),
    observationFixture({ narrationPoint: 'onStart', responseType: null }),
  ];

  const result = reflect({ observations });

  assert.equal(result.report.total_narrations, 4);
  assert.equal(result.report.total_responses, 2);
  assert.equal(result.report.engagement_rate, 0.5);
});

test('report period covers observation time range', () => {
  const observations = [
    observationFixture({ narrationPoint: 'onStart', responseType: 'engaged' }),
  ];

  const result = reflect({ observations });

  assert.ok(result.report.period.from);
  assert.ok(result.report.period.to);
});

test('report returns correct structure', () => {
  const result = reflect({ observations: [] });

  assert.ok('report' in result);
  assert.ok('applied' in result);
  assert.ok('period' in result.report);
  assert.ok('total_narrations' in result.report);
  assert.ok('total_responses' in result.report);
  assert.ok('engagement_rate' in result.report);
  assert.ok('insights' in result.report);
});
