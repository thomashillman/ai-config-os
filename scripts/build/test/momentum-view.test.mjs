import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMomentumView } from "../../../runtime/lib/momentum-view.mjs";
import { validateContract } from "../../../shared/contracts/validate.mjs";

function taskFixture(overrides = {}) {
  return {
    schema_version: "1.0.0",
    task_id: "task_review_repository_mv001",
    task_type: "review_repository",
    goal: "Review repository for correctness.",
    current_route: "github_pr",
    state: "active",
    progress: { completed_steps: 2, total_steps: 6 },
    findings: [],
    unresolved_questions: [],
    approvals: [],
    route_history: [
      { route: "github_pr", selected_at: "2026-03-12T12:00:00.000Z" },
    ],
    next_action: "Verify the null pointer risk against call sites",
    version: 1,
    updated_at: "2026-03-12T12:00:00.000Z",
    ...overrides,
  };
}

function contractFixture(overrides = {}) {
  return {
    schema_version: "1.0.0",
    task_id: "task_review_repository_mv001",
    task_type: "review_repository",
    selected_route: {
      schema_version: "1.0.0",
      route_id: "github_pr",
      equivalence_level: "degraded",
      required_capabilities: ["network_http"],
      missing_capabilities: [],
    },
    equivalence_level: "degraded",
    missing_capabilities: [],
    required_inputs: ["repository_slug", "pull_request_number"],
    computed_at: "2026-03-12T12:00:00.000Z",
    ...overrides,
  };
}

function contractWithUpgrade(overrides = {}) {
  return contractFixture({
    upgrade_explanation: {
      before: "PR context is available from GitHub",
      now: "PR metadata and changed files are inspected",
      unlocks:
        "Full repository access enables complete call site verification and test inspection",
      stronger_route_id: "local_repo",
    },
    ...overrides,
  });
}

function strongContractFixture(overrides = {}) {
  return {
    schema_version: "1.0.0",
    task_id: "task_review_repository_mv002",
    task_type: "review_repository",
    selected_route: {
      schema_version: "1.0.0",
      route_id: "local_repo",
      equivalence_level: "equal",
      required_capabilities: ["local_fs", "local_repo"],
      missing_capabilities: [],
    },
    equivalence_level: "equal",
    missing_capabilities: [],
    required_inputs: ["repository_path"],
    computed_at: "2026-03-12T12:00:00.000Z",
    ...overrides,
  };
}

test("buildMomentumView returns all required fields", () => {
  const view = buildMomentumView({
    task: taskFixture(),
    effectiveExecutionContract: contractFixture(),
  });
  assert.ok(view.schema_version);
  assert.ok(view.task_id);
  assert.ok(view.work_title);
  assert.ok(view.progress_summary);
  assert.ok(Array.isArray(view.top_findings));
  assert.ok(view.current_strength);
  assert.ok(view.current_strength.level);
  assert.ok(view.current_strength.label);
  assert.ok(view.best_next_action);
});

test("work_title comes from intent lexicon for review_repository", () => {
  const view = buildMomentumView({
    task: taskFixture(),
    effectiveExecutionContract: contractFixture(),
  });
  assert.equal(view.work_title, "Repository review");
});

test("work_title falls back to task_type for unknown type", () => {
  const view = buildMomentumView({
    task: taskFixture({ task_type: "unknown_task_type" }),
    effectiveExecutionContract: contractFixture({
      task_type: "unknown_task_type",
    }),
    workTitleFn: (taskType) => taskType,
  });
  assert.equal(view.work_title, "unknown_task_type");
});

test("progress_summary is human-readable", () => {
  const view = buildMomentumView({
    task: taskFixture({ progress: { completed_steps: 2, total_steps: 6 } }),
    effectiveExecutionContract: contractFixture(),
  });
  assert.match(view.progress_summary, /2 of 6 steps/);
  assert.match(view.progress_summary, /0 findings/);
});

test("progress_summary counts findings correctly", () => {
  const finding = {
    schema_version: "1.0.0",
    finding_id: "null-ptr",
    summary: "Null pointer risk in main loop.",
    evidence: [],
    verification_status: "unverified",
    provenance: {
      schema_version: "1.0.0",
      status: "hypothesis",
      recorded_at: "2026-03-12T12:00:00.000Z",
      recorded_by_route: "github_pr",
      confidence: "medium",
      confidence_basis: "github_context",
    },
  };
  const view = buildMomentumView({
    task: taskFixture({ findings: [finding] }),
    effectiveExecutionContract: contractFixture(),
  });
  assert.match(view.progress_summary, /1 finding/);
});

test("top_findings is empty array when task has no findings", () => {
  const view = buildMomentumView({
    task: taskFixture({ findings: [] }),
    effectiveExecutionContract: contractFixture(),
  });
  assert.deepEqual(view.top_findings, []);
});

test("top_findings includes summary and confidence from provenance", () => {
  const finding = {
    schema_version: "1.0.0",
    finding_id: "sql-injection",
    summary: "SQL injection risk in query builder.",
    evidence: [],
    verification_status: "partially_verified",
    provenance: {
      schema_version: "1.0.0",
      status: "hypothesis",
      recorded_at: "2026-03-12T12:00:00.000Z",
      recorded_by_route: "github_pr",
      confidence: "medium",
      confidence_basis: "github_context",
    },
  };
  const view = buildMomentumView({
    task: taskFixture({ findings: [finding] }),
    effectiveExecutionContract: contractFixture(),
  });
  assert.equal(view.top_findings.length, 1);
  assert.equal(
    view.top_findings[0].summary,
    "SQL injection risk in query builder.",
  );
  assert.equal(view.top_findings[0].confidence, "medium");
  assert.equal(view.top_findings[0].verification_status, "partially_verified");
});

test("current_strength reflects github_pr route", () => {
  const view = buildMomentumView({
    task: taskFixture({ current_route: "github_pr" }),
    effectiveExecutionContract: contractFixture(),
  });
  assert.equal(view.current_strength.level, "guided");
  assert.ok(view.current_strength.label.length > 0);
});

test("current_strength reflects local_repo route as full", () => {
  const view = buildMomentumView({
    task: taskFixture({
      current_route: "local_repo",
      task_id: "task_review_repository_mv002",
    }),
    effectiveExecutionContract: strongContractFixture(),
  });
  assert.equal(view.current_strength.level, "full");
});

test("best_next_action comes from task.next_action", () => {
  const view = buildMomentumView({
    task: taskFixture({ next_action: "Check all call sites" }),
    effectiveExecutionContract: contractFixture(),
  });
  assert.equal(view.best_next_action, "Check all call sites");
});

test("upgrade_opportunity present when contract has upgrade_explanation", () => {
  const view = buildMomentumView({
    task: taskFixture(),
    effectiveExecutionContract: contractWithUpgrade(),
  });
  assert.ok(view.upgrade_opportunity, "upgrade_opportunity should be present");
  assert.ok(view.upgrade_opportunity.unlocks.length > 0);
});

test("upgrade_opportunity absent when on strongest route", () => {
  const view = buildMomentumView({
    task: taskFixture({
      current_route: "local_repo",
      task_id: "task_review_repository_mv002",
    }),
    effectiveExecutionContract: strongContractFixture(),
  });
  assert.equal(view.upgrade_opportunity, undefined);
});

test("determinism: 10 identical invocations produce byte-identical JSON", () => {
  const task = taskFixture();
  const contract = contractWithUpgrade();
  const first = JSON.stringify(
    buildMomentumView({ task, effectiveExecutionContract: contract }),
    null,
    2,
  );
  for (let i = 0; i < 9; i++) {
    const current = JSON.stringify(
      buildMomentumView({ task, effectiveExecutionContract: contract }),
      null,
      2,
    );
    assert.equal(current, first, `Run ${i + 2} produced different output`);
  }
});

test("output validates against momentumView schema", () => {
  const view = buildMomentumView({
    task: taskFixture(),
    effectiveExecutionContract: contractWithUpgrade(),
  });
  // validateContract throws if invalid — should not throw
  assert.doesNotThrow(() => validateContract("momentumView", view));
});
