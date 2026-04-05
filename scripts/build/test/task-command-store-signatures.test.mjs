import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("task-command-store signatures validator uses live contracts", () => {
  const output = execFileSync(
    "node",
    ["scripts/validate/task-command-store-signatures.mjs"],
    {
      encoding: "utf8",
    },
  );

  assert.match(output, /Starting task command store signature validation/);
  assert.match(output, /Live task command store signatures validated/);
});

test("task-command-store signatures validator fails when store surface drifts", async () => {
  const sourcePath = path.resolve("worker/src/dual-write-task-store.ts");
  const source = await fs.readFile(sourcePath, "utf8");
  const driftedSource = source.replace(
    "async repairProjection(",
    "async repairProjectionDrifted(",
  );
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "task-command-store-signatures-"),
  );
  const tempFile = path.join(tempDir, "dual-write-task-store.ts");
  await fs.writeFile(tempFile, driftedSource, "utf8");

  assert.throws(
    () =>
      execFileSync(
        "node",
        ["scripts/validate/task-command-store-signatures.mjs"],
        {
          encoding: "utf8",
          env: { ...process.env, DUAL_WRITE_SOURCE: tempFile },
        },
      ),
    /Validation failed/,
  );
});
