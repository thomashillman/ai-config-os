import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMomentumShelf } from "../../../runtime/lib/momentum-shelf.mjs";
import { createNarrator } from "../../../runtime/lib/momentum-narrator.mjs";

function taskFixture(overrides = {}) {
  return {
    schema_version: "1.0.0",
    task_id: "task_review_001",
    task_type: "review_repository",
    goal: "Review repository changes",
    current_route: "pasted_diff",
    state: "active",
    progress: { completed_steps: 1, total_steps: 6 },
    findings: [],
    unresolved_questions: [],
    approvals: [],
    route_history: [
      { route: "pasted_diff", selected_at: "2026-03-14T12:00:00.000Z" },
    ],
    next_action: "Collect first findings",
    version: 2,
    updated_at: "2026-03-14T12:00:00.000Z",
    ...overrides,
  };
}

function findingFixture(overrides = {}) {
  return {
    schema_version: "1.0.0",
    finding_id: "finding-001",
    summary: "null pointer risk",
    evidence: [],
    provenance: {
      schema_version: "1.0.0",
      status: "hypothesis",
      recorded_at: "2026-03-14T12:00:00.000Z",
      recorded_by_route: "pasted_diff",
    },
    ...overrides,
  };
}

function strongCapabilityProfile() {
  return {
    capabilities: {
      network_http: "supported",
      local_fs: "supported",
      local_shell: "supported",
      local_repo: "supported",
    },
  };
}

test("empty task list returns empty shelf", () => {
  const result = buildMomentumShelf({ tasks: [], currentCapabilities: {} });
  assert.deepEqual(result, []);
});

test("null/undefined tasks returns empty shelf", () => {
  assert.deepEqual(buildMomentumShelf({ tasks: null }), []);
  assert.deepEqual(buildMomentumShelf({ tasks: undefined }), []);
});

test("completed and failed tasks are excluded", () => {
  const tasks = [
    taskFixture({ task_id: "completed_task", state: "completed" }),
    taskFixture({ task_id: "failed_task", state: "failed" }),
    taskFixture({ task_id: "active_task", state: "active" }),
  ];

  const result = buildMomentumShelf({
    tasks,
    currentCapabilities: strongCapabilityProfile(),
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].task_id, "active_task");
});

test("task with route upgrade available ranks above task without", () => {
  const tasks = [
    taskFixture({ task_id: "task_no_upgrade", current_route: "local_repo" }),
    taskFixture({ task_id: "task_upgrade", current_route: "pasted_diff" }),
  ];

  const result = buildMomentumShelf({
    tasks,
    currentCapabilities: strongCapabilityProfile(),
  });

  assert.equal(result[0].task_id, "task_upgrade");
  assert.equal(result[0].environment_fit, "strong");
  assert.equal(result[0].route_upgrade_available, true);
  assert.equal(result[1].task_id, "task_no_upgrade");
  assert.equal(result[1].environment_fit, "neutral");
  assert.equal(result[1].route_upgrade_available, false);
});

test("task with more unverified findings ranks above task with fewer (same env fit)", () => {
  const tasks = [
    taskFixture({
      task_id: "task_few_findings",
      current_route: "pasted_diff",
      findings: [findingFixture({ finding_id: "f1" })],
    }),
    taskFixture({
      task_id: "task_many_findings",
      current_route: "pasted_diff",
      findings: [
        findingFixture({ finding_id: "f2" }),
        findingFixture({ finding_id: "f3" }),
        findingFixture({ finding_id: "f4" }),
      ],
    }),
  ];

  const result = buildMomentumShelf({
    tasks,
    currentCapabilities: strongCapabilityProfile(),
  });

  assert.equal(result[0].task_id, "task_many_findings");
  assert.equal(result[0].findings_pending_verification, 3);
});

test("shelf entries have correct shape", () => {
  const tasks = [taskFixture()];
  const result = buildMomentumShelf({ tasks, currentCapabilities: {} });

  assert.equal(result.length, 1);
  const entry = result[0];
  assert.ok("task_id" in entry);
  assert.ok("rank" in entry);
  assert.ok("headline" in entry);
  assert.ok("continuation_reason" in entry);
  assert.ok("environment_fit" in entry);
  assert.ok("findings_pending_verification" in entry);
  assert.ok("route_upgrade_available" in entry);
  assert.ok("current_route" in entry);
  assert.ok("best_route" in entry);
  assert.equal(entry.rank, 1);
});

test("shelf uses narrator when provided", () => {
  const narrator = createNarrator();
  const tasks = [taskFixture({ findings: [findingFixture()] })];

  const result = buildMomentumShelf({
    tasks,
    currentCapabilities: {},
    narrator,
  });

  assert.equal(result.length, 1);
  // Narrator-produced headline should contain task type label
  assert.ok(result[0].headline.includes("repository review"));
});

test("shelf works without narrator", () => {
  const tasks = [taskFixture()];

  const result = buildMomentumShelf({ tasks, currentCapabilities: {} });

  assert.equal(result.length, 1);
  assert.ok(result[0].headline.length > 0);
});

test("environment fit classification is correct", () => {
  const tasks = [
    taskFixture({ task_id: "task_strong", current_route: "pasted_diff" }),
    taskFixture({ task_id: "task_neutral", current_route: "local_repo" }),
  ];

  const result = buildMomentumShelf({
    tasks,
    currentCapabilities: strongCapabilityProfile(),
  });

  const strong = result.find((e) => e.task_id === "task_strong");
  const neutral = result.find((e) => e.task_id === "task_neutral");

  assert.equal(strong.environment_fit, "strong");
  assert.equal(neutral.environment_fit, "neutral");
});

test("unsupported capability profile does not mark route upgrade available", () => {
  const tasks = [
    taskFixture({
      task_id: "task_no_supported_upgrade",
      current_route: "github_pr",
    }),
  ];
  const unsupportedCapabilities = {
    capabilities: {
      network_http: "supported",
      local_fs: "unsupported",
      local_shell: "unknown",
      local_repo: "unsupported",
    },
  };

  const result = buildMomentumShelf({
    tasks,
    currentCapabilities: unsupportedCapabilities,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].route_upgrade_available, false);
  assert.equal(result[0].environment_fit, "neutral");
});

test("rank numbers are sequential starting from 1", () => {
  const tasks = [
    taskFixture({ task_id: "task_a" }),
    taskFixture({ task_id: "task_b" }),
    taskFixture({ task_id: "task_c" }),
  ];

  const result = buildMomentumShelf({ tasks, currentCapabilities: {} });

  assert.equal(result[0].rank, 1);
  assert.equal(result[1].rank, 2);
  assert.equal(result[2].rank, 3);
});
