import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function getClassMethodNames(sourceFile, className) {
  const names = new Set();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isClassDeclaration(statement) ||
      statement.name?.text !== className
    ) {
      continue;
    }
    for (const member of statement.members) {
      if (
        ts.isMethodDeclaration(member) &&
        member.name &&
        ts.isIdentifier(member.name)
      ) {
        names.add(member.name.text);
      }
    }
  }
  return names;
}

async function validateDualWriteSurface(sourcePath) {
  const source = await fs.readFile(sourcePath, "utf8");
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.ES2020,
    true,
    ts.ScriptKind.TS,
  );

  const methodNames = getClassMethodNames(sourceFile, "DualWriteTaskStore");
  for (const method of [
    "transitionState",
    "selectRoute",
    "appendFinding",
    "repairProjection",
  ]) {
    assert(
      methodNames.has(method),
      `DualWriteTaskStore missing method '${method}'`,
    );
  }

  assert(
    source.includes('this.mode === "authoritative"'),
    "DualWriteTaskStore must enforce explicit authoritative mode",
  );
}

async function validateServiceContract(servicePath) {
  const { createTaskControlPlaneServiceCore } = await import(
    pathToFileUrl(servicePath)
  );
  assert(
    typeof createTaskControlPlaneServiceCore === "function",
    "service core must export createTaskControlPlaneServiceCore",
  );

  const calls = [];
  const taskStore = {
    create: async () => ({}),
    load: async () => ({}),
    transitionState: async (...args) => {
      calls.push(["transitionState", args]);
      return {};
    },
    selectRoute: async (...args) => {
      calls.push(["selectRoute", args]);
      return {};
    },
    appendFinding: async (...args) => {
      calls.push(["appendFinding", args]);
      return {};
    },
    createContinuationPackage: async () => ({}),
    listProgressEvents: async () => [],
    getReadinessView: async () => ({}),
    listSnapshots: async () => [],
    getSnapshot: async () => ({}),
    repairProjection: async () => ({}),
  };

  const service = createTaskControlPlaneServiceCore({ taskStore });
  assert(
    typeof service.transitionState === "function",
    "missing transitionState",
  );
  assert(typeof service.selectRoute === "function", "missing selectRoute");
  assert(typeof service.appendFinding === "function", "missing appendFinding");

  const envelope = { command_type: "task.select_route" };
  await service.selectRoute(
    "task-1",
    {
      expected_version: 2,
      route_id: "local_repo",
      selected_at: "2026-04-05T00:00:00.000Z",
    },
    envelope,
  );
  const selectRouteCall = calls.find(([name]) => name === "selectRoute");
  assert(
    selectRouteCall,
    "service.selectRoute must call taskStore.selectRoute",
  );
  assert(
    selectRouteCall[1][2] === envelope,
    "service.selectRoute must pass through command envelope",
  );
}

function pathToFileUrl(filePath) {
  return new URL(`file://${path.resolve(filePath)}`);
}

async function runValidation() {
  console.log(
    "[store-signatures] Starting task command store signature validation...",
  );

  const dualWritePath = process.env.DUAL_WRITE_SOURCE
    ? path.resolve(process.env.DUAL_WRITE_SOURCE)
    : path.resolve("worker/src/dual-write-task-store.ts");
  const serviceCorePath = process.env.SERVICE_CORE_SOURCE
    ? path.resolve(process.env.SERVICE_CORE_SOURCE)
    : path.resolve("runtime/lib/task-control-plane-service-core.mjs");

  await validateDualWriteSurface(dualWritePath);
  await validateServiceContract(serviceCorePath);

  console.log(
    "[store-signatures] ✓ Live task command store signatures validated",
  );
}

runValidation()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[store-signatures] ✗ Validation failed:");
    console.error(
      `  - ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
