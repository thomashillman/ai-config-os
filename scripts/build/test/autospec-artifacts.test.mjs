import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const AUTOSPEC_DIR = resolve(
  REPO_ROOT,
  "docs",
  "autospec",
  "review-repository",
);

const files = {
  spec: resolve(AUTOSPEC_DIR, "spec.yaml"),
  plan: resolve(AUTOSPEC_DIR, "plan.yaml"),
  tasks: resolve(AUTOSPEC_DIR, "tasks.yaml"),
  acceptance: resolve(AUTOSPEC_DIR, "acceptance.yaml"),
};

function parseYaml(path) {
  const raw = readFileSync(path, "utf8");
  return YAML.parse(raw);
}

test("autospec artifacts exist for review_repository MVA", () => {
  for (const [name, path] of Object.entries(files)) {
    assert.ok(existsSync(path), `Expected ${name}.yaml at ${path}`);
    const content = readFileSync(path, "utf8").trim();
    assert.ok(content.length > 0, `${name}.yaml should not be empty`);
  }
});

test("spec defines review_repository routes, primitives, and metrics", () => {
  const spec = parseYaml(files.spec);
  assert.equal(spec.task_type, "review_repository");
  assert.equal(spec.version, "0.7.0");
  assert.equal(spec.source_of_truth.plan_md, "PLAN.md");

  const routes = new Set(spec.routes);
  assert.deepEqual(
    routes,
    new Set(["github_pr", "pasted_diff", "uploaded_bundle", "local_repo"]),
  );

  assert.ok(Array.isArray(spec.primitives));
  assert.ok(spec.primitives.includes("PortableTaskObject"));
  assert.ok(spec.primitives.includes("HandoffToken"));
  assert.equal(spec.success_metrics.length, 7);
});

test("tasks enumerate deterministic T001-T020 sequence with status guardrails", () => {
  const tasksDoc = parseYaml(files.tasks);
  assert.ok(
    Array.isArray(tasksDoc.tasks),
    "tasks.yaml must contain a tasks array",
  );
  assert.equal(
    tasksDoc.tasks.length,
    20,
    "Expected exactly 20 MVA tasks (T001-T020)",
  );

  const expectedIds = Array.from(
    { length: 20 },
    (_, index) => `T${String(index + 1).padStart(3, "0")}`,
  );
  const actualIds = tasksDoc.tasks.map((task) => task.id);
  assert.deepEqual(
    actualIds,
    expectedIds,
    "Task IDs must be sequential and deterministic",
  );

  const validStatuses = new Set(["todo", "done"]);
  for (const task of tasksDoc.tasks) {
    assert.ok(
      validStatuses.has(task.status),
      `Unexpected status for ${task.id}: ${task.status}`,
    );
    assert.ok(
      ["week_1", "week_2", "week_3"].includes(task.sprint),
      `${task.id} has invalid sprint`,
    );
  }

  const doneIds = tasksDoc.tasks
    .filter((task) => task.status === "done")
    .map((task) => task.id);
  const firstTodoIndex = tasksDoc.tasks.findIndex(
    (task) => task.status === "todo",
  );
  const expectedDonePrefix = (
    firstTodoIndex === -1
      ? tasksDoc.tasks
      : tasksDoc.tasks.slice(0, firstTodoIndex)
  ).map((task) => task.id);
  assert.deepEqual(
    doneIds,
    expectedDonePrefix,
    "Done tasks must form a contiguous prefix from T001",
  );
});

test("plan sprint task mapping stays consistent with tasks.yaml", () => {
  const plan = parseYaml(files.plan);
  const tasksDoc = parseYaml(files.tasks);

  assert.ok(Array.isArray(plan.sprints));
  assert.equal(plan.sprints.length, 3);

  const bySprint = new Map();
  for (const task of tasksDoc.tasks) {
    if (!bySprint.has(task.sprint)) bySprint.set(task.sprint, []);
    bySprint.get(task.sprint).push(task.id);
  }

  for (const sprint of plan.sprints) {
    assert.ok(
      Array.isArray(sprint.task_ids),
      `${sprint.id} must define task_ids`,
    );
    assert.deepEqual(
      sprint.task_ids,
      bySprint.get(sprint.id),
      `${sprint.id} task_ids mismatch tasks.yaml`,
    );
  }
});

test("acceptance defines end-to-end flow and provenance checks", () => {
  const acceptance = parseYaml(files.acceptance);

  assert.ok(Array.isArray(acceptance.scenarios));
  assert.ok(acceptance.scenarios.some((s) => s.id === "A001"));
  const e2e = acceptance.scenarios.find((s) => s.id === "A001");
  assert.ok(e2e.checks.includes("findings_provenance_preserved"));
  assert.ok(e2e.checks.includes("no_user_restatement_required"));
});
