import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

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
