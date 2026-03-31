// Tests for worker/src/validation/tasks.ts
// Follows the same transpile pattern as worker-task-runtime.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// Try direct import first; fall back to TypeScript transpile
const mod = await import("../../../worker/src/validation/tasks.ts").catch(
  async () => {
    const ts = await import("typescript");
    const { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } =
      await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { pathToFileURL } = await import("node:url");

    const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
    const sourcePath = join(repoRoot, "worker/src/validation/tasks.ts");
    const src = readFileSync(sourcePath, "utf8");

    const out = ts.transpileModule(src, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;

    const temp = mkdtempSync(join(tmpdir(), "worker-task-validators-"));
    writeFileSync(
      join(temp, "package.json"),
      JSON.stringify({ type: "module" }),
    );
    mkdirSync(join(temp, "src"), { recursive: true });
    mkdirSync(join(temp, "src", "validation"), { recursive: true });
    writeFileSync(join(temp, "src", "validation", "tasks.js"), out);
    const loaded = await import(
      pathToFileURL(join(temp, "src", "validation", "tasks.js")).href
    );
    rmSync(temp, { recursive: true, force: true });
    return loaded;
  },
);

const {
  validateTaskCreatePayload,
  validateTaskStatePayload,
  validateRouteSelectionPayload,
  validateContinuationPayload,
  validateAppendFindingPayload,
  validateTransitionFindingsPayload,
} = mod;

test("validateTaskCreatePayload rejects non-object (null)", () => {
  const r = validateTaskCreatePayload(null);
  assert.equal(r.ok, false);
  assert.ok(r.error.toLowerCase().includes("object"));
});

test("validateTaskCreatePayload rejects arrays", () => {
  const r = validateTaskCreatePayload([1, 2, 3]);
  assert.equal(r.ok, false);
});

test("validateTaskCreatePayload accepts plain object", () => {
  const r = validateTaskCreatePayload({ task_type: "review_repository" });
  assert.equal(r.ok, true);
});

test("validateTaskStatePayload rejects missing expected_version", () => {
  const r = validateTaskStatePayload({
    next_state: "active",
    next_action: "review",
    updated_at: new Date().toISOString(),
  });
  assert.equal(r.ok, false);
  assert.ok(r.error.includes("expected_version"));
});

test("validateTaskStatePayload rejects non-ISO updated_at", () => {
  const r = validateTaskStatePayload({
    expected_version: 1,
    next_state: "active",
    next_action: "review",
    updated_at: "not-a-date",
  });
  assert.equal(r.ok, false);
  assert.ok(r.error.includes("updated_at"));
});

test("validateTaskStatePayload accepts valid payload", () => {
  const r = validateTaskStatePayload({
    expected_version: 1,
    next_state: "active",
    next_action: "review",
    updated_at: new Date().toISOString(),
  });
  assert.equal(r.ok, true);
});

test("validateRouteSelectionPayload rejects empty route_id", () => {
  const r = validateRouteSelectionPayload({
    expected_version: 1,
    route_id: "",
    selected_at: new Date().toISOString(),
  });
  assert.equal(r.ok, false);
  assert.ok(r.error.includes("route_id"));
});

test("validateContinuationPayload rejects missing handoff_token", () => {
  const r = validateContinuationPayload({ effective_execution_contract: {} });
  assert.equal(r.ok, false);
  assert.ok(r.error.includes("handoff_token"));
});

test("validateAppendFindingPayload rejects non-object finding", () => {
  const r = validateAppendFindingPayload({
    expected_version: 1,
    finding: "not-an-object",
    updated_at: new Date().toISOString(),
  });
  assert.equal(r.ok, false);
  assert.ok(r.error.includes("finding"));
});

test("validateTransitionFindingsPayload accepts valid payload", () => {
  const r = validateTransitionFindingsPayload({
    expected_version: 1,
    to_route_id: "local_repo",
    upgraded_at: new Date().toISOString(),
    to_equivalence_level: "full",
  });
  assert.equal(r.ok, true);
});
