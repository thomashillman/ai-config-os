import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("task-command-envelope validator uses live modules", () => {
  const output = execFileSync(
    "node",
    ["scripts/validate/task-command-envelope-drift.mjs"],
    {
      encoding: "utf8",
    },
  );

  assert.match(output, /Starting command envelope validation/);
  assert.match(output, /matches live module behavior/);
});

test("task-command-envelope validator fails when live behavior drifts", async () => {
  const sourcePath = path.resolve("worker/src/task-command.ts");
  const source = await fs.readFile(sourcePath, "utf8");
  const driftedSource = source.replace(
    "resolved_context: opts.resolved_context ?? {},",
    "resolved_context: opts.request_context,",
  );
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "task-command-envelope-drift-"),
  );
  const tempFile = path.join(tempDir, "task-command.ts");
  await fs.writeFile(tempFile, driftedSource, "utf8");

  assert.throws(
    () =>
      execFileSync(
        "node",
        ["scripts/validate/task-command-envelope-drift.mjs"],
        {
          encoding: "utf8",
          env: { ...process.env, TASK_COMMAND_SOURCE: tempFile },
        },
      ),
    /Validation failed/,
  );
});
