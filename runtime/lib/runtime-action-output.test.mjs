import test from "node:test";
import assert from "node:assert/strict";
import { parseRuntimeActionOutput } from "./runtime-action-output.mjs";

test("parses manifest status into typed tooling and capability data", () => {
  const output = `==> Runtime manifest status\nDevice: host-a\nLast synced: 2026-03-26T00:00:00Z\n\nFeature flags:\n  outcome_resolution_enabled: true\n  effective_contract_required: false\n\nTracked tools:\n  sync-subsystem: synced (updated: 2026-03-26T00:00:01Z)`;

  const parsed = parseRuntimeActionOutput("list_tools", output);
  assert.equal(parsed.schemaIds.includes("tooling.manifest"), true);
  assert.equal(parsed.data["tooling.manifest"].device, "host-a");
  assert.equal(
    parsed.data["runtime.capabilities"].feature_flags
      .outcome_resolution_enabled,
    true,
  );
  assert.equal(parsed.capability.worker_backed, true);
});

test("parses context cost summary", () => {
  const output = `==> Summary\n   Total tokens: 1234\n   Threshold:    2000 tokens/skill\n   Skills over threshold: 1`;
  const parsed = parseRuntimeActionOutput("context_cost", output);
  assert.equal(parsed.schemaIds[0], "runtime.context_cost");
  assert.equal(parsed.data["runtime.context_cost"].total_tokens, 1234);
});
