import fs from "node:fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runValidation() {
  console.log(
    "[store-signatures] Starting task command store signature validation...",
  );

  const dualWriteSource = await fs.readFile(
    "worker/src/dual-write-task-store.ts",
    "utf8",
  );
  const serviceSource = await fs.readFile(
    "runtime/lib/task-control-plane-service-core.mjs",
    "utf8",
  );

  for (const method of [
    "transitionState",
    "selectRoute",
    "appendFinding",
    "repairProjection",
  ]) {
    assert(
      dualWriteSource.includes(`async ${method}`),
      `DualWriteTaskStore missing method ${method}`,
    );
  }

  assert(
    dualWriteSource.includes('this.mode === "authoritative"'),
    "DualWriteTaskStore must enforce explicit authoritative mode",
  );

  for (const serviceMethod of [
    "transitionState",
    "selectRoute",
    "appendFinding",
  ]) {
    assert(
      serviceSource.includes(`${serviceMethod}(taskId,`),
      `Task control-plane service missing ${serviceMethod}`,
    );
  }

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
