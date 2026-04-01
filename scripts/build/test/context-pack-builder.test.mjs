/**
 * Context pack builder (Atom 4): mode-specific compaction + token estimates.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeImport } from "../lib/windows-safe-import.mjs";

const { resolveExecutionPolicy } = await safeImport(
  "../../../shared/contracts/resource-policy-types.mjs",
  import.meta.url,
);

const {
  estimateTokensFromString,
  estimatePackedTaskStateTokens,
  truncateStringToMaxTokens,
} = await safeImport(
  "../../../runtime/lib/token-estimate.mjs",
  import.meta.url,
);

const { buildContextPack, serializePackedTaskState } = await safeImport(
  "../../../runtime/lib/context-pack-builder.mjs",
  import.meta.url,
);

/** Large synthetic task: retrieval + multi-turn + artifact — forces ordering differences. */
function largeTaskState() {
  return {
    system_prompt: "sys:" + "s".repeat(400),
    messages: [
      { role: "user", content: "first:" + "u".repeat(1200) },
      { role: "assistant", content: "mid:" + "a".repeat(1200) },
      { role: "user", content: "last:" + "v".repeat(1200) },
    ],
    optional_retrieval: "retrieval:" + "r".repeat(2500),
    artifacts: [
      { title: "doc-a", body: "artifact:" + "b".repeat(2000) },
      { title: "doc-b", body: "more:" + "c".repeat(2000) },
    ],
  };
}

test("estimateTokensFromString uses char/4 heuristic", () => {
  assert.equal(estimateTokensFromString(""), 0);
  assert.equal(estimateTokensFromString("abcd"), 1);
  assert.equal(estimateTokensFromString("abcde"), 2);
});

test("truncateStringToMaxTokens shortens prefix to token budget", () => {
  const s = "a".repeat(100);
  assert.equal(truncateStringToMaxTokens(s, 10).length, 40);
  assert.ok(estimateTokensFromString(truncateStringToMaxTokens(s, 10)) <= 10);
});

test("under ceiling: no compaction, before equals after", () => {
  const policy = resolveExecutionPolicy({
    skillBudget: { mode: "subscription", max_input_tokens: 200_000 },
  });
  const task = {
    system_prompt: "hi",
    messages: [{ role: "user", content: "ok" }],
  };
  const before = estimatePackedTaskStateTokens(
    /** @type {import('../../../shared/contracts/resource-policy-types.mjs').PackedTaskState} */ (
      task
    ),
  );
  const out = buildContextPack({
    policy,
    planner: {
      context_ceiling_tokens: Math.max(before + 500, 50_000),
      optional_passes_included: true,
      model_tier: "sonnet",
    },
    taskState: task,
  });
  assert.equal(out.breakdown.estimated_input_tokens_before, before);
  assert.equal(out.breakdown.estimated_input_tokens_after, before);
  assert.equal(out.breakdown.compacted_from_tokens, 0);
  assert.equal(out.breakdown.omissions.length, 0);
  assert.ok(out.packed_text.includes("ok"));
});

test("subscription removes optional_retrieval before oldest messages", () => {
  const policy = resolveExecutionPolicy({
    skillBudget: { mode: "subscription", max_input_tokens: 100_000 },
  });
  const task = largeTaskState();
  const out = buildContextPack({
    policy,
    planner: {
      context_ceiling_tokens: 800,
      optional_passes_included: true,
      model_tier: "sonnet",
    },
    taskState: task,
  });
  assert.ok(out.breakdown.estimated_input_tokens_after <= 800);
  const kinds = out.breakdown.omissions.map((o) => o.kind);
  assert.ok(
    kinds.length > 0,
    "expected omissions when state exceeds low ceiling",
  );
  assert.equal(
    kinds[0],
    "optional_retrieval",
    "subscription should strip retrieval before message/artifact drops",
  );
});

test("api_key removes oldest messages before optional_retrieval", () => {
  const policy = resolveExecutionPolicy({
    skillBudget: { mode: "api_key", max_input_tokens: 100_000 },
  });
  const task = largeTaskState();
  const out = buildContextPack({
    policy,
    planner: {
      context_ceiling_tokens: 800,
      optional_passes_included: true,
      model_tier: "haiku",
    },
    taskState: task,
  });
  assert.ok(out.breakdown.estimated_input_tokens_after <= 800);
  const kinds = out.breakdown.omissions.map((o) => o.kind);
  assert.ok(kinds.length > 0);
  assert.equal(
    kinds[0],
    "message",
    "api_key should drop oldest messages before stripping retrieval",
  );
});

test("same large state: subscription vs api_key produce different first omission", () => {
  const task = largeTaskState();
  const sub = buildContextPack({
    policy: resolveExecutionPolicy({
      skillBudget: { mode: "subscription", max_input_tokens: 100_000 },
    }),
    planner: {
      context_ceiling_tokens: 900,
      optional_passes_included: true,
      model_tier: "sonnet",
    },
    taskState: task,
  });
  const api = buildContextPack({
    policy: resolveExecutionPolicy({
      skillBudget: { mode: "api_key", max_input_tokens: 100_000 },
    }),
    planner: {
      context_ceiling_tokens: 900,
      optional_passes_included: true,
      model_tier: "haiku",
    },
    taskState: task,
  });
  assert.notEqual(
    sub.breakdown.omissions[0]?.kind,
    api.breakdown.omissions[0]?.kind,
  );
  assert.notEqual(
    sub.breakdown.estimated_input_tokens_after,
    api.breakdown.estimated_input_tokens_after,
  );
});

test("hybrid: breakdown includes hybrid_second_pass_applied and respects ceiling", () => {
  const policy = resolveExecutionPolicy({
    skillBudget: { mode: "hybrid", max_input_tokens: 100_000 },
  });
  const task = largeTaskState();
  const out = buildContextPack({
    policy,
    planner: {
      context_ceiling_tokens: 400,
      optional_passes_included: true,
      model_tier: "sonnet",
    },
    taskState: task,
  });
  assert.equal(out.breakdown.mode, "hybrid");
  assert.equal(typeof out.breakdown.hybrid_second_pass_applied, "boolean");
  assert.ok(out.breakdown.estimated_input_tokens_after <= 400);
});

test("hybrid: huge single-field system compacts to ceiling (binary truncation)", () => {
  const policy = resolveExecutionPolicy({
    skillBudget: { mode: "hybrid", max_input_tokens: 100_000 },
  });
  const systemOnly = {
    system_prompt: "z".repeat(500_000),
    messages: [],
    optional_retrieval: "",
    artifacts: [],
  };
  const out = buildContextPack({
    policy,
    planner: {
      context_ceiling_tokens: 100,
      optional_passes_included: true,
      model_tier: "sonnet",
    },
    taskState: systemOnly,
  });
  assert.equal(out.breakdown.mode, "hybrid");
  assert.ok(out.breakdown.estimated_input_tokens_after <= 100);
});

test("planner.optional_passes_included false strips retrieval up front", () => {
  const policy = resolveExecutionPolicy({
    skillBudget: { mode: "subscription", max_input_tokens: 100_000 },
  });
  const task = {
    system_prompt: "s",
    messages: [{ role: "user", content: "u" }],
    optional_retrieval: "x".repeat(500),
    artifacts: [],
  };
  const out = buildContextPack({
    policy,
    planner: {
      context_ceiling_tokens: 50_000,
      optional_passes_included: false,
      model_tier: "sonnet",
    },
    taskState: task,
  });
  assert.equal(out.packed.optional_retrieval, "");
  assert.ok(
    out.breakdown.omissions.some((o) =>
      o.detail.includes("planner.optional_passes_included"),
    ),
  );
});

test("serializePackedTaskState joins sections", () => {
  const packed = {
    system_prompt: "S",
    messages: [{ role: "user", content: "U" }],
    optional_retrieval: "",
    artifacts: [{ title: "T", body: "B" }],
  };
  const s = serializePackedTaskState(
    /** @type {import('../../../shared/contracts/resource-policy-types.mjs').PackedTaskState} */ (
      packed
    ),
  );
  assert.ok(s.includes("S"));
  assert.ok(s.includes("user: U"));
  assert.ok(s.includes("T"));
});
