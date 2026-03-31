import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRANSITIONS,
  createPortableTask,
  transitionPortableTaskState,
  appendRouteSelection,
} from "../../../runtime/lib/portable-task-lifecycle.mjs";

function taskFixture(overrides = {}) {
  return {
    schema_version: "1.0.0",
    task_id: "task_review_repository_009",
    task_type: "review_repository",
    goal: "Review repository changes for correctness and risk.",
    current_route: "github_pr",
    state: "pending",
    progress: { completed_steps: 0, total_steps: 4 },
    findings: [],
    unresolved_questions: [],
    approvals: [],
    route_history: [
      { route: "github_pr", selected_at: "2026-03-12T12:00:00.000Z" },
    ],
    next_action: "prepare_inputs",
    version: 1,
    updated_at: "2026-03-12T12:00:00.000Z",
    ...overrides,
  };
}

test("createPortableTask builds a validated pending task with initial route history", () => {
  const created = createPortableTask({
    taskId: "task_review_repository_101",
    taskType: "review_repository",
    goal: "Audit pull request safety.",
    routeId: "github_pr",
    nextAction: "collect_pr_context",
    totalSteps: 3,
    now: "2026-03-12T12:00:00.000Z",
  });

  assert.equal(created.state, "pending");
  assert.equal(created.current_route, "github_pr");
  assert.deepEqual(created.route_history, [
    { route: "github_pr", selected_at: "2026-03-12T12:00:00.000Z" },
  ]);
  assert.equal(created.progress.total_steps, 3);
});

test("transitionPortableTaskState allows canonical lifecycle transitions only", () => {
  assert.deepEqual(TRANSITIONS.pending, ["active", "failed"]);

  const pending = taskFixture();
  const active = transitionPortableTaskState({
    task: pending,
    nextState: "active",
    expectedVersion: 1,
    updatedAt: "2026-03-12T12:01:00.000Z",
    nextAction: "collect_repo_inputs",
  });

  assert.equal(active.state, "active");
  assert.equal(active.version, 2);

  assert.throws(
    () =>
      transitionPortableTaskState({
        task: active,
        nextState: "pending",
        expectedVersion: 2,
        updatedAt: "2026-03-12T12:02:00.000Z",
        nextAction: "rewind_state",
      }),
    /Invalid task state transition 'active' -> 'pending'/,
  );
});

test("transitionPortableTaskState enforces optimistic concurrency and monotonic progress", () => {
  const active = taskFixture({
    state: "active",
    progress: { completed_steps: 1, total_steps: 4 },
    version: 3,
  });

  assert.throws(
    () =>
      transitionPortableTaskState({
        task: active,
        nextState: "blocked",
        expectedVersion: 2,
        updatedAt: "2026-03-12T12:03:00.000Z",
        nextAction: "await_user_input",
      }),
    /expectedVersion 2 does not match task version 3/,
  );

  assert.throws(
    () =>
      transitionPortableTaskState({
        task: active,
        nextState: "blocked",
        expectedVersion: 3,
        updatedAt: "2026-03-12T12:03:00.000Z",
        nextAction: "await_user_input",
        progress: { completed_steps: 0, total_steps: 4 },
      }),
    /cannot reduce completed_steps/,
  );
});

test("appendRouteSelection switches current route, increments version, and appends history entry", () => {
  const active = taskFixture({ state: "active", version: 4 });

  const switched = appendRouteSelection({
    task: active,
    routeId: "local_repo",
    expectedVersion: 4,
    selectedAt: "2026-03-12T12:03:00.000Z",
  });

  assert.equal(switched.current_route, "local_repo");
  assert.equal(switched.version, 5);
  assert.equal(switched.route_history.length, 2);
  assert.deepEqual(switched.route_history.at(-1), {
    route: "local_repo",
    selected_at: "2026-03-12T12:03:00.000Z",
  });
});

test("appendRouteSelection rejects stale expectedVersion", () => {
  const active = taskFixture({ state: "active", version: 4 });

  assert.throws(
    () =>
      appendRouteSelection({
        task: active,
        routeId: "local_repo",
        expectedVersion: 3,
        selectedAt: "2026-03-12T12:03:00.000Z",
      }),
    /expectedVersion 3 does not match task version 4/,
  );
});
