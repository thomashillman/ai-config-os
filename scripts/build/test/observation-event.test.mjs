/**
 * Observation Event Contract Tests
 *
 * Validates that observation events conform to a minimal, canonical shape.
 * All observation producers (narration, response, metrics) should emit events
 * that pass these validations. Readers can depend on the shape being consistent.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

// Import the observation event contract module
const { validateObservationEvent, createObservationEvent } = await import(
  '../../../runtime/lib/observation-event.mjs'
);

test('Observation Event Contract', async (t) => {
  await t.test('minimal valid event passes validation', () => {
    const event = {
      type: 'narration_shown',
      taskId: 'task_001',
      createdAt: new Date().toISOString(),
    };

    // Should not throw
    assert.doesNotThrow(() => {
      validateObservationEvent(event);
    });
  });

  await t.test('rich valid event with metadata passes validation', () => {
    const event = {
      type: 'user_response',
      taskId: 'task_review_001',
      eventId: 'evt_t1234567_user_response_engaged',
      message: 'User responded to narration: engaged',
      createdAt: '2026-03-23T12:30:45.000Z',
      metadata: {
        response_type: 'engaged',
        time_to_action_ms: 4200,
        narration_event_id: 'evt_2_narration_onstart',
      },
    };

    // Should not throw
    assert.doesNotThrow(() => {
      validateObservationEvent(event);
    });
  });

  await t.test('malformed event without required fields throws', () => {
    const invalidEvents = [
      { taskId: 'task_001', createdAt: new Date().toISOString() }, // missing type
      { type: 'narration_shown', createdAt: new Date().toISOString() }, // missing taskId
      { type: 'narration_shown', taskId: 'task_001' }, // missing createdAt
      { type: '', taskId: 'task_001', createdAt: new Date().toISOString() }, // empty type
      { type: 'narration_shown', taskId: '', createdAt: new Date().toISOString() }, // empty taskId
      { type: 'narration_shown', taskId: 'task_001', createdAt: 'invalid-date' }, // invalid ISO date
    ];

    for (const invalid of invalidEvents) {
      assert.throws(
        () => validateObservationEvent(invalid),
        'should reject malformed event'
      );
    }
  });

  await t.test('createObservationEvent helper builds valid event', () => {
    const event = createObservationEvent({
      type: 'narration_shown',
      taskId: 'task_abc',
      metadata: { narration_point: 'onStart' },
    });

    assert.equal(event.type, 'narration_shown');
    assert.equal(event.taskId, 'task_abc');
    assert.equal(typeof event.createdAt, 'string');
    assert.ok(event.createdAt.match(/^\d{4}-\d{2}-\d{2}T/)); // ISO format
    assert.deepEqual(event.metadata, { narration_point: 'onStart' });

    // Should pass validation
    assert.doesNotThrow(() => {
      validateObservationEvent(event);
    });
  });

  await t.test('createObservationEvent without metadata still passes', () => {
    const event = createObservationEvent({
      type: 'user_response',
      taskId: 'task_def',
    });

    assert.equal(event.type, 'user_response');
    assert.equal(event.taskId, 'task_def');
    assert.ok(event.createdAt);
    assert.equal(event.metadata, undefined);

    // Should pass validation
    assert.doesNotThrow(() => {
      validateObservationEvent(event);
    });
  });

  await t.test('createObservationEvent rejects missing required fields', () => {
    const invalidInputs = [
      { taskId: 'task_001' }, // missing type
      { type: 'narration_shown' }, // missing taskId
      { type: '', taskId: 'task_001' }, // empty type
    ];

    for (const input of invalidInputs) {
      assert.throws(
        () => createObservationEvent(input),
        'should reject incomplete input'
      );
    }
  });
});
