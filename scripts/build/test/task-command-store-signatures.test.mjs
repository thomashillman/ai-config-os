import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

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
