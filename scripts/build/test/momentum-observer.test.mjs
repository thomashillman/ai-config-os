import { test } from "node:test";
import assert from "node:assert/strict";
import { ProgressEventStore } from "../../../runtime/lib/progress-event-pipeline.mjs";
import { MomentumObserver } from "../../../runtime/lib/momentum-observer.mjs";

function taskSnapshot(overrides = {}) {
  return {
    task_id: "task_review_001",
    current_route: "pasted_diff",
    state: "active",
    findings: [],
    version: 2,
    ...overrides,
  };
}

function narratorOutput() {
  return {
    headline: "Starting repository review with Diff-only review",
    progress: null,
    strength: {
      level: "limited",
      label: "Diff-only review",
      description: "test",
    },
    next_action: "Collect first findings",
    upgrade: null,
    findings: [],
  };
}

test("recordNarration produces valid narration_shown progress event", () => {
  const store = new ProgressEventStore();
  const observer = new MomentumObserver({ progressEventStore: store });

  const event = observer.recordNarration({
    taskId: "task_review_001",
    narrationPoint: "onStart",
    templateVersion: "1.0.0",
    narratorOutput: narratorOutput(),
    taskSnapshot: taskSnapshot(),
  });

  assert.equal(event.type, "narration_shown");
  assert.equal(event.metadata.narration_point, "onStart");
  assert.equal(event.metadata.template_version, "1.0.0");
  assert.ok(event.metadata.narration_output);
  assert.equal(event.metadata.route_at_narration, "pasted_diff");
  assert.equal(event.metadata.findings_count_at_narration, 0);
});

test("recordResponse produces valid user_response progress event", () => {
  const store = new ProgressEventStore();
  const observer = new MomentumObserver({ progressEventStore: store });

  // Record a narration first
  observer.recordNarration({
    taskId: "task_review_001",
    narrationPoint: "onStart",
    templateVersion: "1.0.0",
    narratorOutput: narratorOutput(),
    taskSnapshot: taskSnapshot(),
  });

  const event = observer.recordResponse({
    taskId: "task_review_001",
    narrationEventId: "evt_2_narration_onstart",
    responseType: "engaged",
    timeToActionMs: 4200,
  });

  assert.equal(event.type, "user_response");
  assert.equal(event.metadata.response_type, "engaged");
  assert.equal(event.metadata.time_to_action_ms, 4200);
  assert.equal(event.metadata.narration_event_id, "evt_2_narration_onstart");
});

test("recordResponse links correctly to narration event", () => {
  const store = new ProgressEventStore();
  const observer = new MomentumObserver({ progressEventStore: store });

  observer.recordNarration({
    taskId: "task_review_001",
    narrationPoint: "onStart",
    templateVersion: "1.0.0",
    narratorOutput: narratorOutput(),
    taskSnapshot: taskSnapshot(),
  });

  observer.recordResponse({
    taskId: "task_review_001",
    narrationEventId: "evt_2_narration_onstart",
    responseType: "accepted_upgrade",
    timeToActionMs: 1500,
  });

  const events = store.listByTaskId("task_review_001");
  const response = events.find((e) => e.type === "user_response");
  assert.equal(response.metadata.narration_event_id, "evt_2_narration_onstart");
});

test("getObservationPairs returns matched narration+response pairs", () => {
  const store = new ProgressEventStore();
  const observer = new MomentumObserver({ progressEventStore: store });

  const narrationEvent = observer.recordNarration({
    taskId: "task_review_001",
    narrationPoint: "onStart",
    templateVersion: "1.0.0",
    narratorOutput: narratorOutput(),
    taskSnapshot: taskSnapshot(),
  });

  observer.recordResponse({
    taskId: "task_review_001",
    narrationEventId: narrationEvent.event_id,
    responseType: "engaged",
    timeToActionMs: 3000,
  });

  const pairs = observer.getObservationPairs({ taskId: "task_review_001" });

  assert.equal(pairs.length, 1);
  assert.ok(pairs[0].narration);
  assert.ok(pairs[0].response);
  assert.equal(pairs[0].narration.type, "narration_shown");
  assert.equal(pairs[0].response.type, "user_response");
});

test("getObservationPairs returns narration without response when unmatched", () => {
  const store = new ProgressEventStore();
  const observer = new MomentumObserver({ progressEventStore: store });

  observer.recordNarration({
    taskId: "task_review_001",
    narrationPoint: "onStart",
    templateVersion: "1.0.0",
    narratorOutput: narratorOutput(),
    taskSnapshot: taskSnapshot(),
  });

  const pairs = observer.getObservationPairs({ taskId: "task_review_001" });

  assert.equal(pairs.length, 1);
  assert.ok(pairs[0].narration);
  assert.equal(pairs[0].response, null);
});

test("getRecentObservations filters by time window", () => {
  const store = new ProgressEventStore();
  const observer = new MomentumObserver({ progressEventStore: store });

  observer.recordNarration({
    taskId: "task_review_001",
    narrationPoint: "onStart",
    templateVersion: "1.0.0",
    narratorOutput: narratorOutput(),
    taskSnapshot: taskSnapshot(),
  });

  // Query with a recent timestamp — should find the event
  const recent = observer.getRecentObservations({
    since: new Date(Date.now() - 60000).toISOString(),
  });
  assert.ok(recent.length >= 1);

  // Query with a future timestamp — should find nothing
  const future = observer.getRecentObservations({
    since: new Date(Date.now() + 60000).toISOString(),
  });
  assert.equal(future.length, 0);
});

test("invalid response type is rejected", () => {
  const store = new ProgressEventStore();
  const observer = new MomentumObserver({ progressEventStore: store });

  assert.throws(
    () =>
      observer.recordResponse({
        taskId: "task_review_001",
        narrationEventId: "evt_1_narration_onstart",
        responseType: "invalid_type",
      }),
    /Invalid response type/,
  );
});

test("invalid narration point is rejected", () => {
  const store = new ProgressEventStore();
  const observer = new MomentumObserver({ progressEventStore: store });

  assert.throws(
    () =>
      observer.recordNarration({
        taskId: "task_review_001",
        narrationPoint: "onInvalid",
        templateVersion: "1.0.0",
        narratorOutput: narratorOutput(),
        taskSnapshot: taskSnapshot(),
      }),
    /Invalid narration point/,
  );
});

test("constructor requires progressEventStore", () => {
  assert.throws(
    () => new MomentumObserver({}),
    /progressEventStore must be an object/,
  );
});

test("follow_up response includes follow_up_text", () => {
  const store = new ProgressEventStore();
  const observer = new MomentumObserver({ progressEventStore: store });

  const event = observer.recordResponse({
    taskId: "task_review_001",
    narrationEventId: "evt_1_narration_onstart",
    responseType: "follow_up",
    timeToActionMs: 2000,
    followUpText: "What about the security implications?",
  });

  assert.equal(
    event.metadata.follow_up_text,
    "What about the security implications?",
  );
});

test("repeated narration emissions do not collide", () => {
  const store = new ProgressEventStore();
  const observer = new MomentumObserver({ progressEventStore: store });

  const snapshot = taskSnapshot();
  const output = narratorOutput();

  const event1 = observer.recordNarration({
    taskId: "task_review_001",
    narrationPoint: "onStart",
    templateVersion: "1.0.0",
    narratorOutput: output,
    taskSnapshot: snapshot,
  });

  const event2 = observer.recordNarration({
    taskId: "task_review_001",
    narrationPoint: "onStart",
    templateVersion: "1.0.0",
    narratorOutput: output,
    taskSnapshot: snapshot,
  });

  assert.notEqual(
    event1.event_id,
    event2.event_id,
    "event IDs should be different",
  );

  const events = store.listByTaskId("task_review_001");
  assert.equal(events.length, 2, "both narration events should be stored");
  assert.equal(events[0].type, "narration_shown");
  assert.equal(events[1].type, "narration_shown");
});
