/**
 * Resource use analytics contract + execution-resource observation source (Atom 5).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { safeImport } from "../lib/windows-safe-import.mjs";

const { buildResourceUseContract } = await safeImport(
  "../../../runtime/lib/dashboard-analytics-contracts.mjs",
  import.meta.url,
);

const { loadExecutionResourceObservations } = await safeImport(
  "../../../runtime/lib/observation-sources/execution-resource.mjs",
  import.meta.url,
);

test("buildResourceUseContract empty events", () => {
  const c = buildResourceUseContract([]);
  assert.equal(c.contract, "analytics.resource_use");
  assert.equal(c.total_events, 0);
  assert.equal(c.by_mode.subscription.count, 0);
});

test("buildResourceUseContract aggregates by mode", () => {
  const events = [
    {
      type: "execution_resource",
      user_mode: "subscription",
      pressure_score: 0.5,
      packed_context_tokens: 4000,
      throttle_detected: 1,
    },
    {
      type: "execution_resource",
      user_mode: "api_key",
      estimated_cost_minor: 12,
      packed_context_tokens: 2000,
    },
    {
      type: "execution_resource",
      user_mode: "hybrid",
      pressure_score: 0.2,
      estimated_cost_minor: 5,
      packed_context_tokens: 3000,
    },
    { type: "tool_usage", tool_name: "x" },
  ];
  const c = buildResourceUseContract(events);
  assert.equal(c.total_events, 3);
  assert.equal(c.by_mode.subscription.count, 1);
  assert.equal(c.by_mode.api_key.count, 1);
  assert.equal(c.by_mode.hybrid.count, 1);
  assert.equal(c.by_mode.subscription.avg_pressure_score, 0.5);
  assert.equal(c.by_mode.api_key.total_estimated_cost_minor, 12);
  assert.ok(c.by_mode.hybrid.avg_packed_context_tokens > 0);
});

test("loadExecutionResourceObservations reads JSONL file", () => {
  const dir = mkdtempSync(join(tmpdir(), "exec-res-"));
  const filePath = join(dir, "execution-resource.jsonl");
  try {
    writeFileSync(
      filePath,
      [
        JSON.stringify({
          user_mode: "subscription",
          pressure_score: 0.7,
        }),
        JSON.stringify({ user_mode: "invalid", pressure_score: 1 }),
        "",
      ].join("\n"),
      "utf8",
    );
    const ev = loadExecutionResourceObservations({ filePath, limit: 10 });
    assert.equal(ev.length, 2);
    assert.equal(ev[0].type, "execution_resource");
    assert.equal(ev[0].user_mode, "subscription");
    assert.equal(ev[1].user_mode, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
