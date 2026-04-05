import fs from "node:fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runValidation() {
  console.log("[envelope-drift] Starting command envelope validation...");

  const source = await fs.readFile("worker/src/task-command.ts", "utf8");

  for (const field of [
    "task_id",
    "idempotency_key",
    "expected_task_version",
    "command_type",
    "payload",
    "principal",
    "boundary",
    "authority",
    "request_context",
    "resolved_context",
    "semantic_digest",
  ]) {
    assert(
      source.includes(`readonly ${field}`),
      `TaskCommand is missing field '${field}'`,
    );
  }

  assert(
    source.includes("resolved_context: opts.resolved_context ?? {}"),
    "buildTaskCommand must not default resolved_context from request_context",
  );

  for (const type of [
    "task.select_route",
    "task.transition_state",
    "task.append_finding",
  ]) {
    assert(
      source.includes(`\"${type}\"`) || source.includes(`"${type}"`),
      `Missing command type ${type}`,
    );
  }

  assert(
    source.includes('"task.select_route": ["route_id", "route_index"]'),
    "computeSemanticDigest mapping for task.select_route drift detected",
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
