import { test } from "node:test";
import assert from "node:assert/strict";
import { mapMomentumProgressEvents } from "../../../runtime/lib/observation-sources/momentum-events.mjs";

function createProgressEvent(overrides = {}) {
  return {
    schema_version: "1.0.0",
    task_id: "task_review_001",
    event_id: "evt_1_narration_onstart_1234567890",
    type: "narration_shown",
    message: "Narration shown: onStart",
    created_at: new Date().toISOString(),
    metadata: {
      narration_point: "onStart",
      template_version: "1.0.0",
      narration_output: {
        headline: "Starting review",
        findings: [],
      },
      route_at_narration: "pasted_diff",
      findings_count_at_narration: 0,
    },
    ...overrides,
  };
}

function createResponseEvent(overrides = {}) {
  return {
    schema_version: "1.0.0",
    task_id: "task_review_001",
    event_id: "evt_t1234567890_user_response_engaged",
    type: "user_response",
    message: "User responded to narration: engaged",
    created_at: new Date().toISOString(),
    metadata: {
      narration_event_id: "evt_1_narration_onstart_1234567890",
      response_type: "engaged",
      time_to_action_ms: 3000,
      follow_up_text: null,
    },
    ...overrides,
  };
}

test("maps narration_shown progress event to observation narration", () => {
  const progressEvent = createProgressEvent();
  const [observation] = mapMomentumProgressEvents([progressEvent]);

  assert.ok(observation);
  assert.equal(observation.type, "narration");
  assert.equal(observation.metadata.narration_point, "onStart");
  assert.equal(observation.metadata.template_version, "1.0.0");
  assert.equal(observation.metadata.route_at_narration, "pasted_diff");
  assert.ok(observation.metadata.narration_output);
  assert.equal(observation.event_id, "evt_1_narration_onstart_1234567890");
  assert.equal(observation.task_id, "task_review_001");
});

test("maps user_response progress event to observation response", () => {
  const progressEvent = createResponseEvent();
  const [observation] = mapMomentumProgressEvents([progressEvent]);

  assert.ok(observation);
  assert.equal(observation.type, "response");
  assert.equal(observation.metadata.response_type, "engaged");
  assert.equal(observation.metadata.time_to_action_ms, 3000);
  assert.equal(
    observation.metadata.narration_event_id,
    "evt_1_narration_onstart_1234567890",
  );
  assert.equal(observation.event_id, "evt_t1234567890_user_response_engaged");
  assert.equal(observation.task_id, "task_review_001");
});

test("preserves task_id and created_at in all observations", () => {
  const narrationEvent = createProgressEvent({
    created_at: "2026-01-01T00:00:00.000Z",
  });
  const responseEvent = createResponseEvent({
    created_at: "2026-01-01T00:00:03.000Z",
  });
  const observations = mapMomentumProgressEvents([
    narrationEvent,
    responseEvent,
  ]);

  assert.deepEqual(
    observations.map((obs) => ({
      task_id: obs.task_id,
      created_at: obs.created_at,
    })),
    [
      { task_id: "task_review_001", created_at: narrationEvent.created_at },
      { task_id: "task_review_001", created_at: responseEvent.created_at },
    ],
  );
});

test("filters out unknown event types", () => {
  const narrationEvent = createProgressEvent();
  const unknownEvent = createProgressEvent({
    event_id: "evt_unknown",
    type: "unknown_type",
    message: "Unknown event",
  });

  const observations = mapMomentumProgressEvents([
    narrationEvent,
    unknownEvent,
  ]);

  // Should only include the narration event, not the unknown type
  assert.equal(observations.length, 1);
  assert.equal(observations[0].type, "narration");
});

test("handles follow_up response with text", () => {
  const responseEvent = createResponseEvent({
    metadata: {
      narration_event_id: "evt_1_narration_onstart_1234567890",
      response_type: "follow_up",
      time_to_action_ms: 2500,
      follow_up_text: "What about security implications?",
    },
  });

  const [observation] = mapMomentumProgressEvents([responseEvent]);

  assert.equal(observation.metadata.response_type, "follow_up");
  assert.equal(
    observation.metadata.follow_up_text,
    "What about security implications?",
  );
});

test("handles upgrade-related responses", () => {
  const acceptEvent = createResponseEvent({
    event_id: "evt_2_accepted_upgrade",
    metadata: {
      narration_event_id: "evt_1_narration_onupgrade",
      response_type: "accepted_upgrade",
      time_to_action_ms: 1500,
      follow_up_text: null,
    },
  });

  const declineEvent = createResponseEvent({
    event_id: "evt_3_declined_upgrade",
    metadata: {
      narration_event_id: "evt_1_narration_onupgrade",
      response_type: "declined_upgrade",
      time_to_action_ms: 800,
      follow_up_text: null,
    },
  });

  const observations = mapMomentumProgressEvents([acceptEvent, declineEvent]);

  assert.equal(observations.length, 2);
  assert.equal(observations[0].metadata.response_type, "accepted_upgrade");
  assert.equal(observations[1].metadata.response_type, "declined_upgrade");
});

test("returns empty array for empty input", () => {
  const observations = mapMomentumProgressEvents([]);
  assert.equal(observations.length, 0);
});
