import { test } from "node:test";
import assert from "node:assert/strict";
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

function contractFixture(overrides = {}) {
  return {
    schema_version: "1.0.0",
    task_id: "task_review_001",
    task_type: "review_repository",
    selected_route: {
      route_id: "pasted_diff",
      equivalence_level: "degraded",
      missing_capabilities: [],
    },
    equivalence_level: "degraded",
    missing_capabilities: [],
    required_inputs: ["diff_text"],
    computed_at: "2026-03-14T12:00:00.000Z",
    stronger_host_guidance:
      "Upgrade to route 'local_repo' when host supports: git.read, fs.read.",
    ...overrides,
  };
}

function findingFixture(overrides = {}) {
  return {
    schema_version: "1.0.0",
    finding_id: "finding-001",
    summary: "null pointer risk in webhook handler",
    evidence: ["No null check before access on line 42"],
    provenance: {
      schema_version: "1.0.0",
      status: "hypothesis",
      recorded_at: "2026-03-14T12:00:00.000Z",
      recorded_by_route: "pasted_diff",
    },
    ...overrides,
  };
}

test("onStart does not claim upgrade when stronger route is blocked by missing capabilities", () => {
  const narrator = createNarrator();
  const task = taskFixture();
  const contract = contractFixture();

  const result = narrator.onStart(task, contract);

  assert.ok(result.headline.includes("repository review"));
  assert.equal(result.strength.level, "limited");
  assert.equal(result.strength.label, "Diff-only review");
  assert.equal(result.upgrade, null);
  assert.match(
    result.progress,
    /Upgrade unavailable due to missing capability:/,
  );
  assert.ok(Array.isArray(result.findings));
});

test("onStart includes upgrade block when stronger equal route is already supported", () => {
  const narrator = createNarrator();
  const task = taskFixture({ current_route: "github_pr" });
  const contract = contractFixture({
    selected_route: {
      route_id: "local_repo",
      equivalence_level: "equal",
      missing_capabilities: [],
    },
    stronger_host_guidance: undefined,
  });

  const result = narrator.onStart(task, contract);
  assert.ok(result.upgrade);
  assert.ok(result.upgrade.now.includes("Full repository"));
  assert.equal(result.progress, null);
});

test("onStart produces correct strength for github_pr route", () => {
  const narrator = createNarrator();
  const task = taskFixture({ current_route: "github_pr" });
  const contract = contractFixture({
    selected_route: {
      route_id: "github_pr",
      equivalence_level: "degraded",
      missing_capabilities: [],
    },
  });

  const result = narrator.onStart(task, contract);

  assert.equal(result.strength.level, "degraded");
  assert.equal(result.strength.label, "PR metadata + diff");
});

test("onStart produces correct strength for uploaded_bundle route", () => {
  const narrator = createNarrator();
  const task = taskFixture({ current_route: "uploaded_bundle" });
  const contract = contractFixture({
    selected_route: {
      route_id: "uploaded_bundle",
      equivalence_level: "degraded",
      missing_capabilities: [],
    },
  });

  const result = narrator.onStart(task, contract);

  assert.equal(result.strength.level, "degraded");
  assert.equal(result.strength.label, "Uploaded snapshot");
});

test("onStart produces no upgrade block for local_repo (strongest route)", () => {
  const narrator = createNarrator();
  const task = taskFixture({ current_route: "local_repo" });
  const contract = contractFixture({
    selected_route: {
      route_id: "local_repo",
      equivalence_level: "equal",
      missing_capabilities: [],
    },
    stronger_host_guidance: undefined,
  });

  const result = narrator.onStart(task, contract);

  assert.equal(result.strength.level, "full");
  assert.equal(result.upgrade, null);
});

test("onResume with route upgrade shows before/after strength and findings", () => {
  const narrator = createNarrator();
  const findings = [findingFixture()];
  const task = taskFixture({
    current_route: "local_repo",
    findings,
  });
  const contract = contractFixture({
    selected_route: {
      route_id: "local_repo",
      equivalence_level: "equal",
      missing_capabilities: [],
    },
  });
  const previousContract = contractFixture({
    selected_route: {
      route_id: "pasted_diff",
      equivalence_level: "degraded",
      missing_capabilities: [],
    },
  });

  const result = narrator.onResume(task, contract, previousContract);

  assert.ok(result.headline.includes("repository review"));
  assert.ok(result.progress, "should have progress text");
  assert.ok(result.upgrade, "should have upgrade block showing transition");
  assert.ok(result.upgrade.before.includes("Diff-only"));
  assert.ok(result.upgrade.now.includes("Full repository"));
  assert.equal(result.findings.length, 1);
});

test("onResume without upgrade shows progress without upgrade block", () => {
  const narrator = createNarrator();
  const task = taskFixture({
    current_route: "pasted_diff",
    findings: [findingFixture()],
  });
  const contract = contractFixture();
  const previousContract = contractFixture(); // same route

  const result = narrator.onResume(task, contract, previousContract);

  assert.ok(result.headline);
  assert.ok(result.progress);
  assert.equal(result.upgrade, null);
});

test("onFindingEvolved produces correct narrative prefix for hypothesis → verified", () => {
  const narrator = createNarrator();
  const finding = findingFixture({
    provenance: {
      schema_version: "1.0.0",
      status: "verified",
      recorded_at: "2026-03-14T12:00:00.000Z",
      recorded_by_route: "local_repo",
    },
  });
  const task = taskFixture({ current_route: "local_repo" });

  const result = narrator.onFindingEvolved(
    task,
    finding,
    "hypothesis",
    "verified",
  );

  assert.ok(result.headline.includes("Confirmed"));
  assert.ok(result.headline.includes("null pointer"));
  assert.equal(result.findings[0].confidence_change.from, "hypothesis");
  assert.equal(result.findings[0].confidence_change.to, "verified");
});

test("onFindingEvolved produces correct narrative prefix for hypothesis → reused", () => {
  const narrator = createNarrator();
  const finding = findingFixture({
    provenance: {
      schema_version: "1.0.0",
      status: "reused",
      recorded_at: "2026-03-14T12:00:00.000Z",
      recorded_by_route: "pasted_diff",
    },
  });
  const task = taskFixture();

  const result = narrator.onFindingEvolved(
    task,
    finding,
    "hypothesis",
    "reused",
  );

  assert.ok(result.headline.includes("Previously identified"));
});

test("onUpgradeAvailable describes what becomes possible", () => {
  const narrator = createNarrator();
  const task = taskFixture({
    findings: [findingFixture(), findingFixture({ finding_id: "finding-002" })],
  });
  const currentContract = contractFixture();
  const availableContract = contractFixture({
    selected_route: {
      route_id: "local_repo",
      equivalence_level: "equal",
      missing_capabilities: [],
    },
  });

  const result = narrator.onUpgradeAvailable(
    task,
    currentContract,
    availableContract,
  );

  assert.ok(result.headline.includes("2"));
  assert.ok(result.upgrade, "should have upgrade block");
  assert.ok(result.upgrade.unlocks.includes("verify call sites"));
  assert.equal(result.findings.length, 2);
});

test("onUpgradeAvailable does not emit upgrade block when guidance is blocked by missing capability", () => {
  const narrator = createNarrator();
  const task = taskFixture({ current_route: "github_pr" });
  const blockedContract = contractFixture({
    selected_route: {
      route_id: "github_pr",
      equivalence_level: "degraded",
      missing_capabilities: [],
    },
    stronger_host_guidance:
      "Upgrade to route 'local_repo' when host supports: local_fs, local_shell, local_repo.",
  });

  const result = narrator.onUpgradeAvailable(task, blockedContract, null);
  assert.equal(result.upgrade, null);
  assert.match(
    result.progress,
    /Upgrade unavailable due to missing capability:/,
  );
});

test("narrator returns valid structured output shape", () => {
  const narrator = createNarrator();
  const task = taskFixture();
  const contract = contractFixture();

  const result = narrator.onStart(task, contract);

  assert.equal(typeof result.headline, "string");
  assert.ok(result.strength && typeof result.strength === "object");
  assert.ok("level" in result.strength);
  assert.ok("label" in result.strength);
  assert.ok("description" in result.strength);
  assert.ok(Array.isArray(result.findings));
  assert.ok("next_action" in result);
  assert.ok("progress" in result);
  assert.ok("upgrade" in result);
});

test("onShelfView produces entries for multiple tasks", () => {
  const narrator = createNarrator();
  const tasks = [
    taskFixture({ task_id: "task_001", findings: [findingFixture()] }),
    taskFixture({
      task_id: "task_002",
      current_route: "local_repo",
      findings: [],
    }),
  ];

  const result = narrator.onShelfView(tasks, {});

  assert.equal(result.length, 2);
  assert.ok(result[0].task_id);
  assert.ok(result[0].headline);
  assert.ok(result[0].continuation_reason);
  assert.ok(result[0].environment_fit);
});

test("onShelfView does not claim upgrade when stronger route capability is unsupported", () => {
  const narrator = createNarrator();
  const tasks = [
    taskFixture({
      task_id: "task_blocked_upgrade",
      current_route: "github_pr",
    }),
  ];

  const capabilityProfile = {
    capabilities: {
      network_http: "supported",
      local_fs: "unsupported",
      local_shell: "unsupported",
      local_repo: "unsupported",
    },
  };

  const result = narrator.onShelfView(tasks, capabilityProfile);

  assert.equal(result.length, 1);
  assert.equal(result[0].environment_fit, "neutral");
  assert.match(
    result[0].continuation_reason,
    /Upgrade unavailable due to missing capability:/,
  );
});

test("onShelfView advertises upgrade when stronger route capability is supported", () => {
  const narrator = createNarrator();
  const tasks = [
    taskFixture({
      task_id: "task_upgrade_available",
      current_route: "github_pr",
    }),
  ];

  const capabilityProfile = {
    capabilities: {
      network_http: "supported",
      local_fs: "supported",
      local_shell: "supported",
      local_repo: "supported",
    },
  };

  const result = narrator.onShelfView(tasks, capabilityProfile);
  assert.equal(result.length, 1);
  assert.equal(result[0].environment_fit, "strong");
  assert.match(
    result[0].headline,
    /ready for verification with Full repository access/,
  );
});

test("finding narrative uses Possible prefix for hypothesis status", () => {
  const narrator = createNarrator();
  const task = taskFixture({ findings: [findingFixture()] });
  const contract = contractFixture();

  const result = narrator.onStart(task, contract);

  assert.ok(result.findings[0].narrative.startsWith("Possible"));
});

test("finding narrative uses Confirmed prefix for verified status", () => {
  const narrator = createNarrator();
  const verifiedFinding = findingFixture({
    provenance: {
      schema_version: "1.0.0",
      status: "verified",
      recorded_at: "2026-03-14T12:00:00.000Z",
      recorded_by_route: "local_repo",
    },
  });
  const task = taskFixture({
    current_route: "local_repo",
    findings: [verifiedFinding],
  });
  const contract = contractFixture({
    selected_route: {
      route_id: "local_repo",
      equivalence_level: "equal",
      missing_capabilities: [],
    },
  });

  const result = narrator.onStart(task, contract);

  assert.ok(result.findings[0].narrative.startsWith("Confirmed"));
});
