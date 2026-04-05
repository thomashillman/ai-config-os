import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadTaskCommandModule(sourcePath) {
  const source = await fs.readFile(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });

  const exports = {};
  const module = { exports };
  const context = {
    module,
    exports,
    require() {
      throw new Error("task-command validator does not allow runtime requires");
    },
    TextEncoder,
    console,
  };
  vm.runInNewContext(transpiled.outputText, context, {
    filename: sourcePath,
  });
  return module.exports;
}

async function runValidation() {
  console.log("[envelope-drift] Starting command envelope validation...");
  const sourcePath = process.env.TASK_COMMAND_SOURCE
    ? path.resolve(process.env.TASK_COMMAND_SOURCE)
    : path.resolve("worker/src/task-command.ts");
  const taskCommand = await loadTaskCommandModule(sourcePath);

  assert(
    typeof taskCommand.buildTaskCommand === "function",
    "buildTaskCommand must be exported",
  );
  assert(
    typeof taskCommand.computeSemanticDigest === "function",
    "computeSemanticDigest must be exported",
  );
  assert(
    Array.isArray(taskCommand.TASK_COMMAND_TYPES),
    "TASK_COMMAND_TYPES must be exported",
  );

  for (const type of [
    "task.select_route",
    "task.transition_state",
    "task.append_finding",
  ]) {
    assert(
      taskCommand.TASK_COMMAND_TYPES.includes(type),
      `TASK_COMMAND_TYPES is missing '${type}'`,
    );
  }

  const command = taskCommand.buildTaskCommand({
    task_id: "task-1",
    idempotency_key: "idem-1",
    expected_task_version: 2,
    command_type: "task.select_route",
    payload: {
      route_id: "local_repo",
      route_index: 0,
      updated_at: "2026-04-05T00:00:00.000Z",
    },
    principal: { principal_type: "user", principal_id: "u1" },
    boundary: { owner_principal_id: "u1", workspace_id: "ws1" },
    authority: {
      authority_mode: "direct_owner",
      allowed_actions: ["task.select_route"],
      stamped_at: "2026-04-05T00:00:00.000Z",
    },
    request_context: { route_id: "local_repo" },
  });

  assert(command.task_id === "task-1", "buildTaskCommand must keep task_id");
  assert(
    command.resolved_context &&
      typeof command.resolved_context === "object" &&
      Object.keys(command.resolved_context).length === 0,
    "buildTaskCommand must default resolved_context to an empty object",
  );
  assert(
    typeof command.semantic_digest === "string" &&
      /^[a-f0-9]{64}$/.test(command.semantic_digest),
    "buildTaskCommand must emit sha256 hex semantic_digest",
  );

  const digestA = taskCommand.computeSemanticDigest("task.select_route", {
    route_id: "local_repo",
    route_index: 0,
    selected_at: "2026-04-05T00:00:00.000Z",
  });
  const digestB = taskCommand.computeSemanticDigest("task.select_route", {
    route_id: "local_repo",
    route_index: 0,
    selected_at: "2026-04-05T00:00:01.000Z",
  });
  assert(
    digestA === digestB,
    "semantic digest must ignore volatile fields for task.select_route",
  );

  console.log(
    "[envelope-drift] ✓ Command envelope contract matches live module behavior",
  );
}

runValidation()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[envelope-drift] ✗ Validation failed:");
    console.error(
      `  - ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
